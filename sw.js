// Service worker: guarda la app en la tablet para que abra rápido (aunque la red tarde en conectar).
// Los datos (Supabase) NUNCA se cachean: siempre en vivo.
// Estrategia: se muestra lo guardado al instante y en segundo plano se revisa si hay versión nueva;
// si la hay, la app avisa con un cartel "Actualizar".
const CACHE = 'amro-tablero-v3';
const SHELL = ['./', 'vendor/supabase.js', 'icons/icon-192.png', 'icons/icon-512.png'];
const firma = h => (h && (h.get('etag') || h.get('last-modified') || h.get('content-length'))) || '';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function avisar() {
  const cs = await self.clients.matchAll({ type: 'window' });
  cs.forEach(c => c.postMessage({ tipo: 'nueva-version' }));
}
// firma de la versión que se le mostró a la tablet y de la última que hay en internet
const guardarFirma = async (k, v) => { const c = await caches.open(CACHE); await c.put('/__' + k, new Response(String(v || ''))); };
const leerFirma = async k => { const c = await caches.open(CACHE); const r = await c.match('/__' + k); return r ? r.text() : ''; };
async function revisar() { const a = await leerFirma('servida'), b = await leerFirma('ultima'); if (a && b && a !== b) avisar(); }
self.addEventListener('message', e => { if (e.data === 'revisar') e.waitUntil(revisar()); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase, CDN, fuentes: directo a la red
  const esDoc = req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(req);
    const red = fetch(req, { cache: 'no-cache' }).then(async res => {
      if (res && res.ok) {
        const nueva = firma(res.headers), vieja = guardado ? firma(guardado.headers) : '';
        await cache.put(req, res.clone());
        if (esDoc) { await guardarFirma('ultima', nueva); if (guardado && nueva && vieja && nueva !== vieja) avisar(); }
      }
      return res;
    }).catch(() => null);
    if (guardado) { if (esDoc) e.waitUntil(guardarFirma('servida', firma(guardado.headers))); e.waitUntil(red); return guardado; }
    const res = await red;
    if (esDoc && res && res.ok) e.waitUntil(guardarFirma('servida', firma(res.headers)));
    return res || (await cache.match('./')) || Response.error();
  })());
});
