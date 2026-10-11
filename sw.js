/* ============================================================
   Capacity Assistant — Service Worker v18.1
   Caspian Mobaddel Amard
   ============================================================ */

const CACHE_VERSION = 'v18.1.0';
const CACHE_NAME = `caspian-${CACHE_VERSION}`;
const RUNTIME_CACHE = `caspian-runtime-${CACHE_VERSION}`;

/* فایل‌هایی که در اولین نصب کش می‌شوند */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', event => {
  console.log('[SW] Installing version', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(PRECACHE_ASSETS.map(url => {
          return new Request(url, { cache: 'reload' });
        })).catch(err => {
          console.warn('[SW] Precache partial failure:', err);
        });
      })
      .then(() => self.skipWaiting()) // فعال‌سازی فوری
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', event => {
  console.log('[SW] Activating version', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim()) // کنترل فوری همه تب‌ها
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', event => {
  const request = event.request;

  // فقط درخواست‌های GET را مدیریت کن
  if (request.method !== 'GET') return;

  // درخواست‌های cross-origin (CDN و ...) را رد کن
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return; // مرورگر خودش مدیریت کند
  }

  // ===== استراتژی ۱: HTML (network-first) =====
  // همیشه آخرین نسخه را از سرور بگیر، اگر آفلاین بود از کش
  if (request.headers.get('accept')?.includes('text/html') ||
      request.url.endsWith('.html') ||
      request.url.endsWith('/') ||
      url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // ===== استراتژی ۲: manifest.json (network-first) =====
  if (request.url.endsWith('manifest.json')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ===== استراتژی ۳: بقیه (cache-first با به‌روزرسانی پس‌زمینه) =====
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // به‌روزرسانی در پس‌زمینه
        fetch(request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(request, networkResponse);
              });
            }
          })
          .catch(() => { /* آفلاین */ });
        return cachedResponse;
      }

      // اگر در کش نبود، از شبکه بگیر و ذخیره کن
      return fetch(request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => {
          // آفلاین و در کش نیست
          if (request.destination === 'image') {
            return caches.match('./icon-192.png');
          }
          return new Response('آفلاین', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
    })
  );
});

/* ---------- MESSAGE ---------- */
// پشتیبانی از پیام‌های دستی از صفحه (اختیاری)
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(names => {
      return Promise.all(names.map(name => caches.delete(name)));
    }).then(() => {
      event.source?.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
});
