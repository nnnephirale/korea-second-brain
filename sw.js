const CACHE = 'korea-second-brain-shell-v4';
const ROOT = self.registration.scope;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([ROOT, new URL('manifest.webmanifest', ROOT).href, new URL('icon-180.png', ROOT).href])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('korea-second-brain-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(async response => {
    if (response.ok) await caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match(ROOT);
    return new Response('Offline copy is not available yet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
