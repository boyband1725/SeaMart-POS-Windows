-- SeaMart POS Web - Supabase schema
-- Jalankan seluruh file ini di Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'SeaMart',
  created_at timestamptz not null default now()
);

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'cashier' check (role in ('owner','cashier')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(store_id, name),
  unique(store_id, id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  barcode text not null default '',
  name text not null,
  category_id uuid,
  price numeric(14,2) not null default 0 check (price >= 0),
  stock numeric(14,3) not null default 0 check (stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, code),
  unique(store_id, barcode),
  foreign key (store_id, category_id) references public.categories(store_id, id)
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  receipt_no text not null,
  cashier_id uuid not null references auth.users(id),
  payment_method text not null check (payment_method in ('Tunai','QRIS')),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  total numeric(14,2) not null check (total >= 0),
  paid numeric(14,2) not null check (paid >= total),
  change_amount numeric(14,2) not null default 0 check (change_amount >= 0),
  created_at timestamptz not null default now(),
  unique(store_id, receipt_no)
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid not null,
  product_id uuid not null,
  product_code text not null,
  product_name text not null,
  barcode text not null default '',
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  foreign key (store_id, sale_id) references public.sales(store_id, id) on delete cascade,
  foreign key (store_id, product_id) references public.products(store_id, id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  movement_type text not null check (movement_type in ('Masuk','Keluar','Penjualan','Penyesuaian')),
  qty numeric(14,3) not null check (qty > 0),
  note text not null default '',
  reference_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (store_id, product_id) references public.products(store_id, id)
);

create table if not exists public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  entry_type text not null check (entry_type in ('Masuk','Keluar')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists products_store_name_idx on public.products(store_id, name);
create index if not exists products_store_barcode_idx on public.products(store_id, barcode);
create index if not exists sales_store_created_idx on public.sales(store_id, created_at desc);
create index if not exists sale_items_store_sale_idx on public.sale_items(store_id, sale_id);
create index if not exists stock_movements_store_created_idx on public.stock_movements(store_id, created_at desc);

create or replace function public.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = p_store_id and m.user_id = auth.uid()
  );
$$;

alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cash_entries enable row level security;

create policy "members read stores" on public.stores for select to authenticated
using (public.is_store_member(id));
create policy "members read membership" on public.store_members for select to authenticated
using (user_id = auth.uid() or public.is_store_member(store_id));

create policy "members manage categories" on public.categories for all to authenticated
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "members manage products" on public.products for all to authenticated
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "members read sales" on public.sales for select to authenticated
using (public.is_store_member(store_id));
create policy "members read sale items" on public.sale_items for select to authenticated
using (public.is_store_member(store_id));
create policy "members read stock movements" on public.stock_movements for select to authenticated
using (public.is_store_member(store_id));
create policy "members manage cash entries" on public.cash_entries for all to authenticated
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- Checkout is atomic: validate stock, create sale and lines, then reduce stock.
create or replace function public.checkout_sale(
  p_store_id uuid,
  p_receipt_no text,
  p_payment_method text,
  p_paid numeric,
  p_items jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty numeric(14,3);
  v_price numeric(14,2);
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'Akses toko ditolak';
  end if;
  if p_payment_method not in ('Tunai','QRIS') then
    raise exception 'Metode pembayaran tidak valid';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid and store_id = p_store_id and active = true
    for update;
    if not found then raise exception 'Barang tidak ditemukan atau nonaktif'; end if;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty <= 0 or v_product.stock < v_qty then
      raise exception 'Stok tidak cukup untuk barang %', v_product.name;
    end if;
    v_price := v_product.price;
    v_subtotal := v_subtotal + (v_price * v_qty);
  end loop;

  v_total := v_subtotal;
  if p_paid < v_total then raise exception 'Pembayaran kurang'; end if;
  if p_payment_method = 'QRIS' and p_paid <> v_total then
    raise exception 'Nominal QRIS harus sama dengan total';
  end if;

  insert into public.sales(id,store_id,receipt_no,cashier_id,payment_method,subtotal,total,paid,change_amount)
  values(v_sale_id,p_store_id,p_receipt_no,auth.uid(),p_payment_method,v_subtotal,v_total,p_paid,p_paid-v_total);

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid and store_id = p_store_id
    for update;
    v_qty := (v_item->>'qty')::numeric;
    v_price := v_product.price;

    insert into public.sale_items(store_id,sale_id,product_id,product_code,product_name,barcode,qty,unit_price,line_total)
    values(p_store_id,v_sale_id,v_product.id,v_product.code,v_product.name,v_product.barcode,v_qty,v_price,v_qty*v_price);

    update public.products set stock = stock-v_qty, updated_at=now()
    where id=v_product.id and store_id=p_store_id;

    insert into public.stock_movements(store_id,product_id,movement_type,qty,note,reference_id,created_by)
    values(p_store_id,v_product.id,'Penjualan',v_qty,'Penjualan '+p_receipt_no,v_sale_id,auth.uid());
  end loop;

  return v_sale_id;
end;
$$;

grant execute on function public.is_store_member(uuid) to authenticated;
grant execute on function public.checkout_sale(uuid,text,text,numeric,jsonb) to authenticated;
