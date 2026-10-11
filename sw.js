/* ============================================================
   Capacity Assistant — Service Worker
   Version: v19.0.0
   Project: Caspian Mobaddel Amard
   Updated: 2026-10
   ============================================================ */

const CACHE_VERSION = 'v19.0.0';
const CACHE_NAME = `caspian-${CACHE_VERSION}`;
const RUNTIME_CACHE = `caspian-runtime-${CACHE_VERSION}`;

/* فایل‌های اصلی که در اولین نصب پیش‌کش می‌شوند */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* ============================================================
   INSTALL — نصب اولیه
   ============================================================ */
self.addEventListener('install', event => {
  console.log('[SW v19] Installing version', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.all(
          PRECACHE_ASSETS.map(url =>
            cache.add(new Request(url, { cache: 'reload' }))
              .catch(err => console.warn('[SW] Precache failed for:', url, err))
          )
        );
      })
      .then(() => {
        console.log('[SW v19] Install complete — skipping waiting');
        return self.skipWaiting();
      })
  );
});

/* ============================================================
   ACTIVATE — پاکسازی کش‌های قدیمی
   ============================================================ */
self.addEventListener('activate', event => {
  console.log('[SW v19] Activating version', CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map(name => {
              console.log('[SW v19] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW v19] Claiming clients');
        return self.clients.claim();
      })
      .then(() => {
        // اطلاع‌رسانی به همه تب‌های باز که SW جدید فعال شد
        return self.clients.matchAll({ type: 'window' });
      })
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: CACHE_VERSION
          });
        });
      })
  );
});

/* ============================================================
   FETCH — استراتژی‌های کش
   ============================================================ */
self.addEventListener('fetch', event => {
  const request = event.request;

  // فقط GET را مدیریت کن
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // درخواست‌های cross-origin (CDN، fonts، html2canvas) را رد کن
  if (url.origin !== self.location.origin) {
    return;
  }

  // ====== ۱) HTML / index.html → Network-First ======
  // همیشه آخرین نسخه را از سرور بگیر، اگر آفلاین بود از کش
  const isHTML = request.headers.get('accept')?.includes('text/html');
  const isIndex = url.pathname.endsWith('/') ||
                  url.pathname.endsWith('index.html') ||
                  url.pathname.endsWith('.html');

  if (isHTML || isIndex) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then(cached => cached || caches.match('./index.html'));
        })
    );
    return;
  }

  // ====== ۲) manifest.json → Network-First ======
  if (url.pathname.endsWith('manifest.json')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ====== ۳) بقیه فایل‌ها → Cache-First با به‌روزرسانی پس‌زمینه ======
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // به‌روزرسانی پس‌زمینه
        fetch(request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(request, networkResponse);
              });
            }
          })
          .catch(() => { /* آفلاین — اشکالی ندارد */ });

        return cachedResponse;
      }

      // در کش نیست → از شبکه بگیر
      return fetch(request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const clone = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, clone);
          });
          return networkResponse;
        })
        .catch(() => {
          // آفلاین و در کش نیست
          if (request.destination === 'image') {
            return caches.match('./icon-192.png');
          }
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }
          return new Response('آفلاین — اتصال خود را بررسی کنید.', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
    })
  );
});

/* ============================================================
   MESSAGE — پیام‌های دستی از صفحه
   ============================================================ */
self.addEventListener('message', event => {
  const data = event.data;

  if (data === 'SKIP_WAITING' || data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (data === 'CLEAR_CACHE' || data?.type === 'CLEAR_CACHE') {
    caches.keys()
      .then(names => Promise.all(names.map(name => caches.delete(name))))
      .then(() => {
        event.source?.postMessage({
          type: 'CACHE_CLEARED',
          version: CACHE_VERSION
        });
      });
  }

  if (data === 'GET_VERSION' || data?.type === 'GET_VERSION') {
    event.source?.postMessage({
      type: 'VERSION',
      version: CACHE_VERSION
    });
  }
});

/* ============================================================
   NOTIFICATION CLICK (اختیاری)
   ============================================================ */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('./index.html');
    })
  );
});

console.log('[SW] Service Worker v19 loaded — cache version:', CACHE_VERSION);
