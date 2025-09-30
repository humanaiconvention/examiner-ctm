#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readJSON(p, fb=null) { try { return JSON.parse(readFileSync(p,'utf8')); } catch { return fb; }}
let root = process.cwd()
// Detect if current cwd is the web directory itself (has package.json name "web")
try {
  const pkg = JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'))
  if (pkg.name === 'web') {
    // parent is repo root
    root = resolve(root,'..')
  }
} catch {}

const agg = readJSON(resolve(root,'web','ts-errors-aggregate.json'), null)
const sem = readJSON(resolve(root,'web','ts-semantic-diff.json'), null)

const out = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  aggregate: agg,
  semantic: sem,
  summary: {
    totalErrors: agg?.totalErrors ?? null,
    syntactic: sem?.syntactic?.total ?? null,
    semantic: sem?.semantic?.total ?? null,
    global: sem?.global?.total ?? null,
    options: sem?.options?.total ?? null
  }
}
writeFileSync(resolve(root,'web','ts-problem.json'), JSON.stringify(out,null,2))
console.log('TS problem artifact written: web/ts-problem.json')
