const CACHE_NAME = "sigap-app-shell-v20261125-01";
const APP_SHELL = ["./","./index.html","./styles.css?v=pwa-20261125-01","./config.js","./pwa.js?v=pwa-20261125-01","./app.js?v=pwa-20261125-01","./manifest.webmanifest","./favicon.svg","./icons/app-192.png"];
self.addEventListener("install", event => {
  event.waitUntil((async () => { const cache = await caches.open(CACHE_NAME); await cache.addAll(APP_SHELL); await self.skipWaiting(); })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("sigap-app-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/\/(auth|rest|functions)\//.test(url.pathname)) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) { const cache = await caches.open(CACHE_NAME); await cache.put("./index.html", response.clone()); }
        return response;
      } catch (_) {
        return (await caches.match("./index.html")) || new Response("SIGAP PMII FEBI memerlukan koneksi internet untuk memuat data organisasi.", {status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
      }
    })());
    return;
  }
  const cacheable = ["script","style","image","font"].includes(request.destination) || url.pathname.endsWith(".webmanifest");
  if (!cacheable) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") { const cache = await caches.open(CACHE_NAME); await cache.put(request, response.clone()); }
      return response;
    } catch (_) { return (await caches.match(request)) || Response.error(); }
  })());
});
