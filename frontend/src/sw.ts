/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener('push', (event) => {
  const fallback: PushPayload = {
    title: 'Petmon',
    body: 'You have a new notification.',
    url: '/',
  };

  let payload = fallback;
  if (event.data) {
    try {
      payload = { ...fallback, ...event.data.json() };
    } catch {
      payload = { ...fallback, body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? fallback.title!, {
      body: payload.body ?? fallback.body,
      icon: '/icons/192x192.png',
      badge: '/icons/72x72.png',
      data: { url: payload.url ?? fallback.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data?.url as string | undefined) ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client && typeof client.navigate === 'function') {
            return client.navigate(targetUrl).then(() => client.focus());
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
