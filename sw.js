/* ── AppNest · Cloudflare Pages fix (Oct 2026) ──
   Cloudflare redirects *.html to clean URLs (/index.html -> /). Chrome refuses a
   "redirected" response that a Service Worker hands to a page load (ERR_FAILED).
   This strips the redirect flag from every response the SW fetches or reads from cache. */
(function(){
  var NB={101:1,204:1,205:1,304:1};
  function clean(r){
    if(!r||!r.redirected||NB[r.status])return r;
    return r.blob().then(function(b){return new Response(b,{status:r.status,statusText:r.statusText,headers:r.headers});});
  }
  var _fetch=self.fetch.bind(self);
  self.fetch=function(input,init){
    if(input&&typeof input==='object'&&input.mode==='navigate')input=input.url;
    return _fetch(input,init).then(clean);
  };
  var cm=Cache.prototype.match;
  Cache.prototype.match=function(){return cm.apply(this,arguments).then(clean);};
  var sm=CacheStorage.prototype.match;
  CacheStorage.prototype.match=function(){return sm.apply(this,arguments).then(clean);};
})();

/* TrickyNest service worker — the app shell is network-first (a new upload always wins online),
   falling back to the cache offline. Pictures are cache-first. Bump VERSION on every upload. */
const VERSION = 'trickynest-v1';
const AV = []; for (let i = 1; i <= 12; i++) AV.push('./av-' + String(i).padStart(2, '0') + '.webp');
const SHELL = ['./', './manifest.json', './icon-192.png', './icon-512.png', './privacy_policy.html'].concat(AV);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#070707;color:#f3efe4;font:18px system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><div style="font-size:48px">🃏</div><p>TrickyNest צריך חיבור לאינטרנט בפתיחה הראשונה.<br>No connection — open once online first.</p></div>';
const isRoot = u => { const p = new URL(u).pathname; const base = new URL(self.registration.scope).pathname; return p === base || p === base + 'index.html'; };

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url).then(r => {
        if (r && r.ok && isRoot(req.url)) { const copy = r.clone(); caches.open(VERSION).then(c => c.put('./', copy)); }
        return r;
      }).catch(() => caches.match(isRoot(req.url) ? './' : req.url).then(r => r || caches.match('./')).then(r => r || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
    );
    return;
  }
  if (/\.(webp|png)$/.test(new URL(req.url).pathname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { if (n && n.ok) { const copy = n.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return n; })));
    return;
  }
  e.respondWith(fetch(req).then(n => { if (n && n.ok) { const copy = n.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return n; }).catch(() => caches.match(req).then(r => r || Promise.reject(new Error('offline')))));
});
