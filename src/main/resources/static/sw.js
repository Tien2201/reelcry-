const CACHE_NAME = 'reelcry-static-v1';
const STATIC_ASSETS = [
  '/css/reelcry-header.css',
  '/css/index.css',
  '/css/detail.css',
  '/css/watch.css',
  '/css/login.css',
  '/css/error.css',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/manifest.json',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // CSS/ảnh tĩnh: cache-first, chỉ là lớp dự phòng thêm khi mất mạng tạm thời
  // (server đã set Cache-Control 7 ngày cho các file này rồi)
  if (url.pathname.startsWith('/css/') || url.pathname.startsWith('/images/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Điều hướng trang (HTML): luôn ưu tiên mạng vì nội dung động/cá nhân hoá
  // theo tài khoản (lịch sử xem, yêu thích...). Chỉ dùng trang offline dự
  // phòng khi hoàn toàn mất mạng.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/offline.html'))
    );
  }
});
