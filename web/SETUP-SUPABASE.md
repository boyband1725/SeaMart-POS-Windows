# Menyiapkan database online SeaMart

## 1. Buat project Supabase
1. Buka https://supabase.com dan daftar / masuk.
2. Pilih **New project**.
3. Nama project: **SeaMart POS**.
4. Simpan password database di tempat aman.
5. Tunggu sampai project selesai dibuat.

## 2. Buat tabel SeaMart
1. Di dashboard Supabase, buka **SQL Editor**.
2. Pilih **New query**.
3. Buka file `supabase-schema.sql` di folder ini, salin seluruh isinya.
4. Tempel di SQL Editor, lalu klik **Run**.
5. Pastikan tidak ada pesan error.

## 3. Buat akun pemilik
1. Buka **Authentication → Users**.
2. Klik **Add user**, masukkan email dan password pemilik SeaMart.
3. Salin User UID akun tersebut.

## 4. Buat toko dan kaitkan akun pemilik
Di SQL Editor, jalankan perintah berikut. Ganti UID di bawah dengan User UID milik akun pemilik:

```sql
with new_store as (
  insert into public.stores(name) values ('SeaMart') returning id
)
insert into public.store_members(store_id,user_id,role)
select id, 'GANTI-DENGAN-USER-UID'::uuid, 'owner'
from new_store;
```

## 5. Ambil konfigurasi publik
Buka **Project Settings → API**. Catat:
- Project URL
- Publishable key (atau anon key lama)

Kirim hanya dua nilai tersebut di chat ini agar saya bisa sambungkan antarmuka web. **Jangan kirim service_role key, secret key, atau password database.**

## Catatan
- Struktur ini menyiapkan toko, anggota (owner/kasir), kategori, barang, transaksi, detail transaksi, mutasi stok, dan kas masuk/keluar.
- Fungsi checkout menyimpan transaksi dan mengurangi stok dalam satu transaksi database.
- Login dan sinkronisasi belum aktif di tampilan web sampai konfigurasi project Supabase disambungkan.
