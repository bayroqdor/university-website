// University portal service worker: sahifa qobig'i va statik fayllar keshlanadi — internet bo'lmasa ham ilova ochiladi.
// Kutubxona: oxirgi ochilgan 3 ta EPUB «uni-lib-v1» keshida (o'quvchi o'zi saqlaydi) — oflayn o'qish mumkin.
// API so'rovlari keshlanmaydi (shaxsiy ma'lumotlar va vaqtinchalik fayl havolalari).
const SHELL = "uni-shell-v1";
const ASSETS = "uni-assets-v1";
const LIB = "uni-lib-v1";
const KEEP = [SHELL, ASSETS, LIB];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.add(new Request("/library", { cache: "reload" })).then(() => c.match("/library")).then((r) => r && c.put("/__shell", r)))
      .catch(() => null)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // oflayn EPUB
  if (url.pathname.startsWith("/lib-offline/")) {
    e.respondWith(caches.open(LIB).then((c) => c.match(url.pathname)).then((r) => r || new Response("", { status: 404 })));
    return;
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/og/") || url.pathname === "/sw.js") return;
  // ONLYOFFICE (tahrirlagich iframe'i va ~150 fayli) hamda yuklanadigan fayllar SW'dan o'tmaydi: aks holda iframe sahifasi yoki PDF
  // «navigate» sifatida /__shell (sayt qobig'i) o'rniga keshga yozilib qolardi
  if (url.pathname.startsWith("/office-ds/") || url.pathname.startsWith("/media/")) return;
  // sahifalar: avval tarmoq, bo'lmasa — saqlangan qobiq (SPA o'zi yo'lni ochadi)
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(SHELL).then((c) => c.put("/__shell", copy));
          }
          return r;
        })
        .catch(() => caches.open(SHELL).then((c) => c.match("/__shell")).then((r) => r || Response.error())),
    );
    return;
  }
  // xeshlangan statik fayllar (JS, CSS, shriftlar, PDF.js worker) — avval kesh
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.open(ASSETS).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((r) => {
              if (r.ok) {
                c.put(req, r.clone());
                trim(ASSETS, 250);
              }
              return r;
            }),
        ),
      ),
    );
    return;
  }
  // ikonlar, manifest
  if (/^\/[^/]+\.(png|svg|webmanifest|ico)$/.test(url.pathname)) {
    e.respondWith(caches.open(SHELL).then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => (r.ok && c.put(req, r.clone()), r)))));
  }
});
