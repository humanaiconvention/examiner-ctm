#!/usr/bin/env node
/**
 * compare-sbom.mjs
 * Lightweight SBOM diff tool to contextualize hash drift.
 *
 * Usage:
 *   node scripts/compare-sbom.mjs --current web/sbom/sbom.json --baseline web/sbom/sbom.json --out sbom-diff.json
 * If --baseline is omitted or not found, outputs summary with baselineAbsent=true.
 *
 * Comparison heuristic:
 * - Treat each component by package URL (purl) if available, else by (name@version + type).
 * - Report added, removed, and versionChanged arrays.
 * - Provide aggregate counts and a concise human summary.
 */
import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--current') out.current = args[++i];
    else if (a === '--baseline') out.baseline = args[++i];
    else if (a === '--out') out.out = args[++i];
    else if (a === '--license') out.license = true;
  }
  return out;
}

function loadJson(p) {
  if (!p) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function keyOf(c) {
  return c.purl || `${c.type || 'component'}:${c.name || 'unknown'}@${c.version || '0.0.0'}`;
}

function indexComponents(doc) {
  const list = (doc && doc.components) || [];
  const map = new Map();
  for (const c of list) {
    map.set(keyOf(c), c);
  }
  return map;
}

function diff(baseDoc, currDoc) {
  if (!currDoc) throw new Error('Current SBOM missing');
  const baseMap = indexComponents(baseDoc);
  const currMap = indexComponents(currDoc);
  const added = [];
  const removed = [];
  const versionChanged = [];

  for (const [k, comp] of currMap.entries()) {
    if (!baseMap.has(k)) {
      // Attempt loose match by name when purl absent for potential version change
      const name = comp.name;
      if (name) {
        const potential = [...baseMap.keys()].filter(x => x.includes(`:${name}@`));
        if (potential.length === 1) {
          const prev = baseMap.get(potential[0]);
          if (prev && prev.version !== comp.version) {
            versionChanged.push({ name, from: prev.version, to: comp.version, purl: comp.purl || null });
            continue;
          }
        }
      }
      added.push({ key: k, name: comp.name, version: comp.version });
    }
  }
  for (const [k, comp] of baseMap.entries()) {
    if (!currMap.has(k)) {
      removed.push({ key: k, name: comp.name, version: comp.version });
    }
  }
  return { added, removed, versionChanged };
}

(function main() {
  const { current, baseline, out, license } = parseArgs();
  if (!current) {
    console.error('Missing --current path');
    process.exit(1);
  }
  const curr = loadJson(current);
  if (!curr) {
    console.error('Unable to read current SBOM JSON');
    process.exit(2);
  }
  const base = loadJson(baseline);
  if (!base) {
    const result = {
      baselineAbsent: true,
      currentCount: (curr.components || []).length,
      added: [],
      removed: [],
      versionChanged: [],
      summary: 'No baseline SBOM available for diff.'
    };
    if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
    console.log('[sbom-diff]', result.summary);
    return;
  }
  const { added, removed, versionChanged } = diff(base, curr);
  let licenseChanges = [];
  if (license) {
    const norm = v => (v || '').trim();
    const baseLicenses = new Map();
    for (const c of (base.components||[])) {
      if (c.licenses && Array.isArray(c.licenses) && c.licenses.length > 0) {
        baseLicenses.set(keyOf(c), norm(c.licenses[0].license?.id || c.licenses[0].license?.name));
      }
    }
    for (const c of (curr.components||[])) {
      const k = keyOf(c);
      let currLic = '';
      if (c.licenses && Array.isArray(c.licenses) && c.licenses.length > 0) {
        currLic = norm(c.licenses[0].license?.id || c.licenses[0].license?.name);
      }
      if (baseLicenses.has(k)) {
        const prevLic = baseLicenses.get(k);
        if (prevLic !== currLic) {
          licenseChanges.push({ key: k, from: prevLic || null, to: currLic || null });
        }
      }
    }
  }
  const summary = `Components baseline=${(base.components||[]).length} current=${(curr.components||[]).length} +${added.length} -${removed.length} Δver=${versionChanged.length}${license ? ` Δlic=${licenseChanges.length}` : ''}`;
  const result = {
    baselineAbsent: false,
    baselineCount: (base.components || []).length,
    currentCount: (curr.components || []).length,
    added, removed, versionChanged,
    licenseChanges,
    summary
  };
  if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log('[sbom-diff]', summary);
})();
