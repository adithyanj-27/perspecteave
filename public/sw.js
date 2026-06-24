self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      // Fallback or do nothing if offline
    })
  );
});

// --- Push Notifications ---
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      try {
        // Retrieve Supabase config from Cache Storage
        const cache = await caches.open('perspecteave-config');
        const response = await cache.match('/config.json');
        if (!response) {
          console.warn('[SW] No Supabase config found in Cache Storage.');
          return;
        }
        
        const config = await response.json();
        const { supabaseUrl, supabaseAnonKey } = config;
        
        if (!supabaseUrl || !supabaseAnonKey) {
          console.warn('[SW] Supabase URL or Anon Key missing in config.');
          return;
        }

        // Fetch the latest unread notification
        const fetchUrl = `${supabaseUrl}/rest/v1/notifications?read=eq.false&order=created_at.desc&limit=1`;
        const fetchRes = await fetch(fetchUrl, {
          method: 'GET',
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!fetchRes.ok) {
          throw new Error(`Failed to fetch notifications: ${fetchRes.statusText}`);
        }

        const notifications = await fetchRes.json();
        if (notifications && notifications.length > 0) {
          const notif = notifications[0];
          
          await self.registration.showNotification(notif.title, {
            body: notif.body,
            icon: '/logo.png',
            badge: '/logo.png',
            vibrate: [100, 50, 100],
            data: {
              url: '/',
              notificationId: notif.id
            }
          });
        }
      } catch (err) {
        console.error('[SW] Error handling push event:', err);
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const clickData = event.notification.data || {};
  const targetUrl = clickData.url || '/';

  event.waitUntil(
    (async () => {
      // If we have a notification ID, mark it as read when clicked
      if (clickData.notificationId) {
        try {
          const cache = await caches.open('perspecteave-config');
          const response = await cache.match('/config.json');
          if (response) {
            const { supabaseUrl, supabaseAnonKey } = await response.json();
            if (supabaseUrl && supabaseAnonKey) {
              await fetch(`${supabaseUrl}/rest/v1/notifications?id=eq.${clickData.notificationId}`, {
                method: 'PATCH',
                headers: {
                  'apikey': supabaseAnonKey,
                  'Authorization': `Bearer ${supabaseAnonKey}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ read: true })
              });
            }
          }
        } catch (err) {
          console.error('[SW] Error marking notification as read:', err);
        }
      }

      // Open or focus PWA window
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});
