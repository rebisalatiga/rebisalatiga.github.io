(() => {
  "use strict";
  let installPrompt = null;
  let appInstalled = !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  function buttonMarkup(label, extraClass) {
    const cls = extraClass ? " " + extraClass : "";
    return '<button type="button" class="app-install-button' + cls + '" data-install-app><span aria-hidden="true">↓</span><span>' + label + '</span></button>';
  }
  function refreshButtons() {
    const installed = appInstalled || !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
    document.querySelectorAll("[data-install-app]").forEach(button => { button.hidden = installed; });
  }
  function showGuide() {
    const ua = navigator.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    let steps, note;
    if (isIOS) {
      steps = "<li>Buka halaman ini melalui <strong>Safari</strong>.</li><li>Tekan tombol <strong>Bagikan</strong> (ikon kotak dengan panah ke atas).</li><li>Pilih <strong>Tambahkan ke Layar Utama</strong>.</li><li>Tekan <strong>Tambah</strong>. Ikon SIGAP akan muncul di layar utama.</li>";
      note = "Pada iPhone/iPad, pemasangan dilakukan melalui menu Bagikan di Safari.";
    } else if (/android/i.test(ua)) {
      steps = "<li>Buka SIGAP melalui <strong>Chrome</strong> atau browser yang mendukung instalasi aplikasi.</li><li>Buka menu browser (ikon ⋮).</li><li>Pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</li><li>Konfirmasi pemasangan. SIGAP akan muncul di daftar aplikasi dan layar utama.</li>";
      note = "Nama menu dapat sedikit berbeda tergantung browser dan perangkat.";
    } else {
      steps = "<li>Buka SIGAP melalui <strong>Chrome</strong> atau <strong>Microsoft Edge</strong>.</li><li>Pilih ikon instal di bilah alamat, atau buka menu browser.</li><li>Pilih <strong>Install SIGAP PMII FEBI</strong>, lalu konfirmasi.</li>";
      note = "Aplikasi akan terbuka di jendela tersendiri seperti aplikasi desktop.";
    }
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML = '<section class="modal install-guide" role="dialog" aria-modal="true" aria-labelledby="install-guide-title"><div class="row between"><div><div class="eyebrow">SIGAP PMII FEBI</div><h3 id="install-guide-title">Pasang aplikasi</h3></div><button type="button" class="btn btn-ghost" data-install-close aria-label="Tutup panduan">Tutup</button></div><p class="muted install-guide-intro">Tambahkan SIGAP ke perangkat agar lebih cepat dibuka dari layar utama.</p><ol class="install-guide-steps">' + steps + '</ol><div class="notice install-guide-note">' + note + '</div><div class="install-guide-footer"><span class="tiny muted">Tidak perlu mengunduh APK dari situs luar.</span><button type="button" class="btn" data-install-close>Saya mengerti</button></div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", event => {
      if (event.target === overlay || event.target.closest("[data-install-close]")) overlay.remove();
    });
  }
  async function install() {
    if (appInstalled) { refreshButtons(); return; }
    if (!installPrompt) { showGuide(); return; }
    const promptEvent = installPrompt;
    installPrompt = null;
    try { await promptEvent.prompt(); await promptEvent.userChoice; }
    catch (_) { showGuide(); }
    refreshButtons();
  }
  window.SIGAP_PWA = Object.freeze({ buttonMarkup, refreshButtons });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-install-app]");
    if (!button) return;
    event.preventDefault();
    install();
  });
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; refreshButtons(); });
  window.addEventListener("appinstalled", () => { appInstalled = true; installPrompt = null; refreshButtons(); });
  const observer = new MutationObserver(refreshButtons);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  refreshButtons();
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(error => console.warn("Service worker SIGAP tidak dapat didaftarkan:", error));
  }
})();
