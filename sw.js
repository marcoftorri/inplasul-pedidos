// Pedidos Inplasul - service worker (funciona offline)
// Ao publicar uma versão nova, troque o número abaixo.
const CACHE = 'inplasul-pedidos-v3';
const ARQUIVOS = [
  './', 'index.html', 'app.js', 'manifest.json',
  'lib/jspdf.umd.min.js', 'lib/jspdf.plugin.autotable.min.js', 'lib/xlsx.full.min.js',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Responde do cache na hora e atualiza em segundo plano
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const rede = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => cached);
      return cached || rede;
    })
  );
});
