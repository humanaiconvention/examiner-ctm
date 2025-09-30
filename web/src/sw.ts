/// <reference lib="webworker" />
// Advanced service worker: versioned precache from build manifest, SWR for static, network-first for API/JSON.
// Fallback: offline shell.

declare const self: ServiceWorkerGlobalScope;

// We embed a build hash placeholder replaced at build time (fallback to Date.now for dev).
// Optionally replaced via a simple vite plugin or sed in CI if desired.
// Build revision injected at runtime (declare on global for typing)
interface ExtendedSW extends ServiceWorkerGlobalScope { BUILD_REV?: string }
const BUILD_REV = (self as unknown as ExtendedSW).BUILD_REV || '__BUILD_HASH__';
const PRECACHE_PREFIX = 'haic-precache-';
const RUNTIME_PREFIX = 'haic-runtime-';
const PRECACHE_NAME = `${PRECACHE_PREFIX}${BUILD_REV}`;
const RUNTIME_NAME = `${RUNTIME_PREFIX}v1`;
const MANIFEST_URL = '/assets/asset-manifest.json'; // published to gh-pages prod; locally we fallback to core list.
const CORE_FALLBACK = ['/', '/index.html', '/vite.svg'];
const MAX_RUNTIME_ENTRIES = 120; // keep runtime cache bounded.
const META_CACHE = 'haic-meta';
const META_MANIFEST_KEY = 'manifest-hash';
const META_MANIFEST_LIST_KEY = 'manifest-list';
// Threshold moved to centralized config
import SW_CONFIG from './sw-config';

// Endpoint TTL policies (supports exact, prefix, regex)
interface TTLPattern { type: 'prefix' | 'regex' | 'exact'; value: string | RegExp; ttl: number }
const API_TTL_PATTERNS: TTLPattern[] = [
  { type: 'prefix', value: '/api/config', ttl: 5 * 60 * 1000 },
  // Example additional pattern: { type: 'regex', value: /\/api\/data\/v\d+\//, ttl: 2 * 60 * 1000 }
];
function matchTTL(pathname: string): number | null {
  for (const p of API_TTL_PATTERNS) {
    if (p.type === 'exact' && pathname === p.value) return p.ttl;
    if (p.type === 'prefix' && pathname.startsWith(p.value as string)) return p.ttl;
    if (p.type === 'regex' && (p.value as RegExp).test(pathname)) return p.ttl;
  }
  return null;
}

// Skip caching certain auth endpoints
function isAuthEndpoint(pathname: string){
  return pathname.startsWith('/api/auth');
}

// Helper: open cache safely
async function openCache(name: string){ return caches.open(name); }

async function fetchManifest(): Promise<string[]> {
  try {
    const resp = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error('manifest not ok');
    const json = await resp.json();
    // Keys are dist relative (e.g., assets/index-XYZ.js). We map to "/" path.
    const assets: string[] = Object.keys(json).map(k => `/${k}`);
    // Include HTML shell and logo explicitly.
    return Array.from(new Set([...CORE_FALLBACK, '/index.html', ...assets.filter(a => /\.(js|css|woff2?|png|jpe?g|svg)$/.test(a))]));
  } catch {
    return CORE_FALLBACK;
  }
}

// Hash helper (simple stable hash)
async function hashList(list: string[]): Promise<string> {
  const data = new TextEncoder().encode(list.sort().join('|'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,16);
}

async function getStoredManifestHash(): Promise<string | null> {
  const cache = await caches.open(META_CACHE);
  const res = await cache.match(META_MANIFEST_KEY);
  if (!res) return null;
  return await res.text();
}

async function storeManifestHash(hash: string) {
  const cache = await caches.open(META_CACHE);
  await cache.put(META_MANIFEST_KEY, new Response(hash, { headers: { 'content-type': 'text/plain' } }));
}

async function getStoredManifestList(): Promise<string[] | null> {
  const cache = await caches.open(META_CACHE);
  const res = await cache.match(META_MANIFEST_LIST_KEY);
  if (!res) return null;
  try { return await res.json() as string[]; } catch { return null; }
}

async function storeManifestList(list: string[]) {
  const cache = await caches.open(META_CACHE);
  await cache.put(META_MANIFEST_LIST_KEY, new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json' } }));
}

import { diffManifests, decideBust } from './sw-logic';
async function refreshPrecacheIfChanged() {
  const latestAssets = await fetchManifest();
  const latestHash = await hashList(latestAssets);
  const previousHash = await getStoredManifestHash();
  const previousList = await getStoredManifestList();
  if (!previousHash) {
    await storeManifestHash(latestHash);
    await storeManifestList(latestAssets);
    return;
  }
  if (previousHash === latestHash) return;
  const diff = diffManifests(previousList, latestAssets);
  const decision = decideBust(diff.ratio, SW_CONFIG.manifestHardBustRatio);
  const cache = await caches.open(PRECACHE_NAME);
  if (decision.strategy === 'hard') {
    const existing = await cache.keys();
    await Promise.all(existing.map(r => cache.delete(r)));
    await cache.addAll(latestAssets);
    // Notify clients specifically that a hard bust completed (for metrics or UX hooks)
    // Edge case: immediately after activation there may be zero controlled clients; we retry with backoff.
    const notify = async (attempt = 0): Promise<void> => {
      const clientsAfter = await self.clients.matchAll({ includeUncontrolled: true });
      if (clientsAfter.length === 0 && attempt < 5) {
        const delay = Math.pow(2, attempt) * 250; // 250ms,500,1000,2000,4000
        await new Promise(r => setTimeout(r, delay));
        return notify(attempt + 1);
      }
      for (const c of clientsAfter) {
        try { c.postMessage({ type: 'hard-bust-complete', total: latestAssets.length, ratio: diff.ratio }); } catch { /* ignore */ }
      }
    };
    notify();
  } else if (decision.strategy === 'incremental') {
    for (const a of diff.added) { try { await cache.add(a); } catch { /* ignore */ } }
    for (const r of diff.removed) { await cache.delete(r); }
  }
  await storeManifestHash(latestHash);
  await storeManifestList(latestAssets);
  const clientList = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clientList) c.postMessage({ type: 'update-available', strategy: decision.strategy, decisionReason: decision.reason, ...diff });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const assets = await fetchManifest();
    const cache = await openCache(PRECACHE_NAME);
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => {
      if (k === PRECACHE_NAME) return false;
      if (k.startsWith(PRECACHE_PREFIX)) return true; // old precache versions
      return false;
    }).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Cleanup helper to bound runtime cache size.
async function trimRuntime() {
  const cache = await caches.open(RUNTIME_NAME);
  const keys = await cache.keys();
  if (keys.length <= MAX_RUNTIME_ENTRIES) return;
  const excess = keys.length - MAX_RUNTIME_ENTRIES;
  for (let i=0; i<excess; i++) {
    await cache.delete(keys[i]);
  }
}

function isAPI(url: URL){
  return url.pathname.startsWith('/api/') || url.pathname.endsWith('.json');
}

// Unified fetch event handler (includes dynamic routes at end)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const respond = async (): Promise<Response> => {
    // Navigation request -> network first
    if (req.mode === 'navigate') {
      try {
        return await fetch(req);
      } catch {
        const shell = await caches.match('/index.html');
        return shell || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    }
    // API / JSON network-first
    if (isAPI(url)) {
      try {
        if (isAuthEndpoint(url.pathname)) return fetch(req);
        const ttl = matchTTL(url.pathname);
        const net = await fetch(req);
        const cache = await caches.open(RUNTIME_NAME);
        if (ttl) {
          const metaHeaders = new Headers(net.headers);
          metaHeaders.set('x-sw-cached-at', Date.now().toString());
          const cloneForCache = new Response(await net.clone().blob(), { status: net.status, statusText: net.statusText, headers: metaHeaders });
          cache.put(req, cloneForCache);
        } else {
          cache.put(req, net.clone());
        }
        return net;
      } catch {
        const cached = await caches.match(req);
        if (cached) {
          const ttl = matchTTL(url.pathname);
          if (ttl) {
            const cachedAt = cached.headers.get('x-sw-cached-at');
            if (cachedAt && (Date.now() - Number(cachedAt) > ttl)) {
              return new Response('Stale cache expired', { status: 504 });
            }
          }
          return cached;
        }
        return new Response('Offline API', { status: 503 });
      }
    }
    // Static assets SWR
    if (/\.(js|css|png|jpe?g|svg|woff2?|ttf)$/.test(url.pathname) || url.pathname.startsWith('/assets/')) {
      const cache = await caches.open(PRECACHE_NAME);
      const cached = await cache.match(req);
      try {
        const net = await fetch(req);
        if (net && net.status === 200) cache.put(req, net.clone());
        return cached || net;
      } catch {
        return cached || new Response('Offline asset', { status: 503 });
      }
    }
    // Dynamic routes (Workbox-style) last
    for (const route of dynamicRoutes) {
      try {
        if (route.match(url, req)) {
          return await route.handler(event as FetchEvent, url, req);
        }
      } catch { /* ignore */ }
    }
    // Default: network pass-through
    return fetch(req);
  };
  event.respondWith(respond());
});

// --- Lightweight Workbox-style route abstraction (future extensibility) ---
type RouteMatch = (url: URL, req: Request) => boolean;
type RouteHandler = (event: FetchEvent, url: URL, req: Request) => Promise<Response> | Response;
interface RegisteredRoute { match: RouteMatch; handler: RouteHandler; }
const dynamicRoutes: RegisteredRoute[] = [];
function registerRoute(match: RouteMatch, handler: RouteHandler){
  dynamicRoutes.push({ match, handler });
}

// Example: (Placeholder for future use) registerRoute for *.json config outside API prefix.
// registerRoute((url) => url.pathname.endsWith('/config.json'), async (event, url, req) => {
//   return fetch(req);
// });

// Use the abstraction for images as an illustration (cache-first with network fallback)
registerRoute(
  (url) => /\.(png|jpe?g|svg)$/.test(url.pathname),
  async (_event, _url, req) => {
    const cache = await caches.open(RUNTIME_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    } catch {
      return new Response('Offline image', { status: 503 });
    }
  }
);

// (Removed second fetch listener—merged into unified handler above.)

// Periodic cleanup trigger (optional message based)
self.addEventListener('message', (event) => {
  if (event.data === 'trim-runtime') trimRuntime();
  if (event.data === 'refresh-precache') refreshPrecacheIfChanged();
  if (event.data === 'force-reload') {
    (async () => {
      await self.skipWaiting();
      await self.clients.claim();
      const clientList = await self.clients.matchAll({ includeUncontrolled: true });
      for (const c of clientList) {
        c.postMessage({ type: 'force-reload' });
      }
    })();
  }
});

// Periodic sync event
self.addEventListener('periodicsync', (event: Event) => {
  interface PeriodicSyncEventLike extends Event { tag?: string; waitUntil: (p: Promise<unknown>) => void }
  const ps = event as PeriodicSyncEventLike;
  if (ps.tag === 'refresh-precache') {
    ps.waitUntil(refreshPrecacheIfChanged());
  }
});
