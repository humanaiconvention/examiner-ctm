import { readFile, readdir } from 'node:fs/promises';

export async function enumerateCssAssets(directories = ['dist','dist/assets']) {
  const cssAssets = [];
  for (const dir of directories) {
    try {
      const entries = await readdir(dir);
      const cssFiles = entries.filter(f => f.endsWith('.css'));
      for (const file of cssFiles) {
        try {
          const full = dir + '/' + file;
            const buf = await readFile(full);
            const raw = buf.byteLength;
            let gz = null;
            try { const zlib = await import('node:zlib'); gz = zlib.gzipSync(buf).byteLength; } catch {}
            cssAssets.push({ file: (dir==='dist'?'': 'assets/') + file, raw, gzip: gz });
        } catch {}
      }
    } catch {}
  }
  return cssAssets;
}

export async function computeSha256Base64(buf) {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(hash);
  let binary = '';
  for (let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  return 'sha256-' + Buffer.from(binary, 'binary').toString('base64');
}

export async function gzipSize(buffer) {
  try { const zlib = await import('node:zlib'); return zlib.gzipSync(buffer).byteLength; } catch { return null; }
}
