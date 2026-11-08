// Khiam Ops — Service Worker (PWA). محافظ: الـ API دايمًا شبكة (لا كاش)،
// التنقّل شبكة-أولًا عشان النشر الجديد يظهر فورًا، والأصول المبنيّة (هاش ثابت) كاش-أولًا.
const CACHE = "khiam-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      await Promise.allSettled(SHELL.map((u) => c.add(u))); // لا يفشل التثبيت لو أصل واحد غاب
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))); // نظّف نسخ قديمة
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // خطوط/روابط خارجية → المتصفح مباشرة
  if (url.pathname.startsWith("/api")) return; // الـ API لحظي دايمًا — لا كاش إطلاقًا

  // تنقّل (HTML): شبكة أولًا (يظهر النشر الجديد) مع كاش احتياطي للأوفلاين
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return r;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // أصول مبنيّة (أسماء بهاش ثابت): كاش أولًا ثم شبكة
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          if (r.ok && (url.pathname.startsWith("/assets/") || /\.(png|svg|ico|woff2?|css|js)$/.test(url.pathname))) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return r;
        }),
    ),
  );
});
