import { readFile, readdir } from 'node:fs/promises';

export async function discoverBundles(indexPath = 'dist/index.html') {
  const html = await readFile(indexPath, 'utf-8');
  const scriptRegexGlobal = /<script type="module" crossorigin src="(.*?)"(?: integrity="(sha256-[^"]+)")?><\/script>/g;
  const bundles = [];
  let m;
  while ((m = scriptRegexGlobal.exec(html)) !== null) {
    let src = m[1];
    const integrity = m[2] || null;
    if (src.startsWith('/')) src = src; // keep leading slash for consistency
    bundles.push({ src, integrity });
  }
  if (!bundles.length) throw new Error('Unable to locate any module bundle script tags');
  return { bundles, html };
}

export async function probe(url) {
  const start = performance.now();
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const buf = await res.arrayBuffer();
    const ms = Math.round(performance.now() - start);
    return { ok: res.ok, status: res.status, length: buf.byteLength, ms };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
