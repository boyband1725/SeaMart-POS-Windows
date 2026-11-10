/* SeaMart Supabase connection (publishable key is safe for browser use). */
(function(){
  const URL='https://kvavvulwrrxfqtihmfnu.supabase.co';
  const KEY='sb_publishable_Pb_d6PJahuegzMdGVPjeOQ_jw8OQoqV';
  let client=null, storeId=null, syncTimer=null, syncing=false;
  function db(){ if(!window.supabase) throw new Error('Library Supabase belum termuat. Periksa koneksi internet.'); if(!client) client=window.supabase.createClient(URL,KEY); return client; }
  function setStatus(message){ let el=document.getElementById('cloudStatus'); if(el) el.textContent=message; }
  function showPasswordRecovery(){
    const card=document.querySelector('.login-card');
    if(!card||document.getElementById('recoveryForm'))return;
    card.innerHTML='<div class="login-brand"><div><h1>Atur Password Baru</h1><div class="sub">Buat password baru untuk akun SeaMart</div></div></div><form id="recoveryForm"><label>Password baru<input id="newPassword" type="password" minlength="8" required autocomplete="new-password"></label><label>Ulangi password<input id="confirmPassword" type="password" minlength="8" required autocomplete="new-password"></label><div id="recoveryError" role="alert" style="color:#b42318;margin:10px 0"></div><button class="primary" type="submit">Simpan Password Baru</button></form>';
    document.getElementById('recoveryForm').addEventListener('submit',async function(e){
      e.preventDefault();
      const p=document.getElementById('newPassword').value, c=document.getElementById('confirmPassword').value, err=document.getElementById('recoveryError');
      if(p!==c){err.textContent='Password tidak sama.';return;}
      if(p.length<8){err.textContent='Password minimal 8 karakter.';return;}
      const btn=this.querySelector('button');btn.disabled=true;btn.textContent='Menyimpan…';err.textContent='';
      try{const result=await db().auth.updateUser({password:p});if(result.error)throw result.error;card.innerHTML='<h2>Password berhasil diperbarui</h2><p>Silakan kembali ke halaman SeaMart dan login menggunakan password baru.</p><button class="primary" type="button" onclick="location.href=location.pathname">Kembali ke Login</button>';}
      catch(error){err.textContent=error.message||'Gagal memperbarui password.';btn.disabled=false;btn.textContent='Simpan Password Baru';}
    });
  }
  function initRecovery(){
    try{
      const sb=db();
      sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY')showPasswordRecovery();});
      if(location.hash.includes('type=recovery'))setTimeout(showPasswordRecovery,400);
    }catch(error){console.warn('Supabase recovery init:',error);}
  }
  function installForgotPassword(){
    const emailInput=document.getElementById('loginUsername');
    const passwordLabel=document.getElementById('loginPassword')?.closest('label');
    if(!emailInput||!passwordLabel||document.getElementById('forgotPasswordButton'))return;
    const row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:flex-end;margin:-5px 0 8px';
    const button=document.createElement('button');
    button.id='forgotPasswordButton';button.type='button';button.textContent='Lupa Password?';
    button.style.cssText='width:auto;min-height:34px;margin:0;padding:4px 2px;background:transparent;border:0;color:#087a48;font-weight:700;cursor:pointer';
    row.appendChild(button);passwordLabel.insertAdjacentElement('afterend',row);
    button.addEventListener('click',async()=>{
      const email=String(emailInput.value||'').trim();
      const errorBox=document.getElementById('loginError');
      if(!email){if(errorBox)errorBox.textContent='Masukkan email akun SeaMart terlebih dahulu.';emailInput.focus();return;}
      button.disabled=true;button.textContent='Mengirim link…';if(errorBox)errorBox.textContent='';
      try{
        const result=await db().auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
        if(result.error)throw result.error;
        if(errorBox)errorBox.textContent='Jika email terdaftar, link reset akan dikirim. Periksa Inbox dan Spam.';
        button.textContent='Link reset diminta';
      }catch(error){
        if(errorBox)errorBox.textContent=error.message||'Gagal mengirim link reset password. Coba lagi nanti.';
        button.disabled=false;button.textContent='Lupa Password?';
      }
    });
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{initRecovery();installForgotPassword();});
  }else{initRecovery();installForgotPassword();}


  async function loadProducts(){
    if(!storeId) return;
    const sb=db();
    const [catsRes,prodRes]=await Promise.all([
      sb.from('categories').select('id,name').eq('store_id',storeId),
      sb.from('products').select('id,code,barcode,name,category_id,price,stock,active').eq('store_id',storeId)
    ]);
    if(catsRes.error) throw catsRes.error; if(prodRes.error) throw prodRes.error;
    const cats=new Map((catsRes.data||[]).map(c=>[c.id,c.name]));
    const remote=(prodRes.data||[]).map(p=>({code:p.code,name:p.name,barcode:p.barcode||'',price:Number(p.price||0),cost:0,stock:Number(p.stock||0),cat:cats.get(p.category_id)||'Umum',active:p.active!==false}));
    const local=Array.isArray(window.products)?window.products:[];
    const remoteKeys=new Set(remote.map(p=>String(p.code||p.barcode||p.name)));
    const localOnly=local.filter(p=>!remoteKeys.has(String(p.code||p.barcode||p.name)));
    if(remote.length){
      const merged=[...remote,...localOnly];
      window.products=merged;
      localStorage.setItem('sm_products',JSON.stringify(merged));
      if(localOnly.length) await pushProducts(localOnly);
    } else if(local.length) {
      await pushProducts(local);
    }
    if(typeof window.render==='function') window.render();
    setStatus('Online • '+remote.length+' barang tersinkron');
  }
  async function pushProducts(list){
    if(!storeId||!list.length) return;
    const sb=db();
    const names=[...new Set(list.map(p=>String(p.cat||'Umum').trim()||'Umum'))];
    const categoryRows=names.map(name=>({store_id:storeId,name}));
    const cRes=await sb.from('categories').upsert(categoryRows,{onConflict:'store_id,name'}).select('id,name');
    if(cRes.error) throw cRes.error;
    const categoryIds=new Map(cRes.data.map(c=>[c.name,c.id]));
    const rows=list.filter(p=>String(p.name||'').trim()).map(p=>({
      store_id:storeId,code:String(p.code||p.barcode||('SM-'+String(p.name).replace(/[^a-z0-9]/gi,'').slice(0,24))).trim(),
      barcode:String(p.barcode||''),name:String(p.name).trim(),
      category_id:categoryIds.get(String(p.cat||'Umum').trim()||'Umum')||null,
      price:Math.max(0,Number(p.price||0)),stock:Math.max(0,Number(p.stock||0)),active:p.active!==false
    }));
    if(!rows.length)return;
    const result=await sb.from('products').upsert(rows,{onConflict:'store_id,code'});
    if(result.error) throw result.error;
  }
  window.seamartCloudLogin=async function(email,password){
    const sb=db();
    const auth=await sb.auth.signInWithPassword({email,password});
    if(auth.error) throw auth.error;
    const member=await sb.from('store_members').select('store_id,role').eq('user_id',auth.data.user.id).limit(1).maybeSingle();
    if(member.error||!member.data){await sb.auth.signOut();throw new Error(member.error?.message||'Akun belum terhubung ke toko SeaMart.');}
    storeId=member.data.store_id;
    const role=member.data.role==='owner'?'Admin':'Kasir';
    sessionStorage.setItem('sm_demo_session',JSON.stringify({username:email,role,cloud:true}));
    await loadProducts();
    return {email,role};
  };
  window.seamartCloudSignOut=async function(){ if(client) await client.auth.signOut(); storeId=null; };
  window.seamartCloudSyncProducts=async function(){
    if(!storeId||syncing)return;
    syncing=true;
    try{await pushProducts(Array.isArray(window.products)?window.products:[]);setStatus('Online • sinkronisasi barang berhasil');}
    catch(e){console.error('SeaMart cloud sync:',e);setStatus('Gagal sinkron: '+(e.message||'periksa koneksi'));}
    finally{syncing=false;}
  };
  window.seamartScheduleProductSync=function(){
    if(!storeId)return;
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>window.seamartCloudSyncProducts(),1200);
  };
  window.addEventListener('online',()=>{if(storeId)loadProducts().catch(e=>setStatus('Gagal memuat: '+e.message));});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&storeId)loadProducts().catch(e=>setStatus('Gagal memuat: '+e.message));});
  window.seamartCloudRefresh=()=>loadProducts().catch(e=>setStatus('Gagal sinkron: '+e.message));
})();