#!/usr/bin/env node
/**
 * Converts npm audit JSON (audit.json) into a minimal SARIF v2.1.0 file for GitHub ingestion.
 * Focuses on high & critical severities plus optionally moderate when STAGE_MODERATE_FAIL_DATE passed.
 */
import fs from 'node:fs'

const input = 'audit.json'
if (!fs.existsSync(input)) {
  console.error('[audit-sarif] audit.json not found. Run security:audit first.')
  process.exit(1)
}
const data = JSON.parse(fs.readFileSync(input, 'utf8'))
const vulnerabilities = data.vulnerabilities ? Object.values(data.vulnerabilities) : []

const stageDate = process.env.STAGE_MODERATE_FAIL_DATE ? new Date(process.env.STAGE_MODERATE_FAIL_DATE) : null
const now = new Date()
const includeModerate = stageDate && now >= stageDate

const severityRank = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 }

function toRuleId(v) {
  return `npm/${(v.name||v.module_name||'package')}`
}

const results = []
const rulesMap = new Map()
for (const v of vulnerabilities) {
  const sev = v.severity || v.severityValue || 'info'
  if (!['critical','high'].includes(sev) && !(includeModerate && sev==='moderate')) continue
  const ruleId = toRuleId(v)
  if (!rulesMap.has(ruleId)) {
    rulesMap.set(ruleId, {
      id: ruleId,
      name: v.name || v.module_name || 'package',
      shortDescription: { text: `${sev.toUpperCase()} vulnerability in ${(v.name||v.module_name)}` },
      help: { text: (v.url || v.advisoryUrl || '') }
    })
  }
  results.push({
    ruleId,
    level: sev === 'critical' || sev === 'high' ? 'error' : 'warning',
    message: { text: `${sev.toUpperCase()}: ${(v.title||v.overview||'Vulnerability')} (${v.name||v.module_name})` },
    properties: {
      severity: sev,
      via: v.via || [],
      range: v.range || v.vulnerable_versions || ''
    }
  })
}

const sarif = {
  version: '2.1.0',
  $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
  runs: [
    {
      tool: {
        driver: {
          name: 'npm-audit-converter',
            rules: Array.from(rulesMap.values())
        }
      },
      results
    }
  ]
}
fs.writeFileSync('audit.sarif', JSON.stringify(sarif, null, 2))
console.log(`[audit-sarif] Wrote audit.sarif with ${results.length} result(s). Include moderate: ${includeModerate}`)
