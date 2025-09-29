#!/usr/bin/env node
/**
 * Verifies that dist/index.html meta x-app-version matches public/version.json (or dist/version.json after build)
 * and that window.__APP_VERSION__ placeholder has been replaced.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const dist = path.resolve(process.cwd(), 'dist')
const idxPath = path.join(dist, 'index.html')
if (!fs.existsSync(idxPath)) {
  console.error('[verify-inline-version] dist/index.html missing')
  process.exit(1)
}

const versionJsonPath = fs.existsSync(path.join(dist, 'version.json'))
  ? path.join(dist, 'version.json')
  : path.join(process.cwd(), 'public', 'version.json')

if (!fs.existsSync(versionJsonPath)) {
  console.error('[verify-inline-version] version.json missing')
  process.exit(1)
}

const html = fs.readFileSync(idxPath, 'utf8')
const metaMatch = html.match(/<meta name="x-app-version" content="([^"]+)">/)
if (!metaMatch) {
  console.error('[verify-inline-version] meta tag not found or missing content attribute')
  process.exit(1)
}
const metaValue = metaMatch[1]
const vData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'))
const expected = vData.version + '+' + (vData.commit || '')
if (metaValue !== expected) {
  console.error(`[verify-inline-version] mismatch meta=${metaValue} expected=${expected}`)
  process.exit(2)
}
if (html.includes('window.__APP_VERSION__ = undefined')) {
  console.error('[verify-inline-version] window.__APP_VERSION__ was not inlined')
  process.exit(3)
}
let hashOut = null
if (process.argv.includes('--with-hash')) {
  const sha256 = crypto.createHash('sha256').update(html).digest('hex')
  const artifact = {
    file: 'dist/index.html',
    sha256,
    version: vData.version,
    commit: vData.commit,
    generatedAt: new Date().toISOString()
  }
  const outPath = path.join(dist, 'version-integrity.json')
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2))
  hashOut = sha256
  console.log(`[verify-inline-version] hash sha256=${sha256}`)
}
console.log('[verify-inline-version] OK')
if (hashOut) {
  // Emit machine readable summary line for workflows to parse
  console.log(`::notice title=VersionIntegrityHash::sha256=${hashOut}`)
}
