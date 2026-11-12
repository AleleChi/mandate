const CACHE_NAME = 'koinonia-app-shell-v6';
const CORE_ASSETS = [
  '/',
  '/index.html'
];

const HASHED_ASSET_PATTERN = /^\/assets\/.*-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|svg|webp)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Safe, individual pre-caching with HTTP revalidation so stale index.html is never sealed
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(new Request(asset, { cache: 'no-cache' }));
        } catch (err) {
          console.warn('[SW] Non-fatal pre-cache miss:', asset, err);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("koinonia-") && key !== CACHE_NAME && key !== "koinonia-alert-states-v1")
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // CRITICAL SECURITY RULE: Never intercept or cache any API routes
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Do NOT intercept or cache private child photos, qr codes, event passes, or profiles
  if (
    url.pathname.includes('/pass') ||
    url.pathname.includes('/qr') ||
    url.pathname.includes('/upload') ||
    url.pathname.includes('/children') ||
    url.pathname.includes('/parent')
  ) {
    return;
  }

  // Document navigation / app shell (index.html): Network-First with HTTP cache revalidation
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }))
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/', cacheCopy);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          return (await caches.match(event.request)) || (await caches.match('/')) || caches.match('/index.html');
        })
    );
    return;
  }

  // Content-hashed build assets under /assets/: Cache-First (filenames change on every code change)
  if (url.origin === self.location.origin && HASHED_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cacheCopy);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Other unhashed style, script, and font assets: Network-First with revalidation
  if (
    event.request.destination === 'style' ||
    event.request.destination === 'script' ||
    event.request.destination === 'font'
  ) {
    const req = url.origin === self.location.origin
      ? new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' })
      : event.request;
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cacheCopy);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Other static assets (e.g. images): Cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse.ok &&
          event.request.destination === 'image' &&
          !url.pathname.includes('child') &&
          !url.pathname.includes('profile')
        ) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cacheCopy);
          });
        }
        return networkResponse;
      });
    })
  );
});

// data-component-version="chrome-service-worker-alert-stop-v1"
// data-component-version="chrome-alert-dedupe-v1"

const displayedAlerts = new Set();
const silencedAlerts = new Set();
const resolvedAlerts = new Set();

// Persistent Cache-based state helper
function getAlertState(alertId) {
  if (!alertId) return Promise.resolve(null);
  return caches.open('koinonia-alert-states-v1').then(cache => {
    return cache.keys().then(keys => {
      for (const key of keys) {
        if (key.url.includes(`/alert-state/${alertId}/`)) {
          const parts = key.url.split('/');
          return parts[parts.length - 1];
        }
      }
      return null;
    });
  }).catch(() => null);
}

function setAlertState(alertId, state) {
  if (!alertId) return Promise.resolve();
  // Update in-memory sets
  if (state === 'displayed') displayedAlerts.add(alertId);
  if (state === 'silenced') silencedAlerts.add(alertId);
  if (state === 'resolved') {
    resolvedAlerts.add(alertId);
    silencedAlerts.add(alertId);
  }

  return caches.open('koinonia-alert-states-v1').then(cache => {
    return cache.keys().then(keys => {
      const deletePromises = [];
      for (const key of keys) {
        if (key.url.includes(`/alert-state/${alertId}/`)) {
          deletePromises.push(cache.delete(key));
        }
      }
      return Promise.all(deletePromises);
    }).then(() => {
      return cache.put(
        new Request(`/alert-state/${alertId}/${state}`),
        new Response(JSON.stringify({ alertId, state, time: Date.now() }))
      );
    });
  }).catch(e => console.warn('Cache state write failed:', e));
}

// Future push notification support preparation
self.addEventListener('push', (event) => {
  let data = { title: 'Koinonia Reminders', body: 'New update available from event team!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Koinonia Reminders', body: event.data.text() };
    }
  }

  const alertId = data.alertId || (data.metadata && data.metadata.alertId);
  const status = data.status || (data.metadata && data.metadata.status) || data.type;
  const soundEligible = data.soundEligible !== undefined ? data.soundEligible : (data.metadata && data.metadata.soundEligible);

  // Extract isCleared status
  const isCleared = 
    status === 'resolved' || 
    status === 'acknowledged' || 
    status === 'read' || 
    status === 'archived' || 
    status === 'clear_alert' ||
    soundEligible === false;

  const tag = alertId ? `safety-alert-${alertId}` : undefined;

  const processPush = async () => {
    if (alertId) {
      // 1. Check persistent state
      const existingState = await getAlertState(alertId);
      if (existingState === 'resolved' || existingState === 'silenced' || resolvedAlerts.has(alertId) || silencedAlerts.has(alertId)) {
        console.log(`[SW] Alert ${alertId} is already resolved/silenced. Skipping notification.`);
        return;
      }

      if (isCleared) {
        console.log(`[SW] Clearing/silencing alert ${alertId}`);
        await setAlertState(alertId, 'resolved');
        if (tag) {
          const notifications = await self.registration.getNotifications({ tag });
          notifications.forEach(n => n.close());
        }
        return;
      }

      // Deduplicate displayed alerts
      if (existingState === 'displayed' || displayedAlerts.has(alertId)) {
        console.log(`[SW] Alert ${alertId} was already displayed. Skipping to prevent repeated notifications.`);
        return;
      }

      await setAlertState(alertId, 'displayed');
    }

    // Build notification options
    const options = {
      body: data.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: tag, // Use notification tags per alert: tag: `safety-alert-${alertId}`
      renotify: false, // Set: renotify: false
      data: data.metadata || {},
      vibrate: [200, 100, 200, 100, 500],
      actions: [
        { action: 'open', title: 'Open alert' },
        { action: 'ack', title: 'Acknowledge' }
      ]
    };

    await self.registration.showNotification(data.title, options);
  };

  event.waitUntil(processPush());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const notificationData = event.notification.data || {};
  let targetUrl = notificationData.targetUrl || '/';
  
  if (event.action === 'ack') {
    if (targetUrl.includes('?')) {
      targetUrl += '&action=acknowledge';
    } else {
      targetUrl += '?action=acknowledge';
    }
  }

  // Ensure targetUrl is absolute for clients.navigate/openWindow
  if (targetUrl.startsWith('/') && !targetUrl.startsWith('//')) {
    targetUrl = self.location.origin + targetUrl;
  } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = self.location.origin + '/' + targetUrl;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          try {
            client.focus();
            if ('navigate' in client && targetUrl) {
              return client.navigate(targetUrl);
            }
          } catch (e) {
            console.error('Failed to focus/navigate:', e);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
