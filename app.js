const CONFIG = window.SIGAP_CONFIG || {};
const API = (CONFIG.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = CONFIG.SUPABASE_PUBLISHABLE_KEY || "";
const root = document.getElementById("app");
const state = {
  session: null, user: null, profile: null, profiles: [], units: [], periods: [],
  memberships: [], roster: [], criteria: [], evaluations: [], scores: [], reports: [],
  view: "overview", periodId: "", authMode: "login", busy: false
};
const $ = (selector, scope=document) => scope.querySelector(selector);
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
    api("activity_reports?select=*&order=created_at.desc")
  ]);
  [state.profiles,state.units,state.periods,state.memberships,state.roster,state.criteria,state.evaluations,state.scores,state.reports]=results;
  if(!state.periodId || !state.periods.some(p=>p.id===state.periodId)) {
    state.periodId=state.periods.find(p=>p.status==="active")?.id || state.periods[0]?.id || "";
  }
}
async function loadProfile() {
  const rows=await api("profiles?select=*&id=eq."+encodeURIComponent(state.user.id)+"&limit=1");
  state.profile=rows[0] || null;
}
function renderAuth() {
  const signup=state.authMode==="signup";
  root.innerHTML='<div class="auth-layout">'+
    '<section class="auth-hero"><div class="brand-lockup"><div class="brand-mark">P</div><div><strong>SIGAP PMII FEBI</strong><small>Sistem Informasi Evaluasi Kepengurusan</small></div></div>'+
    '<div class="hero-copy"><div class="eyebrow">Bergerak · Berproses · Bertumbuh</div><h1>Merawat amanah.<br>Menumbuhkan gerakan.</h1><p>Ruang digital pengurus PMII Fakultas Ekonomi dan Bisnis Islam untuk mengelola struktur, mengukur kinerja, dan menyusun evaluasi bersama.</p></div>'+
    '<div class="hero-foot">PERGERAKAN MAHASISWA ISLAM INDONESIA · PMII FEBI</div></section>'+
    '<section class="auth-panel"><form class="auth-card" id="auth-form"><div class="eyebrow">Ruang internal organisasi</div><h2>'+(signup?"Buat akun pengurus":"Selamat datang kembali")+'</h2><p>'+(signup?"Daftarkan akun. Ketua Rayon, Sekretaris Umum, Bendahara Umum, atau Kepala Bidang akan memeriksa pendaftaran Anda.":"Masuk untuk melanjutkan proses dan amanah kepengurusan.")+'</p>'+
    (signup?'<div class="field"><label>Nama lengkap</label><input name="full_name" required maxlength="100" placeholder="Nama sesuai identitas"></div><div class="field"><label>NIM (opsional)</label><input name="nim" maxlength="40" placeholder="Nomor Induk Mahasiswa"></div><div class="field"><label>Angkatan (opsional)</label><input name="cohort" maxlength="20" placeholder="Contoh: 2024"></div>':'')+
    '<div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="nama@email.com"></div>'+
    '<div class="field"><label>Password</label><input name="password" type="password" required minlength="8" autocomplete="'+(signup?"new-password":"current-password")+'" placeholder="Minimal 8 karakter"></div>'+
    '<button class="btn btn-block" type="submit">'+(signup?"Daftar akun":"Masuk ke SIGAP")+'</button>'+
    '<div class="auth-switch">'+(signup?'Sudah memiliki akun? <button type="button" class="link-btn" data-auth-mode="login">Masuk</button>':'Belum memiliki akun? <button type="button" class="link-btn" data-auth-mode="signup">Daftar sekarang</button>')+'</div>'+
    '<p class="tiny muted" style="margin-top:24px;line-height:1.6">Email tidak perlu diverifikasi. Akun baru menunggu persetujuan Ketua Rayon, Sekretaris Umum, Bendahara Umum, atau Kepala Bidang. Penetapan jabatan tetap dilakukan oleh pengurus berwenang.</p></form></section></div>';
}
function renderPending() {
  const status=state.profile?.account_status || "pending";
  const message=status==="rejected"?"Pendaftaran akun ditolak. Silakan hubungi Ketua Rayon atau pengurus yang memeriksa pendaftaran.":status==="suspended"?"Akses akun sedang dinonaktifkan. Silakan hubungi Admin Sistem.":"Akun Anda sudah terdaftar. Tunggu persetujuan Ketua Rayon, Sekretaris Umum, Bendahara Umum, atau Kepala Bidang. Anda tidak perlu memverifikasi email.";
  root.innerHTML='<div class="pending-wrap"><section class="pending-card"><div class="brand-mark" style="margin:0 auto 22px">P</div><div class="pending-icon">⌛</div><div class="eyebrow">SIGAP PMII FEBI</div><h2 style="margin:10px 0">Akun dalam proses</h2><p class="muted" style="line-height:1.7">'+esc(message)+'</p><div style="margin-top:24px"><button class="btn btn-ghost" id="refresh-status">Periksa status lagi</button> <button class="btn" id="logout">Keluar</button></div></section></div>';
}
function navItem(view,icon,label) {
  return '<button class="nav-item '+(state.view===view?"active":"")+'" data-view="'+view+'"><span class="nav-ico">'+icon+'</span>'+label+'</button>';
}
function renderShell() {
  const p=periodActive();
  const profile=state.profile || {};
  const firstRole=ownMemberships()[0]?.role || (isAdmin()?"admin":"anggota");
  root.innerHTML='<div class="app-shell"><aside class="sidebar" id="sidebar"><div class="side-brand"><div class="brand-mark">P</div><div><strong>SIGAP PMII FEBI</strong><small>Ruang kerja kepengurusan</small></div></div>'+
    '<div class="nav-label">Menu utama</div><nav class="nav-list">'+
      navItem("overview","⌂","Dashboard")+navItem("structure","⌘","Struktur organisasi")+navItem("evaluations","✓","Penilaian & evaluasi")+navItem("reports","▤","Laporan kegiatan")+
    '</nav>'+(manageableUnits().length?'<div class="nav-label">Data kepengurusan</div><nav class="nav-list">'+navItem("roster","♧","Data anggota & rapor")+'</nav>':'')+(canApproveAccounts()?'<div class="nav-label">Persetujuan</div><nav class="nav-list">'+navItem("approvals","✓","Persetujuan akun")+'</nav>':'')+(isAdmin()?'<div class="nav-label">Administrasi sistem</div><nav class="nav-list">'+navItem("admin","⚙","Panel admin")+'</nav>':'')+
    '<div class="side-bottom"><div class="user-mini"><div class="avatar">'+esc((profile.full_name||"P").slice(0,1).toUpperCase())+'</div><div><strong>'+esc(profile.full_name||"Pengurus")+'</strong><small>'+esc(roleLabels[firstRole]||"Pengurus")+'</small></div></div><button class="nav-item" id="logout" style="width:100%">⇥ Keluar dari akun</button></div></aside>'+
    '<main class="main-area"><header class="topbar"><div style="display:flex;align-items:center;gap:12px"><button class="mobile-menu" id="mobile-menu" aria-label="Buka menu">☰</button><div><div class="top-title">PMII Fakultas Ekonomi dan Bisnis Islam</div><div class="top-sub">Sistem evaluasi dan pengembangan kepengurusan</div></div></div>'+
    '<div class="top-actions">'+(state.periods.length?'<select class="period-select" id="period-select" aria-label="Periode kepengurusan">'+state.periods.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===state.periodId?"selected":"")+'>'+esc(x.name)+(x.status==="active"?" · Aktif":"")+'</option>').join("")+'</select>':'')+'<button class="btn btn-ghost" id="refresh-data">↻</button></div></header><section class="page" id="page-content">'+renderView()+'</section></main></div>';
}
function pageHeading(title,desc,action="") {
  return '<div class="page-heading"><div><div class="eyebrow">SIGAP / PMII FEBI</div><h1>'+title+'</h1><p>'+desc+'</p></div>'+action+'</div>';
}
function stat(label,value,note,icon) {
  return '<article class="stat-card"><div class="stat-top"><span>'+label+'</span><span class="stat-icon">'+icon+'</span></div><div class="stat-value">'+value+'</div><div class="stat-note">'+note+'</div></article>';
}
function renderOverview() {
  const p=periodActive();
  const active=activeMemberships();
  const unitCount=state.units.filter(u=>u.unit_type==="bureau").length;
  const reportCount=state.reports.filter(r=>!p || r.period_id===p.id).length;
  const evalCount=state.evaluations.filter(e=>!p || e.period_id===p.id).length;
  const myRoles=ownMemberships().map(m=>roleLabels[m.role]||m.role);
  return '<div class="greeting"><div class="eyebrow">Ahlan wa sahlan, '+esc(state.profile?.full_name||"Pengurus")+'</div><h2>Selamat datang di ruang gerak organisasi.</h2><p>Kelola amanah, pantau perkembangan, dan jaga keberlanjutan gerakan bersama.</p></div>'+
    '<div class="stats-grid">'+stat("Anggota terdata",active.length,"Pada periode terpilih","♧")+stat("Biro organisasi",unitCount,"Di bawah tiga bidang","⌘")+stat("Penilaian tersimpan",evalCount,"Pada periode terpilih","✓")+stat("Laporan kegiatan",reportCount,"Dokumentasi program","▤")+'</div>'+
    '<div class="content-grid"><section class="panel"><div class="panel-head"><div><h3>Ruang kerja pengurus</h3><p>Akses cepat sesuai tugas organisasi</p></div><span class="badge">'+esc(p?.name||"Belum ada periode")+'</span></div>'+
    '<div class="quick-grid"><button class="quick-card" data-view="structure"><span class="quick-ico">⌘</span><b>Struktur organisasi</b><span>Lihat bidang, biro, dan penanggung jawab.</span></button><button class="quick-card" data-view="evaluations"><span class="quick-ico">✓</span><b>Penilaian pengurus</b><span>Berikan skor, catatan, dan rekomendasi.</span></button><button class="quick-card" data-view="reports"><span class="quick-ico">▤</span><b>Laporan kegiatan</b><span>Catat progres dan bukti kegiatan.</span></button><button class="quick-card" data-view="'+(isAdmin()?"admin":"structure")+'"><span class="quick-ico">⚙</span><b>'+(isAdmin()?"Administrasi sistem":"Peta kepengurusan")+'</b><span>'+(isAdmin()?"Kelola pendaftar, periode, dan jabatan.":"Kenali susunan kepengurusan rayon.")+'</span></button></div></section>'+
    '<section class="panel"><div class="panel-head"><div><h3>Identitas kepengurusan</h3><p>Ringkasan akun Anda</p></div></div><div class="stack"><div><div class="tiny muted">NAMA PENGURUS</div><strong>'+esc(state.profile?.full_name||"—")+'</strong></div><div><div class="tiny muted">EMAIL</div><strong class="small">'+esc(state.user?.email||"—")+'</strong></div><div><div class="tiny muted">JABATAN / ROLE</div><strong class="small">'+esc(myRoles.join(", ")||"Belum ditetapkan")+'</strong></div><div><div class="tiny muted">PERIODE TERPILIH</div><strong class="small">'+esc(p?.name||"Belum tersedia")+'</strong></div></div></section></div>';
}
function personChips(unit) {
  const periodId=periodActive()?.id;
  const officers=state.memberships.filter(m=>m.unit_id===unit.id && m.status==="active" && (m.role==="admin" || !periodId || m.period_id===periodId));
  const roster=state.roster.filter(m=>m.unit_id===unit.id && m.is_active && (!periodId || m.period_id===periodId));
  const chips=[
    ...officers.map(m=>'<span class="person-chip">'+esc(memberName(m))+' · '+esc(roleLabels[m.role]||m.role)+'</span>'),
    ...roster.map(m=>'<span class="person-chip">'+esc(m.full_name)+' · '+esc(m.position_title||"Anggota")+'</span>')
  ];
  return '<div class="unit-people">'+(chips.length?chips.join(""):'<span class="person-chip">Belum ada anggota tercatat</span>')+'</div>';
}
function renderStructure() {
  const rootUnit=state.units.find(u=>u.code==="pmii-febi");
  if(!rootUnit) return '<div class="empty">Data struktur belum tersedia.</div>';
  const children=parent=>state.units.filter(u=>u.parent_id===parent).sort((a,b)=>a.sort_order-b.sort_order);
  const renderUnit=(unit,level)=>'<article class="unit-card" style="margin-left:'+Math.min(level*17,50)+'px"><div class="unit-row"><div class="unit-title"><div class="unit-symbol">'+(unit.unit_type==="bureau"?"◈":unit.unit_type==="field"?"⌘":unit.unit_type==="executive"?"▤":"✦")+'</div><div><strong>'+esc(unit.name)+'</strong><small>'+({rayon:"Struktur rayon",executive:"Unsur eksekutif",field:"Kepala bidang",bureau:"Biro"}[unit.unit_type]||"Unit")+'</small></div></div><span class="badge '+(unit.unit_type==="field"?"gold":"")+'">'+({rayon:"Rayon",executive:"Eksekutif",field:"Bidang",bureau:"Biro"}[unit.unit_type])+'</span></div>'+personChips(unit)+'</article>'+children(unit.id).map(child=>renderUnit(child,level+1)).join("");
  return pageHeading("Struktur organisasi","Peta kepengurusan PMII FEBI dari Ketua Rayon hingga koordinator dan anggota.")+
    '<div class="notice">Struktur organisasi mengikuti susunan rayon, sekretariat dan bendahara umum, tiga bidang, serta sembilan biro. Jabatan aktual akan terlihat setelah admin menetapkan penempatan pengurus.</div><div class="unit-list">'+renderUnit(rootUnit,0)+'</div>';
}
function descendantsOf(unitId) {
  const found=new Set([unitId]); let changed=true;
  while(changed){changed=false;for(const u of state.units){if(u.parent_id && found.has(u.parent_id) && !found.has(u.id)){found.add(u.id);changed=true;}}}
  return found;
}
function canManageUnit(unitId) {
  if(isAdmin()) return true;
  const periodId=periodActive()?.id;
  return !!periodId && ownMemberships().some(m=>m.period_id===periodId && (
    m.role==="ketua_rayon" ||
    (["sekretaris_umum","bendahara_umum"].includes(m.role) && m.unit_id===unitId) ||
    (["kepala_bidang","sekretaris_bidang"].includes(m.role) && descendantsOf(m.unit_id).has(unitId)) ||
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
function evaluationTargets() {
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
function renderEvaluationCard(e) {
  const rosterTarget=e.subject_roster_id?state.roster.find(m=>m.id===e.subject_roster_id):null;
  const target=e.subject_membership_id?state.memberships.find(m=>m.id===e.subject_membership_id):null;
  const evaluator=state.memberships.find(m=>m.id===e.evaluator_membership_id);
  const values=state.scores.filter(s=>s.evaluation_id===e.id);
  let weighted=0,weightTotal=0;
  for(const s of values){const c=state.criteria.find(x=>x.id===s.criterion_id);if(c){weighted+=Number(s.score)*Number(c.weight);weightTotal+=Number(c.weight);}}
  const score=weightTotal?(weighted/weightTotal*20).toFixed(1):"—";
  const displayName=rosterTarget?.full_name||(target?memberName(target):"Pengurus");
  const displayUnit=unitFor(rosterTarget?.unit_id||target?.unit_id)?.name||"";
  const displayPosition=rosterTarget?.position_title||(target?roleLabels[target.role]||target.role:"");
  const reviewAction=isAdmin()&&e.status==="submitted" ? '<div style="margin-top:12px"><button class="btn btn-ghost" data-review-evaluation="'+e.id+'">Tandai sudah ditinjau</button></div>' : "";
  return '<article class="eval-card"><div class="eval-meta"><div><h4>'+esc(displayName)+'</h4><div class="tiny muted">'+esc(displayUnit)+' · '+esc(displayPosition)+' · Dinilai oleh '+esc(evaluator?memberName(evaluator):"Pengurus")+'</div></div><span class="badge '+(e.status==="submitted"?"gold":e.status==="reviewed"?"":"grey")+'">'+esc(e.status==="submitted"?"Terkirim":e.status==="reviewed"?"Ditinjau":"Draft")+'</span></div><p>'+esc(e.strengths||"Belum ada catatan kekuatan.")+'</p><div class="small"><strong>Nilai akhir: '+score+(score==="—"?"":" / 100")+'</strong> <span class="muted">· '+dateText(e.created_at)+'</span></div><div class="tiny muted" style="margin-top:7px">Perbaikan: '+esc(e.improvements||"—")+' · Kendala: '+esc(e.obstacles||"—")+' · Rekomendasi: '+esc(e.recommendations||"—")+'</div>'+reviewAction+'</article>';
}
function renderEvaluations() {
  const p=periodActive();
  if(!p) return pageHeading("Penilaian & evaluasi","Penilaian kinerja pengurus berbasis indikator dan evaluasi tertulis.")+'<div class="empty"><strong>Belum ada periode kepengurusan</strong>Admin perlu membuat dan mengaktifkan periode terlebih dahulu.</div>';
  const criteria=state.criteria.filter(c=>c.period_id===null || c.period_id===p.id);
  const targets=evaluationTargets();
  const evaluator=ownEvaluatorMembership();
  const list=state.evaluations.filter(e=>e.period_id===p.id);
  const form= evaluator && targets.length ? '<section class="panel"><div class="panel-head"><div><h3>Buat penilaian baru</h3><p>Nama anggota dapat dinilai meskipun belum mempunyai akun SIGAP.</p></div><span class="badge gold">'+esc(p.name)+'</span></div><form id="evaluation-form"><div class="field"><label>Anggota yang dinilai</label><select name="subject_ref" required><option value="">Pilih nama anggota</option>'+targets.map(m=>'<option value="'+m.ref+'">'+esc(m.full_name)+' · '+esc(unitFor(m.unit_id)?.name||"Unit")+' · '+esc(m.position_title)+'</option>').join("")+'</select></div>'+
    '<div class="notice">Skala nilai: 1 Sangat Kurang · 2 Kurang · 3 Cukup · 4 Baik · 5 Sangat Baik. Bobot indikator berjumlah 100%.</div>'+
    criteria.map(c=>'<div class="criterion-row"><div><strong>'+esc(c.name)+' <span class="muted">('+Number(c.weight)+'%)</span></strong><small>'+esc(c.description||"")+'</small></div><select name="score_'+c.id+'" required><option value="3">3 · Cukup</option><option value="1">1 · Sangat kurang</option><option value="2">2 · Kurang</option><option value="4">4 · Baik</option><option value="5">5 · Sangat baik</option></select></div>').join("")+
    '<div class="field"><label>Hal yang sudah berjalan baik</label><textarea name="strengths" placeholder="Tuliskan capaian atau praktik baik…"></textarea></div><div class="field"><label>Hal yang perlu ditingkatkan</label><textarea name="improvements" placeholder="Tuliskan kekurangan yang perlu diperbaiki…"></textarea></div><div class="field"><label>Kendala yang dihadapi</label><textarea name="obstacles" placeholder="Tuliskan kendala yang ditemukan…"></textarea></div><div class="field"><label>Rekomendasi dan target berikutnya</label><textarea name="recommendations" placeholder="Tuliskan langkah perbaikan…"></textarea></div><div class="form-actions"><button class="btn" type="submit">Kirim penilaian</button></div></form></section>' :
    '<div class="notice warn">Belum ada penugasan aktif yang dapat digunakan untuk menilai pada periode ini. Anggota dapat melihat penilaian diri setelah memiliki penugasan.</div>';
  return pageHeading("Penilaian & evaluasi","Nilai kinerja berdasarkan indikator, bukti, dan catatan pembinaan.")+
    '<div class="split"><div class="stack">'+form+'</div><section class="panel"><div class="panel-head"><div><h3>Riwayat penilaian</h3><p>Penilaian yang dapat Anda akses</p></div><span class="badge">'+list.length+' catatan</span></div><div class="eval-grid">'+(list.length?list.map(renderEvaluationCard).join(""):'<div class="empty"><strong>Belum ada penilaian</strong>Penilaian akan muncul di sini setelah dikirim.</div>')+'</div></section></div>';
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
  const units=manageableUnits();
  const allowed=new Set(units.map(u=>u.id));
  const people=state.roster.filter(m=>m.period_id===p.id && allowed.has(m.unit_id))
    .sort((a,b)=>a.full_name.localeCompare(b.full_name,"id"));
  const unitOptions=units.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join("");
  return pageHeading("Data anggota & rapor","Masukkan nama orang yang berada di bawah unit Anda. Mereka tidak perlu membuat akun SIGAP untuk dicatat dan dinilai.")+
    '<div class="notice">Daftar ini adalah data keanggotaan/rapor organisasi, bukan akun login. Ketua Rayon dapat mengelola seluruh unit; Kepala Bidang dan Sekretaris Bidang mengelola bidang beserta biro di bawahnya; Koordinator Biro mengelola unit bironya.</div>'+
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
  return renderOverview();
}
function render() {
  if(!state.user) return renderAuth();
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
  saveSession(null); state.user=null; state.profile=null; renderAuth();
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
      toast("Pendaftaran tersimpan. Coba masuk dengan email dan password yang sama; tidak perlu klik tautan verifikasi. "+loginError.message,true);
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
async function submitEvaluation(form) {
  const values=Object.fromEntries(new FormData(form).entries());
  const p=periodActive(); const evaluator=ownEvaluatorMembership();
  if(!p || !evaluator) throw new Error("Periode atau penugasan evaluator belum tersedia.");
  const [subjectType,subjectId]=String(values.subject_ref||"").split(":");
  if(!subjectId || !["roster","membership"].includes(subjectType)) throw new Error("Pilih anggota yang akan dinilai.");
  const criteria=state.criteria.filter(c=>c.period_id===null || c.period_id===p.id);
  const created=await api("evaluations",{method:"POST",body:JSON.stringify({
    period_id:p.id,evaluator_membership_id:evaluator.id,
    subject_membership_id:subjectType==="membership"?subjectId:null,
    subject_roster_id:subjectType==="roster"?subjectId:null,
    status:"draft",strengths:values.strengths||null,improvements:values.improvements||null,
    obstacles:values.obstacles||null,recommendations:values.recommendations||null
  })});
  const evaluation=Array.isArray(created)?created[0]:created;
  const scores=criteria.map(c=>({evaluation_id:evaluation.id,criterion_id:c.id,score:Number(values["score_"+c.id]||3)}));
  if(scores.length) await api("evaluation_scores",{method:"POST",body:JSON.stringify(scores)});
  await api("evaluations?id=eq."+evaluation.id,{method:"PATCH",body:JSON.stringify({status:"submitted",submitted_at:new Date().toISOString()})});
  toast("Penilaian berhasil dikirim.");
  await loadData(); state.view="evaluations"; render();
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
  const view=event.target.closest("[data-view]");
  if(view){state.view=view.dataset.view;renderShell();return;}
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
document.addEventListener("change",event=>{
  if(event.target.id==="period-select"){state.periodId=event.target.value;loadData().then(()=>renderShell()).catch(e=>toast(e.message,true));}
});
document.addEventListener("submit",async event=>{
  const form=event.target;
  const handlers={
    "auth-form":()=>handleAuth(form),
    "evaluation-form":()=>submitEvaluation(form),
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
  const restored=await restoreSession();
  if(restored){try{await reload();}catch(error){toast(error.message,true);render();}}
  else renderAuth();
}
init();
