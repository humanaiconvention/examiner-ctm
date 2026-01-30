// Generated lightweight service worker (offline shell)
const CACHE_NAME='haic-shell-v1';
const CORE_ASSETS=['/','/index.html','/vite.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE_ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;const u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin)return;if(r.mode==='navigate'){e.respondWith(fetch(r).catch(()=>caches.match('/index.html')));return}if(CORE_ASSETS.includes(u.pathname)||u.pathname.startsWith('/assets/')){e.respondWith(caches.match(r).then(res=>res||fetch(r).then(resp=>{const clone=resp.clone();caches.open(CACHE_NAME).then(c=>c.put(r,clone));return resp;})))} });