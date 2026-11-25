import { createClient } from "npm:@supabase/supabase-js@2";
const ALLOWED_ORIGINS = new Set(["https://rebisalatiga.github.io"]);
const corsHeaders=(origin:string|null)=>({"Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:"https://rebisalatiga.github.io","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const json=(body:Record<string,unknown>,status:number,origin:string|null)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders(origin),"Content-Type":"application/json"}});
function parseKeys(name:string):Record<string,string>{try{const value=JSON.parse(Deno.env.get(name)||"{}");return value&&typeof value==="object"?value:{}}catch{return{}}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(origin&&!ALLOWED_ORIGINS.has(origin))return json({error:"Origin tidak diizinkan."},403,origin);
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(origin)});
 if(req.method!=="POST")return json({error:"Metode tidak diizinkan."},405,origin);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token)return json({error:"Sesi admin tidak ditemukan."},401,origin);
 const url=Deno.env.get("SUPABASE_URL"),publishableKey=parseKeys("SUPABASE_PUBLISHABLE_KEYS").default||Deno.env.get("SUPABASE_ANON_KEY"),secretKey=parseKeys("SUPABASE_SECRET_KEYS").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!publishableKey||!secretKey)return json({error:"Konfigurasi layanan admin belum lengkap."},500,origin);
 const auth=createClient(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await auth.auth.getUser(token),caller=authData?.user;
 if(authError||!caller)return json({error:"Sesi tidak valid. Silakan masuk kembali."},401,origin);
 const {data:profile}=await admin.from("profiles").select("account_status").eq("id",caller.id).maybeSingle();
 if(profile?.account_status!=="active")return json({error:"Akun admin tidak aktif."},403,origin);
 const {data:adminMembership}=await admin.from("memberships").select("id").eq("user_id",caller.id).eq("role","admin").eq("status","active").limit(1).maybeSingle();
 if(!adminMembership)return json({error:"Hanya Admin Sistem yang dapat mengelola seluruh akun."},403,origin);
 let body:Record<string,unknown>;try{body=await req.json()}catch{return json({error:"Format permintaan tidak valid."},400,origin)}
 const action=String(body.action||"");
 if(action==="list"){
  const {data:profiles,error:pe}=await admin.from("profiles").select("id,full_name,nim,cohort,phone,account_status,created_at").order("full_name");
  if(pe)return json({error:"Gagal membaca profil akun."},500,origin);
  const {data:memberships,error:me}=await admin.from("memberships").select("id,user_id,unit_id,period_id,role,status,position_title,org_units(name,unit_type)");
  if(me)return json({error:"Gagal membaca jabatan akun."},500,origin);
  const users:Record<string,any>={};
  for(let page=1;page<=100;page++){const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)return json({error:"Gagal membaca email akun."},500,origin);for(const u of data.users)users[u.id]={email:u.email||"",email_confirmed_at:u.email_confirmed_at||null,last_sign_in_at:u.last_sign_in_at||null};if(data.users.length<1000)break}
  return json({accounts:(profiles||[]).map(p=>({...p,...(users[p.id]||{email:""}),memberships:(memberships||[]).filter(m=>m.user_id===p.id)}))},200,origin);
 }
 if(action==="update"){
  const id=String(body.target_user_id||"");if(!uuid.test(id))return json({error:"ID akun tidak valid."},400,origin);
  if(id===caller.id)return json({error:"Gunakan pengaturan akun sendiri untuk mengubah akun admin yang sedang digunakan."},400,origin);
  const email=String(body.email||"").trim().toLowerCase(),full_name=String(body.full_name||"").trim(),nim=String(body.nim||"").trim()||null,cohort=String(body.cohort||"").trim()||null,phone=String(body.phone||"").trim()||null,account_status=String(body.account_status||"");
  if(!/^\S+@\S+\.\S+$/.test(email))return json({error:"Alamat email tidak valid."},400,origin);
  if(full_name.length<2||full_name.length>120)return json({error:"Nama harus 2–120 karakter."},400,origin);
  if(!["pending","active","rejected","suspended"].includes(account_status))return json({error:"Status akun tidak valid."},400,origin);
  const {data:existing}=await admin.from("profiles").select("id").eq("id",id).maybeSingle();if(!existing)return json({error:"Akun tidak ditemukan."},404,origin);
  const {data:authUpdate,error:ae}=await admin.auth.admin.updateUserById(id,{email,email_confirm:true});
  if(ae)return json({error:"Email gagal diperbarui: "+ae.message},400,origin);
  const {error:pe}=await admin.from("profiles").update({full_name,nim,cohort,phone,account_status,updated_at:new Date().toISOString()}).eq("id",id);
  if(pe)return json({error:"Email tersimpan, tetapi profil gagal disimpan: "+pe.message},400,origin);
  const membershipId=String(body.membership_id||"");
  if(membershipId){
   if(!uuid.test(membershipId))return json({error:"Penugasan jabatan tidak valid."},400,origin);
   const role=String(body.role||""),unit_id=String(body.unit_id||""),position_title=String(body.position_title||"").trim();
   const expected:Record<string,string>={admin:"rayon",ketua_rayon:"rayon",sekretaris_umum:"executive",bendahara_umum:"executive",kepala_bidang:"field",sekretaris_bidang:"field",koordinator_biro:"bureau",anggota:"bureau"};
   if(!expected[role]||!uuid.test(unit_id))return json({error:"Jabatan atau unit tidak valid."},400,origin);
   const {data:unit}=await admin.from("org_units").select("id,unit_type").eq("id",unit_id).maybeSingle();
   if(!unit||expected[role]!==unit.unit_type)return json({error:"Role tidak sesuai dengan jenis unit organisasi."},400,origin);
   const {error:me}=await admin.from("memberships").update({role,unit_id,position_title:position_title||null}).eq("id",membershipId).eq("user_id",id);
   if(me)return json({error:"Profil tersimpan, tetapi jabatan gagal diperbarui: "+me.message},400,origin);
  }
  await admin.from("audit_logs").insert({actor_user_id:caller.id,action:"admin_update_account",table_name:"profiles",record_id:id,metadata:{changed_email:true,changed_profile:true,changed_membership:!!membershipId}});
  return json({ok:true,user_id:id,email:authUpdate.user?.email||email},200,origin);
 }
 if(action==="reset_password"){
  const id=String(body.target_user_id||""),password=typeof body.new_password==="string"?body.new_password:"";
  if(!uuid.test(id))return json({error:"Pilih akun yang valid."},400,origin);
  if(id===caller.id)return json({error:"Fitur ini hanya untuk akun lain, bukan akun admin sendiri."},400,origin);
  if(password.length<8||password.length>72)return json({error:"Password baru harus 8–72 karakter."},400,origin);
  const {data:target}=await admin.from("profiles").select("id").eq("id",id).maybeSingle();if(!target)return json({error:"Akun tujuan tidak ditemukan."},404,origin);
  const {error}=await admin.auth.admin.updateUserById(id,{password});if(error)return json({error:"Password gagal diperbarui: "+error.message},400,origin);
  await admin.from("audit_logs").insert({actor_user_id:caller.id,action:"admin_reset_account_password",table_name:"auth.users",record_id:id,metadata:{}});
  return json({ok:true,user_id:id},200,origin);
 }
 return json({error:"Aksi tidak dikenal."},400,origin);
});