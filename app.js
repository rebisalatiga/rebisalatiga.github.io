const CONFIG = window.SIGAP_CONFIG || {};
const API = (CONFIG.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = CONFIG.SUPABASE_PUBLISHABLE_KEY || "";
const root = document.getElementById("app");
const state = {
  session: null, user: null, profile: null, profiles: [], units: [], periods: [],
  memberships: [], roster: [], criteria: [], evaluations: [], scores: [], reports: [],
  publicStructure: [], publicMode: false, evaluationMode: "individual",
  systemSettings: null, auditLogs: [], adminAccounts: [],
  view: "overview", periodId: "", authMode: "login", busy: false, searchQuery: ""
};
const $ = (selector, scope=document) => scope.querySelector(selector);
const DEFAULT_SYSTEM_SETTINGS = {
  id:1,
  app_name:"SIGAP PMII FEBI",
  app_subtitle:"Sistem Informasi Evaluasi Kepengurusan",
  login_headline:"Merawat amanah. Menumbuhkan gerakan.",
  login_description:"Ruang digital pengurus PMII Fakultas Ekonomi dan Bisnis Islam untuk mengelola struktur, mengukur kinerja, dan menyusun evaluasi bersama.",
  theme_preset:"navy_gold",
  compact_mode:false
};

const $$ = (selector, scope=document) => [...scope.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));
const dateText = value => value ? new Date(value).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"}) : "—";
const roleLabels = {
  admin:"Admin Sistem", ketua_rayon:"Ketua Rayon", sekretaris_umum:"Sekretaris Umum",
  bendahara_umum:"Bendahara Umum", kepala_bidang:"Kepala Bidang",
  sekretaris_bidang:"Sekretaris Bidang", koordinator_biro:"Koordinator Biro", anggota:"Anggota"
};
function toast(message, error=false) {
  const el=$("#toast"); if(!el) return;
  el.textContent=message; el.className="toast show"+(error?" error":"");
  clearTimeout(window.__sigapToast); window.__sigapToast=setTimeout(()=>el.className="toast",3400);
}
function authHeaders(token) {
  return { "apikey":KEY, ...(token ? {"Authorization":"Bearer "+token} : {}) };
}
async function authRequest(path, options={}, token=null) {
  const response=await fetch(API+"/auth/v1"+path,{...options,headers:{...authHeaders(token), "Content-Type":"application/json",...(options.headers||{})}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload.msg || payload.message || payload.error_description || payload.error || "Permintaan autentikasi gagal.");
  return payload;
}
async function api(path, options={}) {
  const request=()=>fetch(API+"/rest/v1/"+path,{
    ...options,
    headers:{
      ...authHeaders(state.session?.access_token),
      "Content-Type":"application/json",
      ...(options.body ? {"Prefer":"return=representation"} : {}),
      ...(options.headers||{})
    }
  });
  let response=await request();
  if(response.status===401 && state.session?.refresh_token) {
    try { if(await refreshSession()) response=await request(); }
    catch(_) { saveSession(null); }
  }
  const payload=await response.json().catch(()=>null);
  if(!response.ok) {
    const message=payload?.message || payload?.details || payload?.hint || payload?.error_description || "Permintaan database gagal ("+response.status+").";
    throw new Error(message);
  }
  return payload;
}
async function publicApi(path) {
  const response=await fetch(API+"/rest/v1/"+path,{
    method:"GET",
    headers:{"apikey":KEY,"Content-Type":"application/json"}
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok) {
    const message=payload?.message || payload?.details || payload?.hint || "Direktori publik gagal dimuat ("+response.status+").";
    throw new Error(message);
  }
  return payload;
}

const SYSTEM_THEMES = {
  navy_gold:{base:"#111a3d",panel:"#18254f",button:"#203365",accent:"#f2c500",soft:"#fff7d8",paper:"#f3f4f8",line:"#e5e8f0"},
  ocean_blue:{base:"#10243d",panel:"#183a5d",button:"#24527c",accent:"#69b7e8",soft:"#e7f4fc",paper:"#f2f6fa",line:"#dce6ef"},
  forest_green:{base:"#12362c",panel:"#1d5139",button:"#28664b",accent:"#d6ad55",soft:"#f7f0df",paper:"#f4f7f4",line:"#e0e9e2"}
};
async function loadSystemSettings(){
  try{
    const rows=await publicApi("system_settings?select=*&id=eq.1&limit=1");
    state.systemSettings={...DEFAULT_SYSTEM_SETTINGS,...(rows?.[0]||{})};
  }catch(error){
    state.systemSettings={...DEFAULT_SYSTEM_SETTINGS};
  }
  applySystemSettings();
}
function applySystemSettings(){
  const settings={...DEFAULT_SYSTEM_SETTINGS,...(state.systemSettings||{})};
  const theme=SYSTEM_THEMES[settings.theme_preset]||SYSTEM_THEMES.navy_gold;
  const html=document.documentElement;
  html.dataset.sigapTheme=SYSTEM_THEMES[settings.theme_preset]?settings.theme_preset:"navy_gold";
  const variables={
    "--green-950":theme.base,"--green-900":theme.panel,"--green-800":theme.button,
    "--green-700":theme.button,"--green-100":theme.soft,"--gold":theme.accent,
    "--gold-soft":theme.soft,"--paper":theme.paper,"--line":theme.line
  };
  Object.entries(variables).forEach(([name,value])=>html.style.setProperty(name,value));
  document.body.classList.toggle("compact-mode",!!settings.compact_mode);
  document.title=settings.app_name||DEFAULT_SYSTEM_SETTINGS.app_name;
  $$(".brand-lockup strong,.side-brand strong,.public-structure-brand strong").forEach(node=>{
    node.textContent=settings.app_name||DEFAULT_SYSTEM_SETTINGS.app_name;
  });
  $$(".brand-lockup small").forEach(node=>{
    node.textContent=settings.app_subtitle||DEFAULT_SYSTEM_SETTINGS.app_subtitle;
  });
  const heading=$(".hero-copy h1");
  if(heading) heading.textContent=settings.login_headline||DEFAULT_SYSTEM_SETTINGS.login_headline;
  const description=$(".hero-copy p");
  if(description) description.textContent=settings.login_description||DEFAULT_SYSTEM_SETTINGS.login_description;
}
function saveSession(session) {
  state.session=session;
  if(session) sessionStorage.setItem("sigap-session",JSON.stringify(session));
  else sessionStorage.removeItem("sigap-session");
}
async function refreshSession() {
  const refresh=state.session?.refresh_token;
  if(!refresh) return false;
  const result=await authRequest("/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:refresh})});
  saveSession({...result,expires_at:Math.floor(Date.now()/1000)+(result.expires_in||3600)});
  return true;
}
async function restoreSession() {
  const saved=sessionStorage.getItem("sigap-session");
  if(!saved) return false;
  try {
    state.session=JSON.parse(saved);
    if(!state.session.expires_at || state.session.expires_at < Math.floor(Date.now()/1000)+60) await refreshSession();
    const me=await authRequest("/user",{method:"GET"},state.session.access_token);
    state.user=me;
    return true;
  } catch(error) { saveSession(null); state.user=null; return false; }
}
function periodActive() { return state.periods.find(p=>p.id===state.periodId) || state.periods.find(p=>p.status==="active") || null; }
function isAdmin() { return state.memberships.some(m=>m.role==="admin" && m.status==="active"); }
function canApproveAccounts() {
  const activePeriod=state.periods.find(p=>p.status==="active");
  return isAdmin() || (!!activePeriod && ownMemberships().some(m=>m.period_id===activePeriod.id && ["ketua_rayon","sekretaris_umum","bendahara_umum","kepala_bidang"].includes(m.role)));
}
function ownMemberships() { return state.memberships.filter(m=>m.user_id===state.user?.id && m.status==="active"); }
function activeMemberships() {
  const p=periodActive();
  return state.memberships.filter(m=>m.status==="active" && p && m.period_id===p.id);
}
function profileFor(userId) { return state.profiles.find(p=>p.id===userId); }
function unitFor(unitId) { return state.units.find(u=>u.id===unitId); }
function memberName(m) { return profileFor(m.user_id)?.full_name || "Pengurus"; }
function unitName(m) { return unitFor(m.unit_id)?.name || "Unit organisasi"; }
function ownEvaluatorMembership() {
  const p=periodActive();
  return ownMemberships().find(m=>p && m.period_id===p.id) || ownMemberships().find(m=>m.role==="admin") || null;
}
async function loadData() {
  const results=await Promise.all([
    api("profiles?select=id,full_name,nim,cohort,account_status,created_at&order=full_name.asc"),
    api("org_units?select=*&is_active=eq.true&order=sort_order.asc"),
    api("evaluation_periods?select=*&order=created_at.desc"),
    api("memberships?select=*&status=eq.active"),
    api("member_roster?select=*&order=full_name.asc"),
    api("evaluation_criteria?select=*&is_active=eq.true&order=sort_order.asc"),
    api("evaluations?select=*&order=created_at.desc"),
    api("evaluation_scores?select=*&order=created_at.desc"),
    api("activity_reports?select=*&order=created_at.desc"),
    publicApi("public_organization_structure?select=*&order=sort_order.asc,person_name.asc")
  ]);
  [state.profiles,state.units,state.periods,state.memberships,state.roster,state.criteria,state.evaluations,state.scores,state.reports,state.publicStructure]=results;
  if(!state.periodId || !state.periods.some(p=>p.id===state.periodId)) {
    state.periodId=state.periods.find(p=>p.status==="active")?.id || state.periods[0]?.id || "";
  }
}
async function loadPublicStructure() {
  const rows=await publicApi("public_organization_structure?select=*&order=sort_order.asc,person_name.asc");
  state.publicStructure=rows||[];
  const byId=new Map();
  for(const row of state.publicStructure) {
    if(!byId.has(row.unit_id)) byId.set(row.unit_id,{
      id:row.unit_id,parent_id:row.parent_id,code:row.unit_code,name:row.unit_name,
      unit_type:row.unit_type,sort_order:row.sort_order,is_active:true
    });
  }
  state.units=[...byId.values()];
  state.publicMode=true;
  state.view="structure";
  render();
}
async function loadProfile() {
  const rows=await api("profiles?select=*&id=eq."+encodeURIComponent(state.user.id)+"&limit=1");
  state.profile=rows[0] || null;
}
function renderAuth() {
  const signup=state.authMode==="signup";
  root.innerHTML='<div class="auth-layout">'+
    '<section class="auth-hero"><div class="brand-lockup"><div class="brand-logo auth-logo"><img src="https://1.bp.blogspot.com/-_LPIjxug5bs/W1YpWUAw0FI/AAAAAAAAAac/26D9u4GoFe0qM9sdOUpfSyV0MH4RO1y0QCLcBGAs/s1600/logo_pmii_hd.png" alt="Logo PMII Rayon Ekonomi Bisnis Islam"></div><div><strong>SIGAP PMII FEBI</strong><small>Sistem Informasi Evaluasi Kepengurusan</small></div></div>'+
    '<div class="auth-structure-action"><button class="auth-structure-button" type="button" id="public-structure"><span>Lihat struktur organisasi</span><span class="auth-structure-arrow" aria-hidden="true">→</span></button></div>'+
    '<div class="auth-install-action">'+window.SIGAP_PWA.buttonMarkup("Pasang aplikasi","auth-install-button")+'<small>Tambahkan SIGAP ke layar utama HP agar mudah dibuka.</small></div>'+
    '<div class="hero-copy"><div class="eyebrow">Bergerak · Berproses · Bertumbuh</div><h1>Merawat amanah.<br>Menumbuhkan gerakan.</h1><p>Ruang digital pengurus PMII Fakultas Ekonomi dan Bisnis Islam untuk mengelola struktur, mengukur kinerja, dan menyusun evaluasi bersama.</p></div>'+
    '<div class="hero-foot">PERGERAKAN MAHASISWA ISLAM INDONESIA · PMII FEBI</div></section>'+
    '<section class="auth-panel"><form class="auth-card" id="auth-form"><div class="eyebrow">Ruang internal organisasi</div><h2>'+(signup?"Buat akun pengurus":"Selamat datang kembali")+'</h2><p>'+(signup?"Daftarkan akun. Ketua Rayon, Sekretaris Umum, Bendahara Umum, atau Kepala Bidang akan memeriksa pendaftaran Anda.":"Masuk untuk melanjutkan proses dan amanah kepengurusan.")+'</p>'+
    (signup?'<div class="field"><label>Nama lengkap</label><input name="full_name" required maxlength="100" placeholder="Nama sesuai identitas"></div><div class="field"><label>NIM (opsional)</label><input name="nim" maxlength="40" placeholder="Nomor Induk Mahasiswa"></div><div class="field"><label>Angkatan (opsional)</label><input name="cohort" maxlength="20" placeholder="Contoh: 2024"></div>':'')+
    '<div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="nama@email.com"></div>'+
    '<div class="field"><label>Password</label><input name="password" type="password" required minlength="8" autocomplete="'+(signup?"new-password":"current-password")+'" placeholder="Minimal 8 karakter"></div>'+
    '<button class="btn btn-block" type="submit">'+(signup?"Daftar akun":"Masuk ke SIGAP")+'</button>'+
    '<div class="auth-switch">'+(signup?'Sudah memiliki akun? <button type="button" class="link-btn" data-auth-mode="login">Masuk</button>':'Belum memiliki akun? <button type="button" class="link-btn" data-auth-mode="signup">Daftar sekarang</button>')+'</div>'+
     '<div class="auth-credit">Dibuat oleh <strong>Dzaky Luqman Abdullah</strong><span>Kepala Bidang Eksternal</span></div></form></section></div>';
  applySystemSettings();
}
function renderPending() {
  const status=state.profile?.account_status || "pending";
  const message=status==="rejected"?"Pendaftaran akun ditolak. Silakan hubungi Ketua Rayon atau pengurus yang memeriksa pendaftaran.":status==="suspended"?"Akses akun sedang dinonaktifkan. Silakan hubungi Admin Sistem.":"Akun Anda sudah terdaftar. Tunggu persetujuan Ketua Rayon, Sekretaris Umum, Bendahara Umum, atau Kepala Bidang";
  root.innerHTML='<div class="pending-wrap"><section class="pending-card"><div class="brand-logo pending-logo"><img src="https://1.bp.blogspot.com/-_LPIjxug5bs/W1YpWUAw0FI/AAAAAAAAAac/26D9u4GoFe0qM9sdOUpfSyV0MH4RO1y0QCLcBGAs/s1600/logo_pmii_hd.png" alt="Logo PMII Rayon Ekonomi Bisnis Islam"></div><div class="pending-icon">⌛</div><div class="eyebrow">SIGAP PMII FEBI</div><h2 style="margin:10px 0">Akun dalam proses</h2><p class="muted" style="line-height:1.7">'+esc(message)+'</p><div style="margin-top:24px"><button class="btn btn-ghost" id="refresh-status">Periksa status lagi</button> <button class="btn" id="logout">Keluar</button></div></section></div>';
  applySystemSettings();
}
function navItem(view,icon,label) {
  return '<button class="nav-item '+(state.view===view?"active":"")+'" data-view="'+view+'"><span class="nav-ico">'+icon+'</span>'+label+'</button>';
}
function renderShell() {
  const p=periodActive();
  const profile=state.profile || {};
  const firstRole=ownMemberships()[0]?.role || (isAdmin()?"admin":"anggota");
  root.innerHTML='<div class="app-shell"><aside class="sidebar" id="sidebar"><div class="side-brand"><div class="brand-logo side-logo"><img src="https://1.bp.blogspot.com/-_LPIjxug5bs/W1YpWUAw0FI/AAAAAAAAAac/26D9u4GoFe0qM9sdOUpfSyV0MH4RO1y0QCLcBGAs/s1600/logo_pmii_hd.png" alt="Logo PMII Rayon Ekonomi Bisnis Islam"></div><div><strong>SIGAP PMII FEBI</strong><small>Ruang kerja kepengurusan</small></div></div>'+
    '<div class="nav-label">Menu utama</div><nav class="nav-list">'+
      navItem("overview","⌂","Dashboard")+navItem("structure","⌘","Struktur organisasi")+navItem("evaluations","✓","Penilaian & evaluasi")+navItem("reports","▤","Laporan kegiatan")+
    '</nav>'+(manageableUnits().length?'<div class="nav-label">Data kepengurusan</div><nav class="nav-list">'+navItem("roster","♧","Data anggota & rapor")+'</nav>':'')+(canApproveAccounts()?'<div class="nav-label">Persetujuan</div><nav class="nav-list">'+navItem("approvals","✓","Persetujuan akun")+'</nav>':'')+(isAdmin()?'<div class="nav-label">Administrasi sistem</div><nav class="nav-list">'+navItem("admin","⚙","Panel admin")+navItem("settings","⚙","Pengaturan sistem")+'</nav>':'')+
    '<div class="side-bottom">'+window.SIGAP_PWA.buttonMarkup("Pasang aplikasi","sidebar-install-button")+'<div class="user-mini"><div class="avatar">'+esc((profile.full_name||"P").slice(0,1).toUpperCase())+'</div><div><strong>'+esc(profile.full_name||"Pengurus")+'</strong><small>'+esc(roleLabels[firstRole]||"Pengurus")+'</small></div></div><button class="nav-item" id="logout" style="width:100%">⇥ Keluar dari akun</button></div></aside>'+
    '<main class="main-area"><header class="topbar"><div class="topbar-left"><button class="mobile-menu" id="mobile-menu" aria-label="Buka menu">☰</button><div class="breadcrumb"><span>PMII FEBI</span><b>/</b><strong>'+esc(({overview:"Dashboard",structure:"Struktur organisasi",evaluations:"Penilaian & evaluasi",reports:"Laporan kegiatan",roster:"Data anggota & rapor",approvals:"Persetujuan akun",admin:"Administrasi sistem",settings:"Pengaturan sistem"})[state.view]||"Dashboard")+'</strong></div></div>'+
    '<div class="top-actions"><label class="global-search"><span>⌕</span><input id="global-search" type="search" value="'+esc(state.searchQuery||"")+'" placeholder="Cari anggota, bidang, atau rapor…" autocomplete="off"></label>'+(state.periods.length?'<select class="period-select" id="period-select" aria-label="Periode kepengurusan">'+state.periods.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===state.periodId?"selected":"")+'>'+esc(x.name)+(x.status==="active"?" · Aktif":"")+'</option>').join("")+'</select>':'')+'<button class="top-icon-button" id="refresh-data" aria-label="Segarkan data">↻</button><div class="top-avatar" title="'+esc(profile.full_name||"Pengurus")+'">'+esc((profile.full_name||"P").slice(0,1).toUpperCase())+'</div></div></header><section class="page" id="page-content">'+renderView()+'</section></main></div>';
  applySystemSettings();
}
function pageHeading(title,desc,action="") {
  return '<div class="page-heading"><div><div class="eyebrow">SIGAP / PMII FEBI</div><h1>'+title+'</h1><p>'+desc+'</p></div>'+action+'</div>';
}
function stat(label,value,note,icon) {
  return '<article class="stat-card"><div class="stat-top"><span>'+label+'</span><span class="stat-icon">'+icon+'</span></div><div class="stat-value">'+value+'</div><div class="stat-note">'+note+'</div></article>';
}
function scoreForEvaluation(e) {
  const values=state.scores.filter(s=>s.evaluation_id===e.id);
  let weighted=0,total=0;
  for(const s of values){
    const criterion=state.criteria.find(c=>c.id===s.criterion_id);
    if(criterion){weighted+=Number(s.score)*Number(criterion.weight);total+=Number(criterion.weight);}
  }
  return total?(weighted/total*20):null;
}
function evaluationPerson(e) {
  const nominal=e.subject_roster_id?state.roster.find(m=>m.id===e.subject_roster_id):null;
  const registered=e.subject_membership_id?state.memberships.find(m=>m.id===e.subject_membership_id):null;
  const bureau=e.subject_unit_id?unitFor(e.subject_unit_id):null;
  const evaluator=state.memberships.find(m=>m.id===e.evaluator_membership_id);
  return {
    name:bureau?("Biro "+bureau.name):(nominal?.full_name||(registered?memberName(registered):"Pengurus")),
    unit:unitFor(bureau?.parent_id||nominal?.unit_id||registered?.unit_id)?.name||"—",
    position:bureau?"Penilaian Biro":(nominal?.position_title||(registered?roleLabels[registered.role]||registered.role:"")),
    evaluator:evaluator?memberName(evaluator):"Pengurus"
  };
}
function dashboardMonthlyChart(evaluations) {
  const now=new Date();
  const months=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const rows=evaluations.filter(e=>{
      const at=new Date(e.created_at);
      return at.getFullYear()===d.getFullYear() && at.getMonth()===d.getMonth();
    });
    const scores=rows.map(scoreForEvaluation).filter(v=>v!==null);
    months.push({
      label:d.toLocaleDateString("id-ID",{month:"short"}),
      value:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null,
      count:rows.length
    });
  }
  const has=months.some(m=>m.value!==null);
  const x=i=>42+i*112;
  const y=v=>205-(v/100)*160;
  const pts=months.map((m,i)=>m.value===null?null:[x(i),y(m.value)]);
  const path=pts.map((p,i)=>p?(i===0||!pts[i-1]?"M":"L")+p[0]+" "+p[1]:"").filter(Boolean).join(" ");
  const area=has?path+" L "+x(months.length-1)+" 205 L "+x(0)+" 205 Z":"";
  const guides=[0,25,50,75,100].map(v=>'<g><line x1="34" y1="'+y(v)+'" x2="615" y2="'+y(v)+'" stroke="#e9ecf3" stroke-dasharray="4 5"/><text x="22" y="'+(y(v)+4)+'" text-anchor="end" fill="#8992a8" font-size="10">'+v+'</text></g>').join("");
  const dots=pts.map((p,i)=>p?'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="5.5" fill="#f2c500" stroke="#fff" stroke-width="2"><title>'+months[i].label+': '+months[i].value.toFixed(1)+'</title></circle>':"").join("");
  const labels=months.map((m,i)=>'<text x="'+x(i)+'" y="228" text-anchor="middle" fill="#8992a8" font-size="11">'+m.label+'</text>').join("");
  return '<div class="line-chart-wrap"><svg viewBox="0 0 650 245" role="img" aria-label="Grafik rata-rata nilai enam bulan terakhir">'+guides+(has?'<defs><linearGradient id="sigap-line-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#f2c500" stop-opacity=".22"/><stop offset="100%" stop-color="#f2c500" stop-opacity="0"/></linearGradient></defs><path d="'+area+'" fill="url(#sigap-line-fill)"/><path d="'+path+'" fill="none" stroke="#f0bd00" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'+dots:'')+labels+'</svg>'+(has?'':'<div class="chart-empty">Belum ada penilaian pada enam bulan terakhir.</div>')+'</div>';
}
function dashboardUnitBars(evaluations) {
  const grouped={};
  for(const e of evaluations){
    const person=evaluationPerson(e);
    const score=scoreForEvaluation(e);
    const unitNameValue=person.unit;
    if(score===null||unitNameValue==="—") continue;
    grouped[unitNameValue]??={total:0,count:0};
    grouped[unitNameValue].total+=score;grouped[unitNameValue].count++;
  }
  const items=Object.entries(grouped).map(([name,v])=>({name,value:v.total/v.count,count:v.count}))
    .sort((a,b)=>b.value-a.value).slice(0,5);
  if(!items.length) return '<div class="chart-empty chart-empty-small">Data nilai per unit belum tersedia.</div>';
  return '<div class="unit-bars">'+items.map(item=>'<div class="unit-bar-row"><div class="unit-bar-label"><span>'+esc(item.name)+'</span><b>'+item.value.toFixed(1)+'</b></div><div class="unit-bar-track"><i style="width:'+Math.max(0,Math.min(100,item.value))+'%"></i></div></div>').join("")+'</div>';
}
function dashboardDonut(reports) {
  const counts=[
    {label:"Disetujui",value:reports.filter(r=>r.status==="approved").length,color:"#f2c500"},
    {label:"Terkirim",value:reports.filter(r=>r.status==="submitted").length,color:"#17264f"},
    {label:"Perlu revisi",value:reports.filter(r=>r.status==="revision_requested").length,color:"#c7ccd6"},
    {label:"Draft",value:reports.filter(r=>r.status==="draft").length,color:"#8794b0"}
  ];
  const total=counts.reduce((a,b)=>a+b.value,0);
  if(!total) return '<div class="donut-empty"><div class="donut-ring"></div><span>Belum ada laporan</span></div>';
  let cursor=0;
  const slices=counts.map(item=>{
    const begin=cursor;cursor+=item.value/total*100;
    return item.color+" "+begin+"% "+cursor+"%";
  });
  return '<div class="donut-layout"><div class="donut-ring" style="background:conic-gradient('+slices.join(",")+')"><div class="donut-hole"><strong>'+total+'</strong><small>Laporan</small></div></div><div class="donut-legend">'+counts.map(item=>'<div><i style="background:'+item.color+'"></i><span>'+item.label+'</span><b>'+item.value+'</b></div>').join("")+'</div></div>';
}
function renderOverview() {
  const p=periodActive();
  const registered=activeMemberships();
  const nominal=state.roster.filter(m=>m.is_active&&(!p||m.period_id===p.id));
  const reports=state.reports.filter(r=>!p||r.period_id===p.id);
  const evaluations=state.evaluations.filter(e=>!p||e.period_id===p.id);
  const values=evaluations.map(scoreForEvaluation).filter(v=>v!==null);
  const average=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const peopleCount=registered.length+nominal.length;
  const activeFields=state.units.filter(u=>u.unit_type==="field").length;
  const bureaus=state.units.filter(u=>u.unit_type==="bureau").length;
  const pendingCount=state.profiles.filter(x=>x.account_status==="pending").length;
  const recent=[...evaluations].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5);
  const myRoles=ownMemberships().map(m=>roleLabels[m.role]||m.role);
  const table=recent.length?recent.map(e=>{
    const person=evaluationPerson(e);const value=scoreForEvaluation(e);
    return '<tr><td><div class="table-person"><strong>'+esc(person.name)+'</strong><small>'+esc(person.position)+'</small></div></td><td>'+esc(person.unit)+'</td><td>'+esc(person.evaluator)+'</td><td><strong class="score-pill">'+(value===null?"—":value.toFixed(1))+'</strong></td><td><span class="badge '+(e.status==="reviewed"?"success":e.status==="submitted"?"gold":"grey")+'">'+esc(e.status==="reviewed"?"Ditinjau":e.status==="submitted"?"Terkirim":"Draft")+'</span></td></tr>';
  }).join(""):'<tr><td colspan="5"><div class="empty compact-empty">Belum ada penilaian pada periode ini.</div></td></tr>';
  return '<div class="dashboard-welcome"><div><div class="eyebrow">RINGKASAN KEPENGURUSAN</div><h1>Selamat datang, '+esc(state.profile?.full_name||"Pengurus")+'</h1><p>Pantau data, penilaian, dan perjalanan kepengurusan PMII FEBI.</p></div><div class="welcome-period"><span>PERIODE TERPILIH</span><strong>'+esc(p?.name||"Belum tersedia")+'</strong><small>'+(p?.status==="active"?"Periode aktif":"Periode arsip")+'</small></div></div>'+
    '<div class="dashboard-top"><section class="panel chart-panel"><div class="panel-head"><div><h3>Statistik Penilaian</h3><p>Rata-rata nilai dalam enam bulan terakhir</p></div><span class="chart-period">6 BULAN</span></div>'+dashboardMonthlyChart(evaluations)+'</section>'+
    '<div class="dashboard-kpis">'+
      '<article class="metric-card"><div class="metric-icon">♧</div><div class="metric-label">Anggota terdata</div><strong>'+peopleCount+'</strong><small>'+registered.length+' akun · '+nominal.length+' nama manual</small></article>'+
      '<article class="metric-card"><div class="metric-icon">✓</div><div class="metric-label">Rata-rata nilai</div><strong>'+(average===null?"—":average.toFixed(1))+'</strong><small>'+evaluations.length+' catatan penilaian</small></article>'+
      '<article class="metric-card"><div class="metric-icon">▤</div><div class="metric-label">Laporan kegiatan</div><strong>'+reports.length+'</strong><small>'+reports.filter(r=>r.status==="approved").length+' disetujui</small></article>'+
      '<article class="metric-card"><div class="metric-icon">⌘</div><div class="metric-label">Bidang & biro</div><strong>'+activeFields+' / '+bureaus+'</strong><small>Bidang dan biro organisasi</small></article>'+
    '</div></div>'+
    '<div class="dashboard-middle"><section class="panel"><div class="panel-head"><div><h3>Nilai per Unit</h3><p>Rata-rata nilai berdasarkan unit anggota</p></div></div>'+dashboardUnitBars(evaluations)+'</section>'+
    '<section class="panel"><div class="panel-head"><div><h3>Status Laporan</h3><p>Distribusi laporan periode terpilih</p></div></div>'+dashboardDonut(reports)+'</section>'+
    '<section class="panel shortcut-panel"><div class="panel-head"><div><h3>Akses Cepat</h3><p>Menu sesuai tugas struktural Anda</p></div></div>'+
    '<button class="shortcut-row" data-view="structure"><span class="shortcut-symbol">⌘</span><span><b>Struktur organisasi</b><small>Lihat susunan rayon, bidang, dan biro</small></span><i>›</i></button>'+
    '<button class="shortcut-row" data-view="evaluations"><span class="shortcut-symbol">✓</span><span><b>Penilaian & evaluasi</b><small>Isi skor, catatan, dan rekomendasi</small></span><i>›</i></button>'+
    '<button class="shortcut-row" data-view="reports"><span class="shortcut-symbol">▤</span><span><b>Laporan kegiatan</b><small>Catat progres dan dokumentasi</small></span><i>›</i></button>'+
    (manageableUnits().length?'<button class="shortcut-row" data-view="roster"><span class="shortcut-symbol">♧</span><span><b>Data anggota & rapor</b><small>Kelola nama anggota tanpa akun</small></span><i>›</i></button>':"")+
    (canApproveAccounts()?'<button class="shortcut-row" data-view="approvals"><span class="shortcut-symbol">✓</span><span><b>Persetujuan akun</b><small>'+pendingCount+' pendaftar menunggu keputusan</small></span><i>›</i></button>':"")+
    (isAdmin()?'<button class="shortcut-row" data-view="admin"><span class="shortcut-symbol">⚙</span><span><b>Administrasi sistem</b><small>Kelola periode dan jabatan</small></span><i>›</i></button>':"")+
    '</section></div>'+
    '<section class="panel recent-panel"><div class="panel-head"><div><h3>Penilaian Terbaru</h3><p>Riwayat evaluasi pengurus pada '+esc(p?.name||"periode terpilih")+'</p></div><button class="btn btn-ghost" data-view="evaluations">Lihat semua</button></div>'+
    '<div class="table-wrap"><table class="dashboard-table"><thead><tr><th>Nama anggota</th><th>Unit</th><th>Penilai</th><th>Nilai</th><th>Status</th></tr></thead><tbody>'+table+'</tbody></table></div></section>'+
    '<div class="dashboard-footnote"><span><i></i> Sistem Informasi Evaluasi dan Penilaian Kepengurusan</span><span>PMII Rayon Ekonomi Bisnis Islam</span></div>';
}
function structurePeople(unitId) {
  return state.publicStructure
    .filter(person=>person.unit_id===unitId && person.person_name)
    .sort((a,b)=>{
      const ap=String(a.person_position||"").toLowerCase();
      const bp=String(b.person_position||"").toLowerCase();
      const rank=x=>x.includes("waka")||x.includes("ketua rayon")?0:x.includes("sekretaris")?1:x.includes("bendahara")?2:x.includes("koordinator")?3:4;
      return rank(ap)-rank(bp)||String(a.person_name).localeCompare(String(b.person_name),"id");
    });
}
function orgPersonBox(person,emptyPosition) {
  const position=person?.person_position || emptyPosition || "Anggota";
  const name=person?.person_name || "Nama belum diisi";
  return '<div class="org-person-box'+(person?'':' is-empty')+'"><span class="org-person-position">'+esc(position)+'</span><strong>'+esc(name)+'</strong></div>';
}
function renderOrgExecutive(unit) {
  const person=structurePeople(unit.id)[0];
  const fallback=unit.code==="sekretaris-umum"?"Sekretaris":unit.code==="bendahara-umum"?"Bendahara":unit.name;
  return '<div class="org-exec-node">'+orgPersonBox(person,fallback)+'</div>';
}
function renderOrgBureau(unit) {
  const people=structurePeople(unit.id);
  const coordinatorIndex=people.findIndex(person=>String(person.person_position||"").toLowerCase().includes("koordinator"));
  const coordinator=coordinatorIndex>=0?people[coordinatorIndex]:null;
  const members=people.filter((person,index)=>index!==coordinatorIndex);
  return '<section class="org-bureau-card"><header class="org-bureau-heading"><span>BIRO</span><strong>'+esc(unit.name)+'</strong></header>'+
    '<div class="org-bureau-people">'+
      '<div class="org-coordinator-label">Koordinator</div>'+orgPersonBox(coordinator,"Koordinator Biro")+
      '<div class="org-members-label">Anggota ('+members.length+')</div>'+
      (members.length?members.map(person=>orgPersonBox(person,"Anggota Biro")).join(""):'<div class="org-no-members">Belum ada anggota tercatat</div>')+
    '</div></section>';
}
function renderOrgField(unit) {
  const leaders=structurePeople(unit.id);
  const leaderNodes=leaders.map(person=>orgPersonBox(person,person.person_position||"Pengurus Bidang")).join("");
  const bureaus=state.units.filter(item=>item.parent_id===unit.id && item.unit_type==="bureau")
    .sort((a,b)=>a.sort_order-b.sort_order);
  const bureauRows=[];
  for(let i=0;i<bureaus.length;i+=2) bureauRows.push(bureaus.slice(i,i+2));
  const renderedRows=bureauRows.map(row=>'<div class="org-bureau-row">'+row.map(renderOrgBureau).join("")+'</div>').join("");
  return '<section class="org-field-branch"><header class="org-field-heading"><span>'+esc(unit.code==="bidang-1-internal"?"BIDANG I":unit.code==="bidang-2-eksternal"?"BIDANG II":"BIDANG III")+'</span><h3>'+esc(unit.name)+'</h3></header>'+
    '<div class="org-field-leaders">'+(leaderNodes||'<div class="org-empty">Nama pimpinan bidang belum diisi</div>')+'</div>'+
    '<div class="org-leader-to-bureau"></div>'+
    '<div class="org-bureau-stack">'+renderedRows+'</div></section>';
}
function renderStructure() {
  const rootUnit=state.units.find(unit=>unit.code==="pmii-febi");
  if(!rootUnit) return '<div class="empty">Data struktur belum tersedia.</div>';
  const executives=state.units.filter(unit=>unit.parent_id===rootUnit.id && unit.unit_type==="executive")
    .sort((a,b)=>a.sort_order-b.sort_order);
  const fields=state.units.filter(unit=>unit.parent_id===rootUnit.id && unit.unit_type==="field")
    .sort((a,b)=>a.sort_order-b.sort_order);
  const rootPerson=structurePeople(rootUnit.id)[0];
  const personCount=state.publicStructure.filter(person=>person.person_name).length;
  const periodName=state.periods?.find(period=>period.status==="active")?.name || "2026-2027";
  const executiveNodes=executives.map(renderOrgExecutive).join("");
  const fieldNodes=fields.map(renderOrgField).join("");
  return pageHeading("Struktur organisasi","Bagan resmi kepengurusan PMII Rayon Ekonomi dan Bisnis Islam.")+
    '<section class="org-document"><header class="org-document-heading"><div class="org-document-kicker">SUSUNAN PENGURUS</div><h2>PERGERAKAN MAHASISWA ISLAM INDONESIA</h2><h3>RAYON EKONOMI DAN BISNIS ISLAM</h3><p>MASA KHIDMAT '+esc(periodName==="2026-2027"?"2026/2027":periodName)+'</p><div class="org-document-meta"><span>'+personCount+' nama pengurus</span><span>Direktori terbuka untuk umum</span></div></header>'+
    '<div class="org-directory-actions"><a class="btn btn-ghost" href="./?struktur">Buka tautan publik ↗</a><button class="btn btn-ghost" type="button" data-print-organization>Cetak bagan</button></div>'+
    '<div class="notice">Bagan ini dapat dilihat oleh semua orang, termasuk pengunjung tanpa akun dan pengguna yang sudah login. Nama dan jabatan bersifat publik; menu penilaian, skor, dan evaluasi tetap dilindungi sesuai kewenangan struktural.</div>'+
    '<div class="org-chart-scroll"><div class="org-chart">'+
      '<div class="org-root-node">'+orgPersonBox(rootPerson,"Ketua Rayon")+'</div>'+
      '<div class="org-root-stem"></div>'+
      '<div class="org-major-branches">'+
        '<section class="org-executive-branch"><header class="org-branch-title"><span>UNSUR EKSEKUTIF</span><strong>Sekretariat & Keuangan</strong></header><div class="org-executive-grid">'+executiveNodes+'</div></section>'+
        fieldNodes+
      '</div></div></div>'+
    '<footer class="org-document-footer">SIGAP PMII FEBI · Sistem Informasi Evaluasi dan Penilaian Kepengurusan</footer></section>';
}
function descendantsOf(unitId) {
  const found=new Set([unitId]); let changed=true;
  while(changed){changed=false;for(const u of state.units){if(u.parent_id && found.has(u.parent_id) && !found.has(u.id)){found.add(u.id);changed=true;}}}
  return found;
}
function canManageUnit(unitId) {
  const selectedPeriod=periodActive();
  if(!selectedPeriod || selectedPeriod.status!=="active") return false;
  if(isAdmin()) return true;
  const periodId=selectedPeriod.id;
  return ownMemberships().some(m=>m.period_id===periodId && (
    m.role==="ketua_rayon" ||
    (["sekretaris_umum","bendahara_umum"].includes(m.role) && m.unit_id===unitId) ||
    (m.role==="kepala_bidang" && descendantsOf(m.unit_id).has(unitId)) ||
    (m.role==="sekretaris_bidang" && unitFor(unitId)?.unit_type==="bureau" && descendantsOf(m.unit_id).has(unitId)) ||
    (m.role==="koordinator_biro" && m.unit_id===unitId)
  ));
}
function manageableUnits() {
  return state.units.filter(u=>canManageUnit(u.id));
}
function managerMembershipForUnit(unitId) {
  const periodId=periodActive()?.id;
  return ownMemberships().find(m=>m.role==="admin") ||
    ownMemberships().find(m=>m.period_id===periodId && canManageUnit(unitId)) || null;
}
function canEvaluateTarget(target) {
  if(!target) return false;
  return target.user_id===state.user?.id || canManageUnit(target.unit_id);
}
function individualEvaluationTargets() {
  const registered=activeMemberships()
    .filter(m=>canEvaluateTarget(m))
    .map(m=>({
      ref:"membership:"+m.id,target_type:"membership",target_id:m.id,
      full_name:memberName(m),unit_id:m.unit_id,position_title:roleLabels[m.role]||m.role
    }));
  const nominal=state.roster
    .filter(m=>m.is_active && m.period_id===periodActive()?.id && canManageUnit(m.unit_id))
    .map(m=>({
      ref:"roster:"+m.id,target_type:"roster",target_id:m.id,
      full_name:m.full_name,unit_id:m.unit_id,position_title:m.position_title||"Anggota"
    }));
  return [...nominal,...registered].sort((a,b)=>a.full_name.localeCompare(b.full_name,"id"));
}
function bureauEvaluationTargets() {
  return manageableUnits()
    .filter(unit=>unit.unit_type==="bureau")
    .map(unit=>({
      ref:"unit:"+unit.id,target_type:"unit",target_id:unit.id,
      full_name:unit.name,unit_id:unit.id,position_title:"Penilaian kinerja biro"
    }))
    .sort((a,b)=>a.full_name.localeCompare(b.full_name,"id"));
}
function renderEvaluationCard(e) {
  const rosterTarget=e.subject_roster_id?state.roster.find(m=>m.id===e.subject_roster_id):null;
  const target=e.subject_membership_id?state.memberships.find(m=>m.id===e.subject_membership_id):null;
  const bureauTarget=e.subject_unit_id?unitFor(e.subject_unit_id):null;
  const evaluator=state.memberships.find(m=>m.id===e.evaluator_membership_id);
  const values=state.scores.filter(s=>s.evaluation_id===e.id);
  let weighted=0,weightTotal=0;
  for(const s of values){const c=state.criteria.find(x=>x.id===s.criterion_id);if(c){weighted+=Number(s.score)*Number(c.weight);weightTotal+=Number(c.weight);}}
  const score=weightTotal?(weighted/weightTotal*20).toFixed(1):"—";
  const displayName=bureauTarget?("Biro "+bureauTarget.name):(rosterTarget?.full_name||(target?memberName(target):"Pengurus"));
  const displayUnit=unitFor(bureauTarget?.parent_id||rosterTarget?.unit_id||target?.unit_id)?.name||"";
  const displayPosition=bureauTarget?"Penilaian kinerja biro":(rosterTarget?.position_title||(target?roleLabels[target.role]||target.role:""));
  const reviewAction=isAdmin()&&e.status==="submitted" ? '<div style="margin-top:12px"><button class="btn btn-ghost" data-review-evaluation="'+e.id+'">Tandai sudah ditinjau</button></div>' : "";
  const bureauReportAction=bureauTarget?'<div style="margin-top:12px"><button class="btn btn-ghost" data-print-bureau="'+bureauTarget.id+'">Cetak rapor biro</button></div>':"";
  return '<article class="eval-card"><div class="eval-meta"><div><h4>'+esc(displayName)+'</h4><div class="tiny muted">'+esc(displayUnit)+' · '+esc(displayPosition)+' · Dinilai oleh '+esc(evaluator?memberName(evaluator):"Pengurus")+'</div></div><span class="badge '+(e.status==="submitted"?"gold":e.status==="reviewed"?"":"grey")+'">'+esc(e.status==="submitted"?"Terkirim":e.status==="reviewed"?"Ditinjau":"Draft")+'</span></div><p>'+esc(e.strengths||"Belum ada catatan kekuatan.")+'</p><div class="small"><strong>Nilai akhir: '+score+(score==="—"?"":" / 100")+'</strong> <span class="muted">· '+dateText(e.created_at)+'</span></div><div class="tiny muted" style="margin-top:7px">Perbaikan: '+esc(e.improvements||"—")+' · Kendala: '+esc(e.obstacles||"—")+' · Rekomendasi: '+esc(e.recommendations||"—")+'</div>'+reviewAction+bureauReportAction+'</article>';
}
function renderEvaluationForm(kind,targets,criteria,p,evaluator) {
  const isBureau=kind==="bureau";
  const formId=isBureau?"bureau-evaluation-form":"individual-evaluation-form";
  const title=isBureau?"Buat penilaian kinerja biro":"Buat penilaian individu";
  const description=isBureau
    ?"Nilai kinerja satu biro sebagai unit kerja, bukan nilai personal anggota."
    :"Nilai kinerja satu orang pengurus atau anggota, termasuk anggota yang belum memiliki akun SIGAP.";
  const selectLabel=isBureau?"Biro yang dinilai":"Individu yang dinilai";
  const selectPlaceholder=isBureau?"Pilih biro":"Pilih nama pengurus atau anggota";
  const targetOptions=targets.map(item=>
    '<option value="'+item.ref+'">'+(isBureau?"Biro · ":"")+esc(item.full_name)+' · '+esc(unitFor(isBureau?unitFor(item.unit_id)?.parent_id:item.unit_id)?.name||"Unit")+(isBureau?"":" · "+esc(item.position_title))+'</option>'
  ).join("");
  const emptyMessage=isBureau
    ?"Belum ada biro dalam lingkup kewenangan Anda yang dapat dinilai."
    :"Belum ada individu dalam lingkup kewenangan Anda yang dapat dinilai.";
  if(!evaluator || !targets.length) return '<section class="panel"><div class="panel-head"><div><h3>'+title+'</h3><p>'+description+'</p></div></div><div class="empty">'+emptyMessage+'</div></section>';
  return '<section class="panel evaluation-form-panel"><div class="panel-head"><div><h3>'+title+'</h3><p>'+description+'</p></div><span class="badge gold">'+esc(p.name)+'</span></div>'+
    '<form id="'+formId+'" data-evaluation-kind="'+kind+'">'+
    '<div class="field"><label>'+selectLabel+'</label><select name="subject_ref" required><option value="">'+selectPlaceholder+'</option>'+targetOptions+'</select></div>'+
    '<div class="notice">'+(isBureau
      ?"Indikator dan catatan berikut menilai kinerja biro secara keseluruhan. Untuk menilai koordinator atau anggota tertentu, gunakan Penilaian Individu."
      :"Formulir ini hanya menerima sasaran individu. Untuk menilai kinerja satu biro secara keseluruhan, gunakan Penilaian Biro.")+' Skala nilai 1–5; bobot indikator berjumlah 100%.</div>'+
    criteria.map(c=>'<div class="criterion-row"><div><strong>'+esc(c.name)+' <span class="muted">('+Number(c.weight)+'%)</span></strong><small>'+esc(c.description||"")+'</small></div><select name="score_'+c.id+'" required><option value="3">3 · Cukup</option><option value="1">1 · Sangat kurang</option><option value="2">2 · Kurang</option><option value="4">4 · Baik</option><option value="5">5 · Sangat baik</option></select></div>').join("")+
    '<div class="field"><label>Hal yang sudah berjalan baik</label><textarea name="strengths" placeholder="'+(isBureau?"Tuliskan capaian utama dan praktik baik biro…":"Tuliskan capaian atau praktik baik individu…")+'"></textarea></div>'+
    '<div class="field"><label>Hal yang perlu ditingkatkan</label><textarea name="improvements" placeholder="Tuliskan hal yang perlu diperbaiki…"></textarea></div>'+
    '<div class="field"><label>Kendala yang dihadapi</label><textarea name="obstacles" placeholder="Tuliskan kendala yang ditemukan…"></textarea></div>'+
    '<div class="field"><label>Rekomendasi dan target berikutnya</label><textarea name="recommendations" placeholder="Tuliskan langkah perbaikan…"></textarea></div>'+
    '<div class="form-actions"><button class="btn" type="submit">'+(isBureau?"Kirim penilaian biro":"Kirim penilaian individu")+'</button></div></form></section>';
}
function renderEvaluations() {
  const p=periodActive();
  const mode=state.evaluationMode==="bureau"?"bureau":"individual";
  const isBureau=mode==="bureau";
  const individualTargets=individualEvaluationTargets();
  const bureauTargets=bureauEvaluationTargets();
  const criteria=state.criteria.filter(c=>c.period_id===null || c.period_id===p?.id);
  const evaluator=ownEvaluatorMembership();
  const query=(state.searchQuery||"").trim().toLocaleLowerCase("id");
  const individualList=state.evaluations.filter(e=>e.period_id===p?.id && !e.subject_unit_id && (e.subject_membership_id || e.subject_roster_id));
  const bureauList=state.evaluations.filter(e=>e.period_id===p?.id && !!e.subject_unit_id);
  const filterList=items=>items.filter(e=>{
    if(!query) return true;
    const person=evaluationPerson(e);
    return [person.name,person.unit,person.position,person.evaluator].some(v=>String(v||"").toLocaleLowerCase("id").includes(query));
  });
  const activeList=filterList(isBureau?bureauList:individualList);
  const activeTargets=isBureau?bureauTargets:individualTargets;
  if(!p) return pageHeading("Penilaian & evaluasi","Penilaian individu dan kinerja biro dikelola pada bagian terpisah.")+
    '<div class="empty"><strong>Belum ada periode kepengurusan</strong>Admin perlu membuat dan mengaktifkan periode terlebih dahulu.</div>';
  const form=renderEvaluationForm(mode,activeTargets,criteria,p,evaluator);
  const tabs='<div class="evaluation-switcher" role="tablist" aria-label="Jenis penilaian">'+
    '<button type="button" class="evaluation-tab '+(!isBureau?"active":"")+'" data-evaluation-mode="individual" role="tab" aria-selected="'+(!isBureau)+'"><span class="evaluation-tab-icon">♙</span><span><strong>Penilaian Individu</strong><small>Pengurus dan anggota per orang</small></span><b>'+individualList.length+'</b></button>'+
    '<button type="button" class="evaluation-tab '+(isBureau?"active":"")+'" data-evaluation-mode="bureau" role="tab" aria-selected="'+isBureau+'"><span class="evaluation-tab-icon">▦</span><span><strong>Penilaian Biro</strong><small>Kinerja unit biro secara keseluruhan</small></span><b>'+bureauList.length+'</b></button>'+
    '</div>';
  const historyTitle=isBureau?"Riwayat penilaian biro":"Riwayat penilaian individu";
  const historyDescription=isBureau
    ?"Hanya penilaian kinerja biro yang berada dalam lingkup akses Anda."
    :"Hanya penilaian individu yang berada dalam lingkup akses Anda.";
  const history='<section class="panel evaluation-history-panel"><div class="panel-head"><div><h3>'+historyTitle+'</h3><p>'+historyDescription+'</p></div><span class="badge">'+activeList.length+' catatan</span></div>'+
    '<div class="eval-grid">'+(activeList.length?activeList.map(renderEvaluationCard).join(""):'<div class="empty"><strong>Belum ada riwayat '+(isBureau?"penilaian biro":"penilaian individu")+'</strong>'+(isBureau?"Penilaian kinerja biro akan muncul setelah dikirim.":"Penilaian setiap individu akan muncul setelah dikirim.")+'</div>')+'</div></section>';
  return pageHeading("Penilaian & evaluasi","Pilih penilaian individu atau penilaian kinerja biro. Keduanya memiliki formulir dan riwayat masing-masing.")+
    tabs+
    '<div class="evaluation-workspace"><div class="stack">'+form+'</div>'+history+'</div>';
}
function renderReportCard(r) {
  const unit=unitFor(r.unit_id);
  const owner=state.memberships.find(m=>m.id===r.created_by_membership_id);
  const ownerCanEdit=owner?.user_id===state.user?.id && ["draft","revision_requested"].includes(r.status);
  const managerCanEdit=canManageUnit(r.unit_id) && ["draft","revision_requested"].includes(r.status);
  const canSubmit=owner?.user_id===state.user?.id && ["draft","revision_requested"].includes(r.status);
  const canReview=canManageUnit(r.unit_id) && r.status==="submitted";
  const evidence=r.evidence_url?'<a class="tiny" href="'+esc(r.evidence_url)+'" target="_blank" rel="noopener">Buka bukti kegiatan ↗</a>':"";
  const actions=(ownerCanEdit||managerCanEdit?'<button class="btn btn-ghost" data-edit-report="'+r.id+'">Edit laporan</button>':"")+
    (canSubmit?'<button class="btn" data-submit-report="'+r.id+'">Kirim laporan</button>':"")+
    (canReview?'<button class="btn" data-review-report="'+r.id+'" data-status="approved">Setujui</button><button class="btn btn-danger" data-review-report="'+r.id+'" data-status="revision_requested">Minta revisi</button>':"");
  return '<article class="report-card"><div class="eval-meta"><div><h4>'+esc(r.title)+'</h4><div class="tiny muted">'+esc(unit?.name||"Unit")+' · '+dateText(r.activity_date||r.created_at)+'</div></div><span class="badge '+(r.status==="approved"?"":r.status==="revision_requested"?"red":"gold")+'">'+esc(({draft:"Draft",submitted:"Terkirim",approved:"Disetujui",revision_requested:"Perlu revisi"})[r.status]||r.status)+'</span></div><p>'+esc(r.description||"Tidak ada deskripsi.")+'</p><div class="tiny muted">Target: '+esc(r.target||"—")+' · Realisasi: '+esc(r.realization||"—")+'</div><div class="row between wrap" style="margin-top:10px">'+evidence+'<div class="row wrap">'+actions+'</div></div>'+(r.reviewer_notes?'<div class="notice warn" style="margin-top:10px">Catatan peninjau: '+esc(r.reviewer_notes)+'</div>':"")+'</article>';
}
function renderReports() {
  const p=periodActive();
  if(!p) return pageHeading("Laporan kegiatan","Dokumentasikan program kerja, target, realisasi, dan bukti kegiatan.")+'<div class="empty"><strong>Belum ada periode kepengurusan</strong>Admin perlu membuat periode aktif terlebih dahulu.</div>';
  const mine=ownMemberships().filter(m=>m.period_id===p.id);
  const reports=state.reports.filter(r=>r.period_id===p.id);
  const membershipOptions=mine.map(m=>'<option value="'+m.id+'">'+esc(unitName(m))+' · '+esc(roleLabels[m.role]||m.role)+'</option>').join("");
  return pageHeading("Laporan kegiatan","Dokumentasikan program kerja, target, realisasi, dan bukti kegiatan.")+
    '<div class="split"><section class="panel"><div class="panel-head"><div><h3>Tambah laporan kegiatan</h3><p>Pilih unit yang melaksanakan kegiatan.</p></div></div>'+
    (mine.length?'<form id="report-form"><div class="field"><label>Unit pelaksana</label><select name="membership_id" required>'+membershipOptions+'</select></div><div class="field"><label>Judul kegiatan / laporan</label><input name="title" required maxlength="140" placeholder="Nama kegiatan atau progres kerja"></div><div class="field"><label>Deskripsi</label><textarea name="description" placeholder="Ringkasan kegiatan…"></textarea></div><div class="field"><label>Target</label><textarea name="target" placeholder="Target yang direncanakan…"></textarea></div><div class="field"><label>Realisasi</label><textarea name="realization" placeholder="Hasil yang telah dicapai…"></textarea></div><div class="form-grid"><div class="field"><label>Tanggal rencana</label><input name="planned_date" type="date"></div><div class="field"><label>Tanggal kegiatan</label><input name="activity_date" type="date"></div></div><div class="field"><label>Tautan bukti / dokumentasi</label><input name="evidence_url" type="url" placeholder="https://…"></div><div class="form-actions"><button class="btn" type="submit">Simpan laporan</button></div></form>':'<div class="empty"><strong>Penugasan belum tersedia</strong>Admin perlu menetapkan jabatan Anda pada periode ini.</div>')+
    '</section><section class="panel"><div class="panel-head"><div><h3>Arsip laporan</h3><p>'+reports.length+' laporan pada periode terpilih</p></div></div><div class="report-list">'+(reports.length?reports.map(renderReportCard).join(""):'<div class="empty"><strong>Belum ada laporan</strong>Catatan kegiatan akan tampil di sini.</div>')+'</div></section></div>';
}
function openReportEditor(id) {
  const report=state.reports.find(r=>r.id===id);
  if(!report || !["draft","revision_requested"].includes(report.status)) return;
  const owner=state.memberships.find(m=>m.id===report.created_by_membership_id);
  const authorizedOwner=owner?.user_id===state.user?.id;
  const authorizedManager=canManageUnit(report.unit_id);
  if(!authorizedOwner && !authorizedManager) return;
  const field=(label,name,value,type="text")=>'<div class="field"><label>'+label+'</label><input name="'+name+'" type="'+type+'" value="'+esc(value||"")+'"></div>';
  const overlay=document.createElement("div");
  overlay.className="modal-backdrop";
  overlay.innerHTML='<form class="modal" id="edit-report-form"><div class="row between"><h3>Edit laporan kegiatan</h3><button type="button" class="btn btn-ghost" id="close-edit-report">Tutup</button></div>'+field("Judul kegiatan","title",report.title)+'<div class="field"><label>Deskripsi</label><textarea name="description">'+esc(report.description||"")+'</textarea></div><div class="field"><label>Target</label><textarea name="target">'+esc(report.target||"")+'</textarea></div><div class="field"><label>Realisasi</label><textarea name="realization">'+esc(report.realization||"")+'</textarea></div><div class="form-grid">'+field("Tanggal rencana","planned_date",report.planned_date,"date")+field("Tanggal kegiatan","activity_date",report.activity_date,"date")+'</div>'+field("Tautan bukti","evidence_url",report.evidence_url,"url")+'<div class="form-actions"><button class="btn" type="submit">Simpan perubahan</button></div></form>';
  document.body.appendChild(overlay);
  overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove();});
  $("#close-edit-report",overlay).addEventListener("click",()=>overlay.remove());
  $("#edit-report-form",overlay).addEventListener("submit",async e=>{
    e.preventDefault();
    const values=Object.fromEntries(new FormData(e.currentTarget).entries());
    const submit=e.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;
    try {
      await api("activity_reports?id=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({
        title:values.title,description:values.description||null,target:values.target||null,
        realization:values.realization||null,planned_date:values.planned_date||null,
        activity_date:values.activity_date||null,evidence_url:values.evidence_url||null
      })});
      overlay.remove();toast("Laporan berhasil diperbarui.");await loadData();renderShell();
    } catch(error) {toast(error.message,true);submit.disabled=false;}
  });
}
function renderRoster() {
  const p=periodActive();
  if(!p) return pageHeading("Data anggota & rapor","Catat nama pengurus/anggota dan susun rapor penilaian.")+
    '<div class="empty"><strong>Belum ada periode aktif</strong>Admin Sistem perlu mengaktifkan periode sebelum data anggota dibuat.</div>';
  if(p.status!=="active") return pageHeading("Data anggota & rapor","Data nominal hanya dapat dikelola pada periode yang sedang aktif.")+
    '<div class="empty"><strong>Periode ini sudah diarsipkan</strong>Pilih periode aktif pada bagian atas untuk menambah atau memperbarui data anggota.</div>';
  const units=manageableUnits();
  const allowed=new Set(units.map(u=>u.id));
  const query=(state.searchQuery||"").trim().toLocaleLowerCase("id");
  const people=state.roster.filter(m=>m.period_id===p.id && allowed.has(m.unit_id) &&
    (!query || [m.full_name,m.nim,m.position_title,unitFor(m.unit_id)?.name].some(v=>String(v||"").toLocaleLowerCase("id").includes(query))))
    .sort((a,b)=>a.full_name.localeCompare(b.full_name,"id"));
  const unitOptions=units.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join("");
  return pageHeading("Data anggota & rapor","Masukkan nama orang yang berada di bawah unit Anda. Mereka tidak perlu membuat akun SIGAP untuk dicatat dan dinilai.")+
    '<div class="notice">Daftar ini adalah data keanggotaan/rapor organisasi, bukan akun login. Ketua Rayon mengelola seluruh unit; Kepala Bidang mengelola bidang dan semua biro serta dapat melihat penilaian Sekretaris Bidang; Sekretaris Bidang mengelola biro di bawahnya; Koordinator Biro hanya mengelola bironya.</div>'+
    '<div class="split"><section class="panel"><div class="panel-head"><div><h3>Tambah anggota</h3><p>Data akan masuk ke struktur dan dapat dipilih pada formulir penilaian.</p></div></div>'+
    '<form id="roster-form"><div class="field"><label>Nama lengkap</label><input name="full_name" required maxlength="120" placeholder="Nama anggota"></div><div class="field"><label>Unit / biro</label><select name="unit_id" required><option value="">Pilih unit</option>'+unitOptions+'</select></div><div class="field"><label>Jabatan dalam unit</label><input name="position_title" maxlength="100" placeholder="Contoh: Anggota / Staf Kaderisasi" value="Anggota"></div><div class="form-grid"><div class="field"><label>NIM (opsional)</label><input name="nim" maxlength="40" placeholder="Nomor induk mahasiswa"></div><div class="field"><label>Angkatan (opsional)</label><input name="cohort" maxlength="20" placeholder="Contoh: 2024"></div></div><div class="form-actions"><button class="btn" type="submit">Simpan nama anggota</button></div></form></section>'+
    '<section class="panel"><div class="panel-head"><div><h3>Daftar anggota nominal</h3><p>'+people.filter(x=>x.is_active).length+' aktif · '+people.filter(x=>!x.is_active).length+' diarsipkan · '+esc(p.name)+'</p></div></div>'+
    (people.length?'<div class="table-wrap"><table><thead><tr><th>Nama</th><th>Unit</th><th>NIM</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+people.map(m=>'<tr><td><strong>'+esc(m.full_name)+'</strong><div class="tiny muted">'+esc(m.position_title||"Anggota")+(m.cohort?" · Angkatan "+esc(m.cohort):"")+'</div></td><td>'+esc(unitFor(m.unit_id)?.name||"")+'</td><td>'+esc(m.nim||"—")+'</td><td><span class="badge '+(m.is_active?"":"grey")+'">'+(m.is_active?"Aktif":"Diarsipkan")+'</span></td><td><div class="table-action"><button class="btn btn-ghost" data-edit-roster="'+m.id+'">Edit</button><button class="btn btn-ghost" data-print-roster="'+m.id+'">Cetak rapor</button><button class="btn btn-ghost" data-toggle-roster="'+m.id+'" data-active="'+(!m.is_active)+'">'+(m.is_active?"Arsipkan":"Aktifkan")+'</button></div></td></tr>').join("")+'</tbody></table></div>':'<div class="empty"><strong>Belum ada nama anggota</strong>Tambahkan nama pada formulir di sebelah kiri. Mereka tidak perlu memiliki akun login.</div>')+
    '</section></div>';
}
async function saveRoster(form) {
  const v=Object.fromEntries(new FormData(form).entries());
  const p=periodActive();
  if(!p) throw new Error("Belum ada periode kepengurusan yang aktif.");
  if(!canManageUnit(v.unit_id)) throw new Error("Anda tidak memiliki kewenangan mengelola unit tersebut.");
  const creator=managerMembershipForUnit(v.unit_id);
  if(!creator) throw new Error("Penugasan struktural Anda belum aktif pada periode ini.");
  await api("member_roster",{method:"POST",body:JSON.stringify({
    period_id:p.id,unit_id:v.unit_id,full_name:v.full_name.trim(),
    nim:v.nim||null,cohort:v.cohort||null,position_title:v.position_title||"Anggota",
    created_by_membership_id:creator.id,is_active:true
  })});
  toast("Nama anggota berhasil disimpan. Sekarang dapat dipilih untuk penilaian dan rapor.");
  await loadData();state.view="roster";renderShell();
}
function openRosterEditor(id) {
  const person=state.roster.find(m=>m.id===id);
  if(!person || !canManageUnit(person.unit_id)) return;
  const overlay=document.createElement("div");
  overlay.className="modal-backdrop";
  overlay.innerHTML='<form class="modal" id="edit-roster-form"><div class="row between"><h3>Edit data anggota</h3><button type="button" class="btn btn-ghost" id="close-edit-roster">Tutup</button></div><input type="hidden" name="id" value="'+person.id+'"><div class="field"><label>Nama lengkap</label><input name="full_name" required maxlength="120" value="'+esc(person.full_name)+'"></div><div class="field"><label>Jabatan dalam unit</label><input name="position_title" maxlength="100" value="'+esc(person.position_title||"Anggota")+'"></div><div class="form-grid"><div class="field"><label>NIM</label><input name="nim" maxlength="40" value="'+esc(person.nim||"")+'"></div><div class="field"><label>Angkatan</label><input name="cohort" maxlength="20" value="'+esc(person.cohort||"")+'"></div></div><div class="form-actions"><button class="btn" type="submit">Simpan perubahan</button></div></form>';
  document.body.appendChild(overlay);
  overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove();});
  $("#close-edit-roster",overlay).addEventListener("click",()=>overlay.remove());
  $("#edit-roster-form",overlay).addEventListener("submit",async e=>{
    e.preventDefault();
    const values=Object.fromEntries(new FormData(e.currentTarget).entries());
    const button=e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;
    try {
      await api("member_roster?id=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({
        full_name:values.full_name.trim(),position_title:values.position_title||"Anggota",
        nim:values.nim||null,cohort:values.cohort||null
      })});
      overlay.remove();toast("Data anggota diperbarui.");await loadData();renderShell();
    } catch(error){toast(error.message,true);button.disabled=false;}
  });
}
function printRosterReport(id) {
  const person=state.roster.find(m=>m.id===id);
  if(!person) return;
  const evaluations=state.evaluations.filter(e=>e.subject_roster_id===id && e.period_id===person.period_id)
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const period=state.periods.find(p=>p.id===person.period_id);
  const unit=unitFor(person.unit_id);
  const evalHtml=evaluations.length?evaluations.map((e,index)=>{
    const scores=state.scores.filter(s=>s.evaluation_id===e.id);
    let weighted=0,total=0;
    const rows=scores.map(s=>{
      const criterion=state.criteria.find(c=>c.id===s.criterion_id);
      if(!criterion) return "";
      weighted+=Number(s.score)*Number(criterion.weight);total+=Number(criterion.weight);
      return '<tr><td>'+esc(criterion.name)+'</td><td>'+Number(criterion.weight)+'%</td><td>'+Number(s.score)+'/5</td></tr>';
    }).join("");
    const final=total?(weighted/total*20).toFixed(1):"—";
    return '<section class="entry"><h2>Penilaian '+(index+1)+' · '+dateText(e.created_at)+'</h2><p class="score">Nilai akhir: <strong>'+final+(final==="—"?"":" / 100")+'</strong></p><table><thead><tr><th>Indikator</th><th>Bobot</th><th>Skor</th></tr></thead><tbody>'+rows+'</tbody></table><h3>Kekuatan</h3><p>'+esc(e.strengths||"—")+'</p><h3>Hal yang perlu ditingkatkan</h3><p>'+esc(e.improvements||"—")+'</p><h3>Kendala</h3><p>'+esc(e.obstacles||"—")+'</p><h3>Rekomendasi</h3><p>'+esc(e.recommendations||"—")+'</p></section>';
  }).join(""):'<p>Belum ada penilaian untuk anggota ini.</p>';
  const popup=window.open("","_blank");
  if(!popup){toast("Izinkan pop-up browser untuk mencetak rapor.",true);return;}
  popup.document.write('<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Rapor - '+esc(person.full_name)+'</title><style>body{font:14px Arial,sans-serif;color:#17251e;margin:32px;line-height:1.5}h1{font-size:24px;margin-bottom:4px}h2{font-size:17px;border-bottom:1px solid #bbb;padding-bottom:6px}h3{font-size:13px;margin:12px 0 2px}p{margin:2px 0 8px}.meta{margin:18px 0;padding:14px;border:1px solid #ccc;border-radius:8px}.score{font-size:18px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{text-align:left;border:1px solid #ccc;padding:7px}.entry{page-break-inside:avoid;border-top:2px solid #234c37;margin-top:22px;padding-top:4px}.muted{color:#66736b}@media print{body{margin:16mm}.entry{break-inside:avoid}}</style></head><body><h1>RAPOR ANGGOTA PMII FEBI</h1><p class="muted">Sistem Informasi Evaluasi dan Penilaian Kepengurusan</p><div class="meta"><p><b>Nama:</b> '+esc(person.full_name)+'</p><p><b>NIM:</b> '+esc(person.nim||"—")+'</p><p><b>Angkatan:</b> '+esc(person.cohort||"—")+'</p><p><b>Jabatan:</b> '+esc(person.position_title||"Anggota")+'</p><p><b>Unit:</b> '+esc(unit?.name||"—")+'</p><p><b>Periode:</b> '+esc(period?.name||"—")+'</p></div>'+evalHtml+'<p class="muted" style="margin-top:36px">Dokumen dihasilkan dari SIGAP PMII FEBI.</p><script>window.onload=()=>window.print();<\/script></body></html>');
  popup.document.close();
}
function printBureauReport(unitId) {
  const unit=unitFor(unitId), p=periodActive();
  if(!unit || !p || !canManageUnit(unitId)) return;
  const evaluations=state.evaluations.filter(e=>e.subject_unit_id===unitId && e.period_id===p.id)
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const parent=unitFor(unit.parent_id);
  const entries=evaluations.map((e,index)=>{
    const rows=state.scores.filter(score=>score.evaluation_id===e.id).map(score=>{
      const criterion=state.criteria.find(c=>c.id===score.criterion_id);
      return criterion?'<tr><td>'+esc(criterion.name)+'</td><td>'+Number(criterion.weight)+'%</td><td>'+Number(score.score)+'/5</td></tr>':"";
    }).join("");
    const final=scoreForEvaluation(e);
    return '<section class="entry"><h2>Penilaian '+(index+1)+' · '+dateText(e.created_at)+'</h2><p class="score">Nilai akhir: <strong>'+(final===null?"—":final.toFixed(1)+" / 100")+'</strong></p><table><thead><tr><th>Indikator</th><th>Bobot</th><th>Skor</th></tr></thead><tbody>'+rows+'</tbody></table><h3>Kekuatan</h3><p>'+esc(e.strengths||"—")+'</p><h3>Hal yang perlu ditingkatkan</h3><p>'+esc(e.improvements||"—")+'</p><h3>Kendala</h3><p>'+esc(e.obstacles||"—")+'</p><h3>Rekomendasi</h3><p>'+esc(e.recommendations||"—")+'</p></section>';
  }).join("") || "<p>Belum ada penilaian untuk biro ini.</p>";
  const popup=window.open("","_blank");
  if(!popup){toast("Izinkan pop-up browser untuk mencetak rapor biro.",true);return;}
  popup.document.write('<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Rapor Biro '+esc(unit.name)+'</title><style>body{font:14px Arial,sans-serif;color:#17251e;margin:32px;line-height:1.5}h1{font-size:24px;margin-bottom:4px}h2{font-size:17px;border-bottom:1px solid #bbb;padding-bottom:6px}h3{font-size:13px;margin:12px 0 2px}p{margin:2px 0 8px}.meta{margin:18px 0;padding:14px;border:1px solid #ccc;border-radius:8px}.score{font-size:18px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{text-align:left;border:1px solid #ccc;padding:7px}.entry{page-break-inside:avoid;border-top:2px solid #234c37;margin-top:22px;padding-top:4px}.muted{color:#66736b}@media print{body{margin:16mm}.entry{break-inside:avoid}}</style></head><body><h1>RAPOR KINERJA BIRO</h1><p class="muted">SIGAP PMII FEBI · '+esc(p.name)+'</p><div class="meta"><p><b>Nama biro:</b> '+esc(unit.name)+'</p><p><b>Bidang:</b> '+esc(parent?.name||"—")+'</p><p><b>Periode:</b> '+esc(p.name)+'</p></div>'+entries+'<p class="muted" style="margin-top:36px">Dokumen dihasilkan dari SIGAP PMII FEBI.</p><script>window.onload=()=>window.print();<\\/script></body></html>');
  popup.document.close();
}
function renderAdmin() {
  const pending=state.profiles.filter(p=>p.account_status==="pending");
  const approved=state.profiles.filter(p=>p.account_status==="active");
  const periods=state.periods;
  const active=periods.find(p=>p.status==="active");
  return pageHeading("Panel administrasi","Kelola pendaftar, periode kepengurusan, dan penempatan jabatan.")+
    '<div class="notice">Admin sistem mengatur akses aplikasi. Jabatan struktural tetap mengikuti garis komando organisasi. Jangan berikan role admin kepada pengurus tanpa mandat yang jelas.</div>'+
    '<div class="stack"><section class="panel"><div class="panel-head"><div><h3>Pendaftar menunggu persetujuan</h3><p>Setujui akun sebelum memberikan penempatan jabatan.</p></div><span class="badge gold">'+pending.length+' menunggu</span></div>'+
    (pending.length?'<div class="table-wrap"><table><thead><tr><th>Nama</th><th>NIM</th><th>Tanggal daftar</th><th>Aksi</th></tr></thead><tbody>'+pending.map(p=>'<tr><td><strong>'+esc(p.full_name||"Belum mengisi nama")+'</strong></td><td>'+esc(p.nim||"—")+'</td><td>'+dateText(p.created_at)+'</td><td><button class="btn btn-ghost" data-approve="'+p.id+'">Setujui akun</button></td></tr>').join("")+'</tbody></table></div>':'<div class="empty"><strong>Tidak ada pendaftar tertunda</strong>Pendaftar baru akan muncul di bagian ini.</div>')+
    '</section><div class="split"><section class="panel"><div class="panel-head"><div><h3>Periode kepengurusan</h3><p>Hanya satu periode dapat aktif dalam satu waktu.</p></div><span class="badge '+(active?"":"gold")+'">'+(active?esc(active.name):"Belum ada periode aktif")+'</span></div>'+
    '<form id="period-form"><div class="field"><label>Nama periode</label><input name="name" required placeholder="Contoh: 2026–2027"></div><div class="form-grid"><div class="field"><label>Tanggal mulai</label><input name="starts_on" type="date"></div><div class="field"><label>Tanggal akhir</label><input name="ends_on" type="date"></div></div><label class="small"><input type="checkbox" name="activate" '+(!active?"checked":"")+'> Jadikan periode aktif</label><div class="form-actions"><button class="btn" type="submit">Buat periode</button></div></form>'+
    (periods.length?'<div style="margin-top:18px"><div class="tiny muted" style="margin-bottom:8px">DAFTAR PERIODE</div>'+periods.map(p=>'<div class="unit-row" style="padding:9px 0;border-top:1px solid var(--line)"><div><strong class="small">'+esc(p.name)+'</strong><div class="tiny muted">'+dateText(p.starts_on)+' – '+dateText(p.ends_on)+'</div></div><div class="table-action"><span class="badge '+(p.status==="active"?"":"grey")+'">'+esc(p.status)+'</span>'+(p.status!=="active"?'<button class="btn btn-ghost" data-set-active="'+p.id+'">Aktifkan</button>':'')+'</div></div>').join("")+'</div>':'')+
    '</section><section class="panel"><div class="panel-head"><div><h3>Penempatan jabatan</h3><p>Tetapkan role dan unit pengurus yang telah disetujui.</p></div></div>'+
    (active?'<form id="assign-form"><div class="field"><label>Pengurus</label><select name="user_id" required><option value="">Pilih pengurus aktif</option>'+approved.map(p=>'<option value="'+p.id+'">'+esc(p.full_name)+' · '+esc(p.nim||"tanpa NIM")+'</option>').join("")+'</select></div><div class="field"><label>Periode</label><select name="period_id" required><option value="'+active.id+'">'+esc(active.name)+' · Aktif</option>'+periods.filter(p=>p.status!=="active").map(p=>'<option value="'+p.id+'">'+esc(p.name)+' · '+esc(p.status)+'</option>').join("")+'</select></div><div class="field"><label>Jabatan / role</label><select name="role" required><option value="">Pilih role</option>'+Object.entries(roleLabels).map(([key,label])=>'<option value="'+key+'">'+esc(label)+'</option>').join("")+'</select></div><div class="field"><label>Unit organisasi</label><select name="unit_id" required><option value="">Pilih bidang / biro / rayon</option>'+state.units.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join("")+'</select></div><div class="field"><label>Nama posisi (opsional)</label><input name="position_title" placeholder="Contoh: Koordinator Kaderisasi"></div><div class="form-actions"><button class="btn" type="submit">Simpan penempatan</button></div></form>':'<div class="empty"><strong>Aktifkan periode terlebih dahulu</strong>Penempatan jabatan membutuhkan periode kepengurusan.</div>')+
    '</section></div><section class="panel"><div class="panel-head"><div><h3>Ringkasan akun disetujui</h3><p>'+approved.length+' akun aktif pada sistem.</p></div></div><div class="table-wrap"><table><thead><tr><th>Nama</th><th>NIM</th><th>Status</th></tr></thead><tbody>'+(approved.length?approved.map(p=>'<tr><td>'+esc(p.full_name)+'</td><td>'+esc(p.nim||"—")+'</td><td><span class="badge">Aktif</span></td></tr>').join(""):'<tr><td colspan="3" class="muted">Belum ada akun aktif.</td></tr>')+'</tbody></table></div></section></div>';
}

function renderAdminSettings(){
  if(!isAdmin()) return renderOverview();
  const s={...DEFAULT_SYSTEM_SETTINGS,...(state.systemSettings||{})};
  const logs=state.auditLogs||[];
  const resettableProfiles=(state.adminAccounts||[])
    .filter(p=>p.id!==state.user?.id)
    .sort((a,b)=>(a.full_name||"").localeCompare(b.full_name||"","id"));
  const resetOptions=resettableProfiles.map(p=>{
    const membership=state.memberships.find(m=>m.user_id===p.id && m.status==="active" && m.role!=="admin");
    const role=membership?(membership.position_title||roleLabels[membership.role]||membership.role):"Pengurus";
    return '<option value="'+p.id+'">'+esc(p.full_name||"Pengurus")+' · '+esc(role)+(p.nim?' · '+esc(p.nim):"")+'</option>';
  }).join("");
  const logRows=logs.length?logs.map(log=>{
    const actor=profileFor(log.actor_user_id)?.full_name||"Admin / sistem";
    const stamp=log.created_at?new Date(log.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"}):"—";
    return '<tr><td>'+esc(stamp)+'</td><td>'+esc(actor)+'</td><td>'+esc(log.action||"—")+'</td><td>'+esc(log.table_name||"—")+'</td></tr>';
  }).join(""):'<tr><td colspan="4"><div class="empty compact-empty">Belum ada aktivitas yang tercatat.</div></td></tr>';
  return pageHeading("Pengaturan sistem","Kelola password akun anggota, identitas aplikasi, dan preferensi tampilan SIGAP.")+
    '<div class="settings-overview"><div><span class="eyebrow">AKUN ADMIN</span><strong>'+esc(state.profile?.full_name||"Administrator")+'</strong><small>'+esc(state.user?.email||"")+'</small></div><span class="badge success">Hak akses admin aktif</span></div>'+
    '<section class="panel account-management-panel"><div class="panel-head"><div><h3>Seluruh akun terdaftar</h3><p>'+state.adminAccounts.length+' akun · termasuk akun yang belum memiliki jabatan aktif.</p></div><button class="btn btn-ghost" type="button" data-refresh-admin-accounts>Perbarui daftar</button></div>'+
    (state.adminAccounts.length?'<div class="account-management-list">'+state.adminAccounts.map(account=>{
      const membership=(account.memberships||[]).find(m=>m.status==="active")||(account.memberships||[])[0]||null;
      const unitOptions=state.units.map(u=>'<option value="'+u.id+'" '+(membership?.unit_id===u.id?'selected':'')+'>'+esc(u.name)+'</option>').join("");
      const roleOptions=Object.entries(roleLabels).map(([key,label])=>'<option value="'+key+'" '+(membership?.role===key?'selected':'')+'>'+esc(label)+'</option>').join("");
      const membershipOptions=(account.memberships||[]).map(m=>'<option value="'+m.id+'" '+(membership?.id===m.id?'selected':'')+'>'+esc(m.position_title||roleLabels[m.role]||m.role)+' · '+esc(m.status)+'</option>').join("");
      return '<details class="account-management-item"><summary><span><strong>'+esc(account.full_name||"Tanpa nama")+'</strong><small>'+esc(account.email||"Email tidak tersedia")+' · '+esc(account.nim||"Tanpa NIM")+'</small></span><span class="badge '+(account.account_status==="active"?"success":"gold")+'">'+esc(account.account_status)+'</span></summary>'+
        '<form id="account-edit-form" class="account-edit-form" data-account-id="'+account.id+'"><input type="hidden" name="target_user_id" value="'+account.id+'">'+
        '<div class="account-edit-grid">'+
        '<div class="field"><label>Email login</label><input type="email" name="email" required value="'+esc(account.email||"")+'"></div>'+
        '<div class="field"><label>Nama lengkap</label><input name="full_name" required maxlength="120" value="'+esc(account.full_name||"")+'"></div>'+
        '<div class="field"><label>NIM</label><input name="nim" value="'+esc(account.nim||"")+'"></div>'+
        '<div class="field"><label>Angkatan</label><input name="cohort" value="'+esc(account.cohort||"")+'"></div>'+
        '<div class="field"><label>Nomor HP</label><input name="phone" value="'+esc(account.phone||"")+'"></div>'+
        '<div class="field"><label>Status akun</label><select name="account_status">'+["pending","active","rejected","suspended"].map(v=>'<option value="'+v+'" '+(account.account_status===v?'selected':'')+'>'+v+'</option>').join("")+'</select></div>'+
        (membership?'<div class="field"><label>Penugasan yang diedit</label><select name="membership_id">'+membershipOptions+'</select></div><div class="field"><label>Role</label><select name="role">'+roleOptions+'</select></div><div class="field"><label>Unit organisasi</label><select name="unit_id">'+unitOptions+'</select></div><div class="field"><label>Nama jabatan</label><input name="position_title" value="'+esc(membership.position_title||"")+'"></div>':'<div class="notice">Akun ini belum memiliki penugasan jabatan. Tetapkan jabatan melalui menu administrasi setelah menyimpan profil.</div>')+
        '</div><div class="form-actions"><button class="btn" type="submit">Simpan perubahan akun</button></div></form></details>';
    }).join("")+'</div>':'<div class="empty">Belum ada akun terdaftar.</div>')+'</section>'+'<div class="settings-grid">'+
      '<section class="panel settings-panel"><div class="panel-head"><div><h3>Reset password anggota</h3><p>'+resettableProfiles.length+' akun anggota aktif tersedia untuk diatur ulang.</p></div><span class="settings-icon">⌑</span></div>'+
        (resettableProfiles.length?
          '<form id="admin-reset-member-password-form">'+
            '<div class="field"><label>Pilih akun anggota</label><select name="target_user_id" required><option value="">Pilih anggota</option>'+resetOptions+'</select></div>'+
            '<div class="field"><label>Password baru</label><input name="new_password" type="password" autocomplete="new-password" minlength="8" maxlength="72" required placeholder="Minimal 8 karakter"></div>'+
            '<div class="field"><label>Ulangi password baru</label><input name="confirm_password" type="password" autocomplete="new-password" minlength="8" maxlength="72" required placeholder="Ketik ulang password baru"></div>'+
            '<div class="notice">Password lama anggota akan langsung diganti. Sampaikan password sementara ini secara pribadi kepada pemilik akun, lalu anjurkan untuk menggantinya setelah masuk.</div>'+
            '<div class="form-actions"><button class="btn" type="submit">Reset password anggota</button></div>'+
          '</form>'
          :'<div class="empty"><strong>Belum ada akun anggota aktif</strong>Akun anggota yang sudah disetujui dan memiliki penempatan aktif akan muncul di sini.</div>')+
      '</section>'+
      '<section class="panel settings-panel"><div class="panel-head"><div><h3>Identitas & tampilan</h3><p>Pengaturan ini berlaku untuk seluruh pengguna SIGAP.</p></div><span class="settings-icon">◈</span></div>'+
        '<form id="system-settings-form">'+
          '<div class="field"><label>Nama aplikasi</label><input name="app_name" maxlength="60" required value="'+esc(s.app_name)+'"></div>'+
          '<div class="field"><label>Subjudul aplikasi</label><input name="app_subtitle" maxlength="100" required value="'+esc(s.app_subtitle)+'"></div>'+
          '<div class="field"><label>Judul halaman masuk</label><textarea name="login_headline" rows="2" maxlength="100" required>'+esc(s.login_headline)+'</textarea></div>'+
          '<div class="field"><label>Deskripsi halaman masuk</label><textarea name="login_description" rows="3" maxlength="300" required>'+esc(s.login_description)+'</textarea></div>'+
          '<div class="field"><label>Tema warna</label><select name="theme_preset">'+
            '<option value="navy_gold" '+(s.theme_preset==="navy_gold"?"selected":"")+'>Navy & Emas — identitas PMII</option>'+
            '<option value="ocean_blue" '+(s.theme_preset==="ocean_blue"?"selected":"")+'>Biru Laut — formal</option>'+
            '<option value="forest_green" '+(s.theme_preset==="forest_green"?"selected":"")+'>Hijau — klasik</option>'+
          '</select></div>'+
          '<label class="settings-check"><input type="checkbox" name="compact_mode" '+(s.compact_mode?"checked":"")+'> Gunakan tampilan ringkas (jarak dan panel lebih padat)</label>'+
          '<div class="form-actions"><button class="btn" type="submit">Simpan kustomisasi</button></div>'+
        '</form>'+
      '</section>'+
    '</div>'+
    '<section class="panel settings-audit"><div class="panel-head"><div><h3>Riwayat aktivitas</h3><p>Catatan perubahan yang tersedia untuk admin.</p></div><button class="btn btn-ghost" type="button" data-refresh-audit>Segarkan</button></div>'+
      '<div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Data</th></tr></thead><tbody>'+logRows+'</tbody></table></div>'+
    '</section>';
}

function renderApprovals() {
  const pending=state.profiles.filter(p=>p.account_status==="pending");
  return pageHeading("Persetujuan akun","Tinjau pendaftaran anggota sebelum mereka dapat masuk dan menggunakan SIGAP.")+
    '<div class="notice">Persetujuan dapat dilakukan oleh Ketua Rayon, Sekretaris Umum, Bendahara Umum, dan Kepala Bidang. Koordinator Biro serta Anggota tidak memiliki hak persetujuan akun.</div>'+
    '<section class="panel"><div class="panel-head"><div><h3>Pendaftar menunggu persetujuan</h3><p>'+pending.length+' akun menunggu keputusan.</p></div><span class="badge gold">'+pending.length+' menunggu</span></div>'+
    (pending.length?'<div class="table-wrap"><table><thead><tr><th>Nama</th><th>NIM</th><th>Tanggal daftar</th><th>Keputusan</th></tr></thead><tbody>'+pending.map(p=>'<tr><td><strong>'+esc(p.full_name||"Belum mengisi nama")+'</strong></td><td>'+esc(p.nim||"—")+'</td><td>'+dateText(p.created_at)+'</td><td><div class="table-action"><button class="btn btn-ghost" data-approve="'+p.id+'">Setujui</button><button class="btn btn-ghost" data-reject="'+p.id+'">Tolak</button></div></td></tr>').join("")+'</tbody></table></div>':'<div class="empty"><strong>Tidak ada pendaftar tertunda</strong>Pendaftaran baru akan muncul di sini.</div>')+
    '</section>';
}
function renderView() {
  if(state.view==="approvals" && canApproveAccounts()) return renderApprovals();
  if(state.view==="roster" && manageableUnits().length) return renderRoster();
  if(state.view==="structure") return renderStructure();
  if(state.view==="evaluations") return renderEvaluations();
  if(state.view==="reports") return renderReports();
  if(state.view==="admin" && isAdmin()) return renderAdmin();
  if(state.view==="settings" && isAdmin()) return renderAdminSettings();
  return renderOverview();
}
function renderPublicStructure() {
  root.innerHTML='<div class="public-structure-shell"><header class="public-structure-top"><div class="public-structure-brand"><div class="brand-logo auth-logo"><img src="https://1.bp.blogspot.com/-_LPIjxug5bs/W1YpWUAw0FI/AAAAAAAAAac/26D9u4GoFe0qM9sdOUpfSyV0MH4RO1y0QCLcBGAs/s1600/logo_pmii_hd.png" alt="Lambang PMII"></div><div><strong>SIGAP PMII FEBI</strong><small>Direktori struktur kepengurusan</small></div></div>'+window.SIGAP_PWA.buttonMarkup("Pasang aplikasi","public-install-button")+'<button class="btn btn-ghost" id="back-to-login">Masuk / Daftar</button></header><main class="public-structure-main">'+renderStructure()+'<p class="tiny muted">Direktori publik hanya memuat nama, jabatan, dan unit. Data penilaian dan evaluasi hanya tersedia bagi pengurus berwenang setelah masuk.</p></main></div>';
  applySystemSettings();
}
function render() {
  if(!state.user) return state.publicMode?renderPublicStructure():renderAuth();
  if(!state.profile || state.profile.account_status!=="active") return renderPending();
  renderShell();
}
async function reload() {
  await loadProfile();
  if(state.profile?.account_status==="active") await loadData();
  render();
}
async function signOut() {
  try { if(state.session?.access_token) await authRequest("/logout",{method:"POST"},state.session.access_token); } catch(_){}
  saveSession(null); state.user=null; state.profile=null; state.publicMode=false; renderAuth();
}

async function adminAccountRequest(payload){
  if(!isAdmin()) throw new Error("Hanya Admin Sistem yang dapat mengelola seluruh akun.");
  const response=await fetch(API+"/functions/v1/admin-reset-password",{
    method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+(state.session?.access_token||""),"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error||"Permintaan pengelolaan akun gagal.");
  return result;
}
async function loadAdminAccounts(){
  const result=await adminAccountRequest({action:"list"});
  state.adminAccounts=result.accounts||[];
}
async function updateAdminAccount(form){
  const values=Object.fromEntries(new FormData(form).entries());
  const account=state.adminAccounts.find(a=>a.id===values.target_user_id);
  if(!account) throw new Error("Akun tidak ditemukan dalam daftar.");
  const payload={action:"update",...values};
  if(!values.membership_id){delete payload.membership_id;delete payload.role;delete payload.unit_id;delete payload.position_title;}
  await adminAccountRequest(payload);
  toast("Detail akun berhasil diperbarui.");
  await loadData();await loadAdminAccounts();renderShell();
}
async function resetMemberPassword(form){
  if(!isAdmin()) throw new Error("Hanya Admin Sistem yang dapat mereset password anggota.");
  const values=Object.fromEntries(new FormData(form).entries());
  const target=state.profiles.find(p=>p.id===values.target_user_id);
  if(!target || target.id===state.user?.id){
    throw new Error("Pilih akun lain yang terdaftar. Password akun admin sendiri tidak diubah dari menu ini.");
  }
  if(values.new_password.length<8 || values.new_password.length>72){
    throw new Error("Password baru harus terdiri dari 8 sampai 72 karakter.");
  }
  if(values.new_password!==values.confirm_password){
    throw new Error("Konfirmasi password baru tidak sama.");
  }
  const response=await fetch(API+"/functions/v1/admin-reset-password",{
    method:"POST",
    headers:{
      "apikey":KEY,
      "Authorization":"Bearer "+(state.session?.access_token||""),
      "Content-Type":"application/json"
    },
    body:JSON.stringify({action:"reset_password",target_user_id:target.id,new_password:values.new_password})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload.error||payload.message||"Password anggota gagal diperbarui.");
  form.reset();
  toast("Password akun "+(target.full_name||"anggota")+" berhasil direset. Sampaikan password baru secara pribadi.");
}

async function saveSystemSettings(form){
  if(!isAdmin()) throw new Error("Hanya admin sistem yang dapat mengubah kustomisasi.");
  const values=Object.fromEntries(new FormData(form).entries());
  const payload={
    app_name:String(values.app_name||"").trim(),
    app_subtitle:String(values.app_subtitle||"").trim(),
    login_headline:String(values.login_headline||"").trim(),
    login_description:String(values.login_description||"").trim(),
    theme_preset:values.theme_preset,
    compact_mode:!!form.elements.namedItem("compact_mode").checked,
    updated_at:new Date().toISOString()
  };
  if(payload.app_name.length<3 || payload.app_subtitle.length<3 || payload.login_headline.length<3 || payload.login_description.length<3){
    throw new Error("Lengkapi seluruh identitas dan deskripsi dengan minimal 3 karakter.");
  }
  await api("system_settings?id=eq.1",{method:"PATCH",body:JSON.stringify(payload)});
  await loadSystemSettings();
  renderShell();
  toast("Kustomisasi SIGAP berhasil disimpan untuk seluruh pengguna.");
}
async function handleAuth(form) {
  const values=Object.fromEntries(new FormData(form).entries());
  const signup=state.authMode==="signup";
  const path=signup?"/signup":"/token?grant_type=password";
  const body=signup?{email:values.email,password:values.password,data:{full_name:values.full_name,nim:values.nim||null,cohort:values.cohort||null}}:{email:values.email,password:values.password};
  let result=await authRequest(path,{method:"POST",body:JSON.stringify(body)});
  if(signup && !result.access_token) {
    // Some hosted Auth settings still return no session from signup. Auto-confirm is
    // performed by the database trigger, so try the normal password login immediately.
    try {
      result=await authRequest("/token?grant_type=password",{method:"POST",body:JSON.stringify({email:values.email,password:values.password})});
    } catch(loginError) {
      state.authMode="login"; renderAuth();
      toast("Pendaftaran tersimpan. Coba masuk dengan email dan password yang sama. "+loginError.message,true);
      return;
    }
  }
  if(result.access_token) {
    saveSession({...result,expires_at:Math.floor(Date.now()/1000)+(result.expires_in||3600)});
    state.user=result.user || await authRequest("/user",{method:"GET"},result.access_token);
    await reload();
    toast(signup?"Akun berhasil dibuat.":"Berhasil masuk ke SIGAP.");
  }
}
async function submitEvaluation(form,expectedKind) {
  const values=Object.fromEntries(new FormData(form).entries());
  const p=periodActive(); const evaluator=ownEvaluatorMembership();
  const kind=expectedKind==="bureau"?"bureau":"individual";
  if(!p || !evaluator) throw new Error("Periode atau penugasan evaluator belum tersedia.");
  const [subjectType,subjectId]=String(values.subject_ref||"").split(":");
  const valid=kind==="bureau"?subjectType==="unit":["roster","membership"].includes(subjectType);
  if(!subjectId || !valid) throw new Error(kind==="bureau"?"Pilih biro pada formulir Penilaian Biro.":"Pilih individu pada formulir Penilaian Individu.");
  const allowedTargets=kind==="bureau"?bureauEvaluationTargets():individualEvaluationTargets();
  if(!allowedTargets.some(target=>target.ref===values.subject_ref)) throw new Error("Sasaran penilaian berada di luar lingkup kewenangan Anda.");
  const criteria=state.criteria.filter(c=>c.period_id===null || c.period_id===p.id);
  const created=await api("evaluations",{method:"POST",body:JSON.stringify({
    period_id:p.id,evaluator_membership_id:evaluator.id,
    subject_membership_id:subjectType==="membership"?subjectId:null,
    subject_roster_id:subjectType==="roster"?subjectId:null,
    subject_unit_id:subjectType==="unit"?subjectId:null,
    status:"draft",strengths:values.strengths||null,improvements:values.improvements||null,
    obstacles:values.obstacles||null,recommendations:values.recommendations||null
  })});
  const evaluation=Array.isArray(created)?created[0]:created;
  const scores=criteria.map(c=>({evaluation_id:evaluation.id,criterion_id:c.id,score:Number(values["score_"+c.id]||3)}));
  if(scores.length) await api("evaluation_scores",{method:"POST",body:JSON.stringify(scores)});
  await api("evaluations?id=eq."+evaluation.id,{method:"PATCH",body:JSON.stringify({status:"submitted",submitted_at:new Date().toISOString()})});
  toast(kind==="bureau"?"Penilaian biro berhasil dikirim.":"Penilaian individu berhasil dikirim.");
  await loadData(); state.evaluationMode=kind; state.view="evaluations"; renderShell();
}
async function submitReport(form) {
  const values=Object.fromEntries(new FormData(form).entries());
  const p=periodActive(); const own=ownMemberships().find(m=>m.id===values.membership_id && p && m.period_id===p.id);
  if(!own) throw new Error("Pilih penugasan yang aktif pada periode ini.");
  await api("activity_reports",{method:"POST",body:JSON.stringify({
    period_id:p.id,created_by_membership_id:own.id,unit_id:own.unit_id,title:values.title,
    description:values.description||null,target:values.target||null,realization:values.realization||null,
    planned_date:values.planned_date||null,activity_date:values.activity_date||null,
    evidence_url:values.evidence_url||null,status:"draft"
  })});
  toast("Laporan kegiatan berhasil disimpan sebagai draft. Anda masih dapat mengeditnya.");
  await loadData(); state.view="reports"; render();
}
async function createPeriod(form) {
  const v=Object.fromEntries(new FormData(form).entries());
  const active=state.periods.find(p=>p.status==="active");
  const activate=v.activate==="on";
  if(activate && active) throw new Error("Arsipkan periode aktif saat ini sebelum mengaktifkan periode baru.");
  await api("evaluation_periods",{method:"POST",body:JSON.stringify({
    name:v.name,starts_on:v.starts_on||null,ends_on:v.ends_on||null,status:activate?"active":"draft",created_by:state.user.id
  })});
  toast("Periode kepengurusan berhasil dibuat.");
  await loadData(); state.view="admin"; render();
}
async function activatePeriod(id) {
  const current=state.periods.find(p=>p.status==="active");
  if(current && current.id!==id) await api("evaluation_periods?id=eq."+current.id,{method:"PATCH",body:JSON.stringify({status:"archived"})});
  await api("evaluation_periods?id=eq."+id,{method:"PATCH",body:JSON.stringify({status:"active"})});
  state.periodId=id; toast("Periode aktif berhasil diperbarui."); await loadData(); state.view="admin"; render();
}
async function assignRole(form) {
  const v=Object.fromEntries(new FormData(form).entries());
  const unit=unitFor(v.unit_id);
  const role=v.role;
  const allowed={
    admin:["rayon"],ketua_rayon:["rayon"],sekretaris_umum:["executive"],bendahara_umum:["executive"],
    kepala_bidang:["field"],sekretaris_bidang:["field"],koordinator_biro:["bureau"],anggota:["bureau"]
  };
  if(!unit || !allowed[role]?.includes(unit.unit_type)) throw new Error("Unit organisasi tidak sesuai dengan role yang dipilih.");
  const periodId=role==="admin"?null:v.period_id;
  await api("memberships",{method:"POST",body:JSON.stringify({
    user_id:v.user_id,unit_id:v.unit_id,period_id:periodId,role,status:"active",
    position_title:v.position_title||roleLabels[role],assigned_by:state.user.id
  })});
  toast("Jabatan berhasil ditetapkan.");
  await loadData(); state.view="admin"; render();
}
document.addEventListener("click",async event=>{
  if(event.target.closest("[data-print-organization]")){window.print();return;}
  const evaluationMode=event.target.closest("[data-evaluation-mode]");
  if(evaluationMode){
    state.evaluationMode=evaluationMode.dataset.evaluationMode==="bureau"?"bureau":"individual";
    renderShell();
    return;
  }
  if(event.target.closest("#public-structure")){
    const trigger=event.target.closest("#public-structure");trigger.disabled=true;
    try{await loadPublicStructure();}catch(e){toast(e.message,true);trigger.disabled=false;}
    return;
  }
  if(event.target.closest("#back-to-login")){state.publicMode=false;renderAuth();return;}
  const view=event.target.closest("[data-view]");
  if(view){
    state.view=view.dataset.view;
    renderShell();
    if(state.view==="settings" && isAdmin()){
      try{await Promise.all([loadAdminAccounts(),api("audit_logs?select=*&order=created_at.desc&limit=20").then(rows=>state.auditLogs=rows)]);renderShell();}
      catch(e){toast("Riwayat aktivitas tidak dapat dimuat: "+e.message,true);}
    }
    return;
  }
  if(event.target.closest("[data-refresh-admin-accounts]")){
    const control=event.target.closest("[data-refresh-admin-accounts]");control.disabled=true;
    try{await loadAdminAccounts();renderShell();toast("Daftar akun diperbarui.");}catch(e){toast(e.message,true);control.disabled=false;}return;
  }
  if(event.target.closest("[data-refresh-audit]")){
    const control=event.target.closest("[data-refresh-audit]");control.disabled=true;
    try{state.auditLogs=await api("audit_logs?select=*&order=created_at.desc&limit=20");renderShell();toast("Riwayat aktivitas diperbarui.");}
    catch(e){toast(e.message,true);control.disabled=false;}
    return;
  }
  const mode=event.target.closest("[data-auth-mode]");
  if(mode){state.authMode=mode.dataset.authMode;renderAuth();return;}
  if(event.target.closest("#logout")){await signOut();return;}
  if(event.target.closest("#refresh-status")){try{await reload();toast("Status akun diperbarui.");}catch(e){toast(e.message,true);}return;}
  if(event.target.closest("#refresh-data")){try{await loadData();renderShell();toast("Data berhasil diperbarui.");}catch(e){toast(e.message,true);}return;}
  if(event.target.closest("#mobile-menu")){$("#sidebar")?.classList.toggle("open");return;}
  const approve=event.target.closest("[data-approve]");
  const reject=event.target.closest("[data-reject]");
  if(approve || reject){
    const control=approve||reject;
    const targetId=control.dataset.approve||control.dataset.reject;
    const accept=!!approve;
    if(!accept && !window.confirm("Tolak pendaftaran akun ini?")) return;
    control.disabled=true;
    try {
      await api("rpc/approve_pending_account",{method:"POST",body:JSON.stringify({p_target_user_id:targetId,p_approve:accept})});
      toast(accept?"Akun disetujui. Pengurus berwenang dapat menetapkan jabatan berikutnya.":"Pendaftaran akun ditolak.");
      await loadData();state.view=canApproveAccounts()?"approvals":"admin";renderShell();
    } catch(e){toast(e.message,true);control.disabled=false;}
    return;
  }
  const editRoster=event.target.closest("[data-edit-roster]");
  if(editRoster){openRosterEditor(editRoster.dataset.editRoster);return;}
  const printRoster=event.target.closest("[data-print-roster]");
  if(printRoster){printRosterReport(printRoster.dataset.printRoster);return;}
  const printBureau=event.target.closest("[data-print-bureau]");
  if(printBureau){printBureauReport(printBureau.dataset.printBureau);return;}
  const toggleRoster=event.target.closest("[data-toggle-roster]");
  if(toggleRoster){
    const person=state.roster.find(m=>m.id===toggleRoster.dataset.toggleRoster);
    if(!person) return;
    const next=toggleRoster.dataset.active==="true";
    if(!next && !window.confirm("Arsipkan "+person.full_name+"? Data rapor yang sudah ada tetap tersimpan.")) return;
    toggleRoster.disabled=true;
    try {
      await api("member_roster?id=eq."+encodeURIComponent(person.id),{method:"PATCH",body:JSON.stringify({is_active:next})});
      toast(next?"Anggota diaktifkan kembali.":"Anggota diarsipkan; riwayat rapor tetap tersimpan.");
      await loadData();renderShell();
    } catch(e){toast(e.message,true);toggleRoster.disabled=false;}
    return;
  }
  const review=event.target.closest("[data-review-evaluation]");
  if(review){review.disabled=true;try{await api("evaluations?id=eq."+review.dataset.reviewEvaluation,{method:"PATCH",body:JSON.stringify({status:"reviewed",reviewed_at:new Date().toISOString()})});toast("Penilaian telah ditandai ditinjau.");await loadData();renderShell();}catch(e){toast(e.message,true);review.disabled=false;}return;}
  const editReport=event.target.closest("[data-edit-report]");
  if(editReport){openReportEditor(editReport.dataset.editReport);return;}
  const submitReportButton=event.target.closest("[data-submit-report]");
  if(submitReportButton){
    submitReportButton.disabled=true;
    try {
      const record=state.reports.find(r=>r.id===submitReportButton.dataset.submitReport);
      if(!record || !["draft","revision_requested"].includes(record.status)) throw new Error("Laporan tidak lagi dapat dikirim.");
      await api("activity_reports?id=eq."+encodeURIComponent(record.id),{method:"PATCH",body:JSON.stringify({status:"submitted",reviewer_notes:null})});
      toast("Laporan berhasil dikirim untuk ditinjau.");await loadData();renderShell();
    } catch(e){toast(e.message,true);submitReportButton.disabled=false;}
    return;
  }
  const reviewReportButton=event.target.closest("[data-review-report]");
  if(reviewReportButton){
    const status=reviewReportButton.dataset.status;
    const note=status==="revision_requested"?window.prompt("Tuliskan catatan revisi untuk unit ini:"):null;
    if(status==="revision_requested" && note===null) return;
    reviewReportButton.disabled=true;
    try {
      await api("activity_reports?id=eq."+encodeURIComponent(reviewReportButton.dataset.reviewReport),{method:"PATCH",body:JSON.stringify({
        status,reviewer_notes:note|| (status==="approved"?"Disetujui oleh penanggung jawab.":null)
      })});
      toast(status==="approved"?"Laporan disetujui.":"Catatan revisi berhasil dikirim.");await loadData();renderShell();
    } catch(e){toast(e.message,true);reviewReportButton.disabled=false;}
    return;
  }
  const activate=event.target.closest("[data-set-active]");
  if(activate){activate.disabled=true;try{await activatePeriod(activate.dataset.setActive);}catch(e){toast(e.message,true);activate.disabled=false;}return;}
});
document.addEventListener("keydown",event=>{
  if(event.target?.id!=="global-search") return;
  if(event.key==="Escape"){
    event.target.value="";state.searchQuery="";
    if(state.view==="roster"||state.view==="evaluations") renderShell();
    return;
  }
  if(event.key!=="Enter") return;
  const query=event.target.value.trim();
  state.searchQuery=query;
  if(!query){renderShell();return;}
  const q=query.toLocaleLowerCase("id");
  const rosterMatch=state.roster.some(m=>[m.full_name,m.nim,m.position_title,unitFor(m.unit_id)?.name].some(v=>String(v||"").toLocaleLowerCase("id").includes(q)) && canManageUnit(m.unit_id));
  const evalMatch=state.evaluations.some(e=>{
    const person=evaluationPerson(e);
    return [person.name,person.unit,person.position,person.evaluator].some(v=>String(v||"").toLocaleLowerCase("id").includes(q));
  });
  const unitMatch=state.units.some(u=>[u.name,u.code].some(v=>String(v||"").toLocaleLowerCase("id").includes(q)));
  const membershipMatch=activeMemberships().some(m=>memberName(m).toLocaleLowerCase("id").includes(q));
  if(rosterMatch){state.view="roster";renderShell();toast("Nama anggota ditemukan. Daftar sudah difilter.");}
  else if(evalMatch){state.view="evaluations";renderShell();toast("Riwayat penilaian difilter sesuai pencarian.");}
  else if(unitMatch||membershipMatch){state.view="structure";renderShell();toast("Buka struktur untuk melihat hasil yang cocok.");}
  else {renderShell();toast("Tidak ada data yang cocok dengan pencarian.",true);}
});
document.addEventListener("change",event=>{
  if(event.target.matches(".account-edit-form select[name='membership_id']")){
    const form=event.target.closest("form");
    const account=state.adminAccounts.find(a=>a.id===form?.dataset.accountId);
    const membership=account?.memberships?.find(m=>m.id===event.target.value);
    if(membership){
      const role=form.elements.namedItem("role");const unit=form.elements.namedItem("unit_id");const position=form.elements.namedItem("position_title");
      if(role)role.value=membership.role;if(unit)unit.value=membership.unit_id;if(position)position.value=membership.position_title||"";
    }
  }

  if(event.target.id==="period-select"){state.periodId=event.target.value;loadData().then(()=>renderShell()).catch(e=>toast(e.message,true));}
});
document.addEventListener("submit",async event=>{
  const form=event.target;
  const handlers={
    "auth-form":()=>handleAuth(form),
    "admin-reset-member-password-form":()=>resetMemberPassword(form),
    "account-edit-form":()=>updateAdminAccount(form),
    "system-settings-form":()=>saveSystemSettings(form),
    "individual-evaluation-form":()=>submitEvaluation(form,"individual"),
    "bureau-evaluation-form":()=>submitEvaluation(form,"bureau"),
    "roster-form":()=>saveRoster(form),
    "report-form":()=>submitReport(form),
    "period-form":()=>createPeriod(form),
    "assign-form":()=>assignRole(form)
  };
  if(!handlers[form.id]) return;
  event.preventDefault();
  const button=form.querySelector('button[type="submit"]');
  if(button){button.disabled=true;button.textContent="Menyimpan…";}
  try{await handlers[form.id]();}
  catch(error){toast(error.message||"Terjadi kesalahan.",true);if(button){button.disabled=false;button.textContent="Coba lagi";}}
});
async function init() {
  if(!API || !KEY){renderAuth();toast("Konfigurasi Supabase belum lengkap.",true);return;}
  await loadSystemSettings();
  if(new URLSearchParams(window.location.search).has("struktur")){
    try{await loadPublicStructure();}
    catch(error){renderAuth();toast("Direktori struktur belum dapat dimuat: "+error.message,true);}
    return;
  }
  const restored=await restoreSession();
  if(restored){try{await reload();}catch(error){toast(error.message,true);render();}}
  else renderAuth();
}
init();
