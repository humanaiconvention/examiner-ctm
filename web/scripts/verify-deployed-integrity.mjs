#!/usr/bin/env node
/**
 * verify-deployed-integrity.mjs
 *
 * Compares the committed baseline integrity hash or a freshly built local hash with the
 * hash reported by a deployed environment (GitHub Pages custom domain or fallback).
 *
 * Usage:
 *   node scripts/verify-deployed-integrity.mjs --url https://www.example.com/ [--baseline web/version-integrity.json] [--rebuild]
 *   node scripts/verify-deployed-integrity.mjs --url https://example.github.io/repo/ --json --out integrity-check.json
 *
 * Exit Codes:
 *   0 success (match)
 *   1 general error / network / missing files
 *   2 mismatch (hash differs)
 *
 * Options:
 *   --url <URL>                  Deployed site base URL (required)
 *   --baseline <path>            Path to baseline integrity JSON (default: web/version-integrity.json or dist/version-integrity.json if present)
 *   --rebuild                    Perform a local build and recompute hash instead of trusting committed baseline
 *   --json                       Emit structured JSON summary to stdout
 *   --out <file>                 Write JSON report to file
 *   --show-index                 Include first 200 chars of remote index in report (for diagnostics)
 *   --timeout <ms>               Network timeout (default 8000)
 *
 * JSON Report Schema (v1):
 * {
 *   "schemaVersion": "1.0.0",
 *   "url": "...",
 *   "baselineSha256": "...",
 *   "remoteSha256": "...",
 *   "match": true/false,
 *   "timestamp": "ISO",
 *   "mode": "baseline|rebuild",
 *   "httpStatus": 200,
 *   "error": null|string,
 *   "elapsedMs": number
 * }
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import https from 'node:https'
import http from 'node:http'

const args = process.argv.slice(2)
function getArg(flag) {
  const i = args.indexOf(flag)
  if (i === -1) return null
  return args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null
}
const has = f => args.includes(f)

const targetUrl = getArg('--url')
if (!targetUrl) {
  console.error('[verify-deployed-integrity] --url required')
  process.exit(1)
}
const timeoutMs = parseInt(getArg('--timeout') || '8000', 10)
let baselinePath = getArg('--baseline')
const jsonMode = has('--json')
const outPath = getArg('--out')
const showIndex = has('--show-index')
const rebuild = has('--rebuild')

function pickDefaultBaseline() {
  const direct = path.resolve('web', 'version-integrity.json')
  const dist = path.resolve('web', 'dist', 'version-integrity.json')
  if (fs.existsSync(direct)) return direct
  if (fs.existsSync(dist)) return dist
  return null
}
if (!baselinePath) baselinePath = pickDefaultBaseline()

function readBaselineHash(p) {
  if (!p || !fs.existsSync(p)) return null
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'))
    return data.sha256 || null
  } catch (e) {
    return null
  }
}

function computeLocalHash() {
  const idx = path.resolve('web', 'dist', 'index.html')
  if (!fs.existsSync(idx)) {
    console.error('[verify-deployed-integrity] dist/index.html missing; did you build?')
    process.exit(1)
  }
  const html = fs.readFileSync(idx, 'utf8')
  return crypto.createHash('sha256').update(html).digest('hex')
}

function localRebuildAndHash() {
  try {
    execSync('npm --workspace web run build', { stdio: 'inherit' })
  } catch (e) {
    console.error('[verify-deployed-integrity] build failed')
    process.exit(1)
  }
  return computeLocalHash()
}

async function fetchJson(url) {
  const raw = await fetchText(url)
  try { return JSON.parse(raw) } catch { return null }
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      reject(new Error('timeout'))
    }, timeoutMs)
    const req = mod.get(url, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, body: data }) })
    })
    req.on('error', err => { clearTimeout(timer); reject(err) })
  }).then(obj => obj).catch(err => { throw err })
}

async function main() {
  const start = Date.now()
  let baselineHash = null
  let mode = 'baseline'
  if (rebuild) {
    baselineHash = localRebuildAndHash()
    mode = 'rebuild'
  } else {
    baselineHash = readBaselineHash(baselinePath)
  }
  if (!baselineHash) {
    console.error('[verify-deployed-integrity] could not determine baseline hash')
  }

  let remoteHtml, remoteSha, statusCode, error = null
  try {
    const root = targetUrl.endsWith('/') ? targetUrl : targetUrl + '/'
    const idxUrl = root
    const res = await fetchText(idxUrl)
    statusCode = res.status
    remoteHtml = res.body
    remoteSha = crypto.createHash('sha256').update(remoteHtml).digest('hex')
  } catch (e) {
    error = e.message || String(e)
  }
  const match = !!baselineHash && !!remoteSha && baselineHash === remoteSha && !error
  const report = {
    schemaVersion: '1.0.0',
    url: targetUrl,
    baselineSha256: baselineHash,
    remoteSha256: remoteSha || null,
    match,
    timestamp: new Date().toISOString(),
    mode,
    httpStatus: statusCode || null,
    error,
    elapsedMs: Date.now() - start
  }
  if (showIndex && remoteHtml) {
    report.remoteIndexPreview = remoteHtml.slice(0, 200)
  }
  if (jsonMode) {
    const jsonStr = JSON.stringify(report, null, 2)
    if (outPath) fs.writeFileSync(outPath, jsonStr)
    console.log(jsonStr)
  } else {
    if (error) {
      console.error(`[verify-deployed-integrity] ERROR url=${targetUrl} err=${error}`)
      process.exit(1)
    }
    if (!match) {
      console.error(`[verify-deployed-integrity] MISMATCH baseline=${baselineHash} remote=${remoteSha}`)
      process.exit(2)
    }
    console.log(`[verify-deployed-integrity] OK sha256=${remoteSha}`)
  }
  if (match) process.exit(0)
}

main().catch(e => { console.error('[verify-deployed-integrity] fatal', e); process.exit(1) })
