#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const cwd = dirname(fileURLToPath(import.meta.url))
const webDir = resolve(cwd, '..')
process.chdir(webDir)

const CONFIG = 'tsconfig.editor-probe.json'
if (!existsSync(resolve(webDir, CONFIG))) {
  console.error(`Missing ${CONFIG}`)
  process.exit(1)
}

function run(cmd) {
  return execSync(cmd, { stdio: 'pipe' }).toString()
}

// Use tsc --showConfig then parse file list via a throwaway build of include expansion
// We reuse strategy from ts-show-config by invoking tsc -p <config> --showConfig
let showRaw
try {
  showRaw = run(`npx tsc -p ${CONFIG} --showConfig`)
} catch (e) {
  showRaw = e.stdout?.toString() || ''
}

// We'll also listFiles via a small programmatic call: use tsc --listFilesOnly to ensure real compiler expansion
let filesRaw
try {
  filesRaw = run(`npx tsc -p ${CONFIG} --listFilesOnly`)
} catch (e) {
  filesRaw = e.stdout?.toString() || ''
}

const files = filesRaw.split(/\r?\n/).filter(Boolean)
const authored = files.filter(f => f.includes('src'))
const hash = createHash('sha256');
files.forEach(f => hash.update(f + '\n'))

const out = {
  generatedAt: new Date().toISOString(),
  config: CONFIG,
  totalFiles: files.length,
  authoredFiles: authored.length,
  authoredRatio: files.length ? +(authored.length / files.length).toFixed(4) : 0,
  fileHash: hash.digest('hex').slice(0,16),
  sampleFirst20: files.slice(0,20),
  sampleLast20: files.slice(-20),
}

writeFileSync(resolve(webDir, 'ts-editor-probe.json'), JSON.stringify(out, null, 2))
console.log(`Editor probe written to ${resolve(webDir, 'ts-editor-probe.json')}`)
