#!/usr/bin/env node
/*
  Lightweight HTTPS dev server launcher for Vite without relying on @vitejs/plugin-basic-ssl (version mismatch with Vite 7).
  Strategy:
    1. Look for certificates in ./certs/dev.{key,crt}
    2. If absent, attempt to use mkcert (if installed) to generate them (best-effort, no hard failure if mkcert missing).
    3. Spawn Vite with --https --host using the discovered/generated certs.
    4. If we fail to get certs, fall back to plain HTTP with a warning.
*/

const { spawn } = require('node:child_process')
const { existsSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const certDir = join(process.cwd(), 'certs')
const keyPath = join(certDir, 'dev.key')
const certPath = join(certDir, 'dev.crt')

function log(msg) { console.log(`dev:https: ${msg}`) }

// Determine if https requested (presence of --https in argv or default because script is specifically for https)
const wantHttps = process.argv.includes('--https')
if (wantHttps) {
  process.env.VITE_USE_HTTPS = '1'
}

async function ensureCerts() {
  if (existsSync(keyPath) && existsSync(certPath)) {
    log('Using existing certificates in certs/')
    return true
  }
  try {
    mkdirSync(certDir, { recursive: true })
    // Try mkcert
    await new Promise((resolve, reject) => {
      const mk = spawn('mkcert', ['-key-file', keyPath, '-cert-file', certPath, 'localhost'], { stdio: 'inherit' })
      mk.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`mkcert exited ${code}`)))
      mk.on('error', reject)
    })
    if (existsSync(keyPath) && existsSync(certPath)) {
      log('Generated localhost certs with mkcert')
      return true
    }
  } catch (e) {
    log(`mkcert not available or failed (${e.message || e}). Will fall back if no certs.`)
  }
  return existsSync(keyPath) && existsSync(certPath)
}

ensureCerts().then((got) => {
  const enable = wantHttps && got
  const args = ['--host']
  if (enable) {
    args.push('--https', '--key', keyPath, '--cert', certPath)
  } else {
    log('Starting without HTTPS (certs unavailable). Install mkcert for local trusted HTTPS: https://github.com/FiloSottile/mkcert')
  }
  process.env.VITE_USE_HTTPS = enable ? '1' : ''
  const path = require('node:path')
  const fs = require('node:fs')
  let bin = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
  if (fs.existsSync(bin)) {
    const viteProc = spawn(bin, args, { stdio: 'inherit', shell: false })
    viteProc.on('exit', (code) => process.exit(code ?? 0))
  } else {
    // Fallback: programmatic API
    log('Falling back to programmatic Vite server start')
    const { createServer } = require('vite')
    createServer({ server: enable ? { https: { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) } } : {} })
      .then(server => server.listen())
      .then(server => {
        const info = server.config.server
        log(`Dev server running at ${enable ? 'https' : 'http'}://localhost:${info.port}`)
      })
      .catch(err => { console.error(err); process.exit(1) })
  }
}).catch((e) => {
  console.error(e)
  process.exit(1)
})
