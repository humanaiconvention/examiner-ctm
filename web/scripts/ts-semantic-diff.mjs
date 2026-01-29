#!/usr/bin/env node
/**
 * Produce separate syntactic vs semantic diagnostics for the app tsconfig
 * Without a direct tsserver session we approximate by:
 * 1. Using the TypeScript program API to gather syntactic diagnostics.
 * 2. Gathering semantic + global + options diagnostics.
 * 3. Emitting counts & top codes.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const project = 'tsconfig.app.json'
const basePath = process.cwd()
const configPath = resolve(basePath, project)

const configFile = ts.readConfigFile(configPath, p => readFileSync(p, 'utf8'))
if (configFile.error) {
  console.error('Failed to read config', configFile.error)
  process.exit(1)
}
const parsed = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  basePath,
  {},
  configPath
)

const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })

function collect(diags) {
  const out = diags.map(d => ({
    code: d.code,
    category: ts.DiagnosticCategory[d.category],
    file: d.file?.fileName,
    message: ts.flattenDiagnosticMessageText(d.messageText, '\n')
  }))
  return out
}

const syntactic = collect(program.getSyntacticDiagnostics())
const semantic = collect(program.getSemanticDiagnostics())
const globalDiags = collect(program.getGlobalDiagnostics())
const optionsDiags = collect(program.getOptionsDiagnostics())

function summarize(list) {
  const counts = {}
  for (const d of list) counts[d.code] = (counts[d.code] || 0) + 1
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([code,count])=>({code:Number(code),count}))
  return { total: list.length, byCode: counts, top }
}

const result = {
  generatedAt: new Date().toISOString(),
  config: project,
  fileCount: parsed.fileNames.length,
  syntactic: summarize(syntactic),
  semantic: summarize(semantic),
  global: summarize(globalDiags),
  options: summarize(optionsDiags),
  anySample: [...syntactic, ...semantic, ...globalDiags, ...optionsDiags].slice(0,20)
}

writeFileSync(resolve(basePath, 'ts-semantic-diff.json'), JSON.stringify(result, null, 2))
console.log('Semantic diff written to ts-semantic-diff.json')
