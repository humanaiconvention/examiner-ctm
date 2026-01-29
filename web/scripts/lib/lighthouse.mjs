import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', code => code === 0 ? resolve(code) : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function parseLhrFile(path) {
  try { const txt = await readFile(path, 'utf-8'); if (!txt.trim().startsWith('{')) return null; return JSON.parse(txt); } catch { return null; }
}

async function salvageFromDir(dir) {
  const files = await readdir(dir).catch(()=>[]);
  const json = files.filter(f=>f.endsWith('.report.json')).sort().slice(-1)[0];
  if (!json) return null;
  return parseLhrFile(`${dir}/${json}`);
}

function extractScoresAndMetrics(lhr) {
  if (!lhr) return { scores:null, metrics:null };
  const categories = lhr.categories||{}; const audits = lhr.audits||{};
  const scores = Object.fromEntries(Object.entries(categories).map(([k,v])=>[k, v?.score ?? null]));
  const metrics = {
    cls: audits['cumulative-layout-shift']?.numericValue ?? null,
    lcp: audits['largest-contentful-paint']?.numericValue ?? null,
    tbt: audits['total-blocking-time']?.numericValue ?? null,
    inp: audits['interactive']?.numericValue ?? audits['experimental-interaction-to-next-paint']?.numericValue ?? null,
    fcp: audits['first-contentful-paint']?.numericValue ?? null
  };
  return { scores, metrics };
}

export async function runLighthouseCollect(url, configPath) {
  const meta = { mode:null, collectAttempts:0, retries:0, assertAttempts:0 };
  let lastError = null; let data = { scores:null, metrics:null };
  try {
    meta.mode = 'exec-collect'; meta.collectAttempts++;
  // Use direct lhci collect (remove legacy `exec lhci` form that triggered npm executable resolution errors)
  const args = ['lhci','collect','--url', url];
    if (configPath) args.push('--config='+configPath);
    await run('npx', args);
  } catch (e) {
    lastError = e.message;
    meta.mode = 'autorun-fallback';
    for (let i=0;i<2;i++) {
      try {
        meta.retries = i+1; meta.collectAttempts++; meta.assertAttempts++;
        const args = ['lhci','autorun','--upload.target=filesystem','--collect.url='+url];
        if (configPath) args.push('--config='+configPath);
        await run('npx', args); break;
      } catch (err) { lastError = err.message; }
    }
  }
  // Primary directory
  let lhr = await salvageFromDir('.lighthouseci');
  if (!lhr) lhr = await salvageFromDir('lhci-report');
  data = extractScoresAndMetrics(lhr);
  return { ...meta, ...data, error: lastError };
}

export function buildLighthouseAssertions(lh, cfg) {
  if (!lh || !lh.scores) return [];
  const assertions = [];
  const minScores = cfg?.lighthouse?.minScores || {};
  const maxVitals = cfg?.lighthouse?.maxVitals || {};
  const warnMargins = cfg?.lighthouse?.warnMargins || {};
  const scoreWarn = warnMargins.score || 0;
  for (const [cat, score] of Object.entries(lh.scores)) {
    if (score == null || typeof minScores[cat] !== 'number') continue;
    const min = minScores[cat];
    if (min > 0 && score < min) {
      assertions.push(assertion(`categories.${cat}`, 'error', `>=${min}`, score));
    } else if (min > 0 && score < min + scoreWarn) {
      assertions.push(assertion(`categories.${cat}`, 'warning', `>=${min}`, score));
    } else {
      assertions.push(assertion(`categories.${cat}`, 'info', `>=${min}`, score));
    }
  }
  // Vital metrics gating
  const vitalKeys = ['cls','lcp','tbt','inp','fcp'];
  for (const k of vitalKeys) {
    const value = lh.metrics?.[k];
    const max = maxVitals[k];
    if (typeof value !== 'number' || typeof max !== 'number' || max <= 0) continue;
    const warnBand = warnMargins[k+'Ms'] || warnMargins[k] || 0; // allow either naming
    if (value > max) {
      assertions.push(assertion(metricKeyName(k), 'error', `<=${max}`, value));
    } else if (warnBand && value > max - warnBand) {
      assertions.push(assertion(metricKeyName(k), 'warning', `<=${max}`, value));
    } else {
      assertions.push(assertion(metricKeyName(k), 'info', `<=${max}`, value));
    }
  }
  return assertions;
}

export function assertion(id, level, expected, actual) {
  return { id, level, expected, actual };
}

function metricKeyName(k){
  switch(k){
    case 'cls': return 'cumulative-layout-shift';
    case 'lcp': return 'largest-contentful-paint';
    case 'tbt': return 'total-blocking-time';
    case 'inp': return 'interaction-to-next-paint';
    case 'fcp': return 'first-contentful-paint';
    default: return k;
  }
}
