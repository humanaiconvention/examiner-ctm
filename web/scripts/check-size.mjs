#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

function kb(bytes) { return bytes / 1024; }

const root = resolve(process.cwd(), 'dist');
const baselinePath = resolve(process.cwd(), 'size-baseline.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));

if (!statSync(root, { throwIfNoEntry: false })) {
  console.error('dist folder not found. Run build first.');
  process.exit(1);
}

let total = 0; // total code (js + css)
let mainBundle = 0;
let vendorBundle = 0; // legacy aggregate (all vendor like files)
let vendorReactBundle = 0; // react + react-dom + scheduler
let vendorOtherBundle = 0; // other node_modules
let mediaBytes = 0;
let entryScripts = [];
const jsFileSizes = new Map(); // relPath -> size
const jsFileContents = new Map(); // relPath -> buffer (only for entry/vendor to compute compressed)

// Attempt to parse entry HTML for deterministically referenced scripts
try {
  const indexHtmlPath = resolve(root, 'index.html');
  const html = readFileSync(indexHtmlPath, 'utf-8');
  // naive but effective: capture src values of <script ... src="..."> ignoring module/nomodule
  const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    entryScripts.push(match[1]);
  }
} catch {
  // ignore if not found (e.g., build not present yet)
}

function walk(current) {
  for (const entry of readdirSync(current)) {
    const full = resolve(current, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full);
    else if (s.isFile()) {
      const lower = entry.toLowerCase();
      if (lower.endsWith('.js') || lower.endsWith('.css')) {
        total += s.size;
        if (lower.endsWith('.js')) {
          const relPath = full.substring(root.length + 1).replace(/\\/g, '/');
          jsFileSizes.set(relPath, s.size);
          // Keep contents for compression metrics (limit to reasonable size files < 2MB)
          if (s.size < 2 * 1024 * 1024) {
            try { jsFileContents.set(relPath, readFileSync(full)); } catch { /* ignore */ }
          }
          if ((lower.includes('vendor') || lower.includes('vendors'))) {
            vendorBundle += s.size;
            // classify sub-bundles based on filename hints
            if (/vendor-react/i.test(relPath)) {
              vendorReactBundle += s.size;
            } else {
              vendorOtherBundle += s.size;
            }
          }
        }
      } else if (/\.(png|jpe?g|svg|webp|gif|avif)$/i.test(lower)) {
        mediaBytes += s.size;
      }
    }
  }
}
walk(root);

function assertLimit(name, valueKb, limitKb) {
  if (limitKb && valueKb > limitKb) {
    console.error(`Size check failed: ${name} ${valueKb.toFixed(1)}kb > limit ${limitKb}kb`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${name} ${valueKb.toFixed(1)}kb (limit ${limitKb}kb)`);
  }
}

// If we have zero main bundle but exactly one js file counted, treat that as main for tracking purposes
// Determine main bundle size from entry scripts if we have them
if (entryScripts.length) {
  for (const ref of entryScripts) {
    // strip leading slash
    const cleaned = ref.replace(/^\//, '').replace(/^[.\/]+/, '');
    for (const [relPath, size] of jsFileSizes.entries()) {
      if (relPath.endsWith(cleaned)) {
        mainBundle += size;
      }
    }
  }
}

if (mainBundle === 0) {
  // Fallback heuristics: choose largest non-vendor JS file as main
  let largest = 0;
  for (const [relPath, size] of jsFileSizes.entries()) {
    if (/vendor|vendors/i.test(relPath)) continue;
    if (size > largest) largest = size;
  }
  mainBundle = largest;
  if (mainBundle === 0 && vendorBundle === 0 && total > 0) {
    mainBundle = total; // legacy aggregate fallback
  }
}

assertLimit('Total (JS+CSS)', kb(total), baseline.maxTotalKb);
assertLimit('Main bundle', kb(mainBundle), baseline.maxMainKb);
if (baseline.maxVendorReactKb || baseline.maxVendorOtherKb) {
  if (baseline.maxVendorReactKb) assertLimit('Vendor (react core)', kb(vendorReactBundle || vendorBundle), baseline.maxVendorReactKb);
  if (baseline.maxVendorOtherKb) assertLimit('Vendor (other)', kb(vendorOtherBundle || (vendorReactBundle ? vendorBundle - vendorReactBundle : 0)), baseline.maxVendorOtherKb);
} else {
  // fallback legacy single vendor limit
  assertLimit('Vendors bundle', kb(vendorBundle), baseline.maxVendorsKb);
}

// Compressed size metrics (informational only)
function compressMetrics(bytes) {
  const gz = gzipSync(bytes, { level: 9 });
  const br = brotliCompressSync(bytes, { params: {}});
  return { gz: kb(gz.length), br: kb(br.length) };
}

try {
  // Aggregate main + vendor compressed separately
  let mainBuf = Buffer.alloc(0);
  let vendorReactBuf = Buffer.alloc(0);
  let vendorOtherBuf = Buffer.alloc(0);
  for (const [rel, buf] of jsFileContents.entries()) {
    if (/vendor-react/i.test(rel)) vendorReactBuf = Buffer.concat([vendorReactBuf, buf]);
    else if (/vendor|vendors/i.test(rel)) vendorOtherBuf = Buffer.concat([vendorOtherBuf, buf]);
    else if (mainBundle && jsFileSizes.get(rel) && mainBuf.length < mainBundle + 5 * 1024 * 1024) mainBuf = Buffer.concat([mainBuf, buf]);
  }
  if (mainBuf.length) {
    const { gz, br } = compressMetrics(mainBuf);
    console.log(`Info: Main (gz) ${gz.toFixed(1)}kb | (br) ${br.toFixed(1)}kb`);
  }
  if (vendorReactBuf.length) {
    const { gz, br } = compressMetrics(vendorReactBuf);
    console.log(`Info: Vendor React (gz) ${gz.toFixed(1)}kb | (br) ${br.toFixed(1)}kb`);
  }
  if (vendorOtherBuf.length) {
    const { gz, br } = compressMetrics(vendorOtherBuf);
    console.log(`Info: Vendor Other (gz) ${gz.toFixed(1)}kb | (br) ${br.toFixed(1)}kb`);
  }
} catch {
  // non-fatal
}

if (baseline.maxMediaKb || baseline.maxSingleMediaKb) {
  if (baseline.maxMediaKb) assertLimit('Media (aggregate)', kb(mediaBytes), baseline.maxMediaKb);
  if (baseline.maxSingleMediaKb) {
    // rewalk quickly for single largest
    let largest = 0;
    function scanLargest(current) {
      for (const entry of readdirSync(current)) {
        const full = resolve(current, entry);
        const s = statSync(full);
        if (s.isDirectory()) scanLargest(full);
        else if (s.isFile()) {
          const lower = entry.toLowerCase();
            if (/\.(png|jpe?g|svg|webp|gif|avif)$/i.test(lower)) {
              if (s.size > largest) largest = s.size;
            }
        }
      }
    }
    scanLargest(root);
    assertLimit('Largest media asset', kb(largest), baseline.maxSingleMediaKb);
  }
}

if (process.exitCode === 1) {
  console.error('Bundle size limits exceeded. Consider code splitting or dependency review.');
} else {
  console.log('Bundle size within limits.');
  if (mediaBytes) {
    console.log(`(Info) Media assets not counted toward code budget: ${(kb(mediaBytes)).toFixed(1)}kb`);
  }
}
