const CACHE = 'korea-second-brain-shell-v5';
const ROOT = self.registration.scope;
const VIDEO_DB = 'koreaSecondBrainOffline';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([ROOT, new URL('manifest.webmanifest', ROOT).href, new URL('icon-180.png', ROOT).href])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('korea-second-brain-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

function readClip(id) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(VIDEO_DB, 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('clips')) { db.close(); resolve(null); return; }
      const request = db.transaction('clips').objectStore('clips').get(id);
      request.onsuccess = () => { const row = request.result || null; db.close(); resolve(row); };
      request.onerror = () => { const error = request.error; db.close(); reject(error); };
    };
  });
}

async function serveOfflineClip(request, id) {
  try {
    const row = await readClip(id);
    if (!row?.blob) return new Response('Saved video not found on this phone.', { status: 404 });
    const blob = row.blob.type === 'video/mp4' ? row.blob : row.blob.slice(0, row.blob.size, 'video/mp4');
    const size = blob.size;
    const headers = new Headers({ 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    const range = request.headers.get('Range');
    if (!range) {
      headers.set('Content-Length', String(size));
      return new Response(blob, { status: 200, headers });
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
    let start, end;
    if (match[1] === '') {
      const suffix = Number(match[2]);
      if (!suffix) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      start = Math.max(0, size - suffix); end = size - 1;
    } else {
      start = Number(match[1]); end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
    }
    const part = blob.slice(start, end + 1, 'video/mp4');
    headers.set('Content-Length', String(part.size));
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    return new Response(part, { status: 206, headers });
  } catch {
    return new Response('Could not read the saved video from this phone.', { status: 500 });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const media = url.pathname.match(/\/offline-media\/(\d{9,})\.mp4$/);
  if (media) {
    event.respondWith(serveOfflineClip(request, media[1]));
    return;
  }
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
