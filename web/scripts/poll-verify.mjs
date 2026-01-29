#!/usr/bin/env node
// Poll the verify-deployed-integrity script until match or timeout.
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const VERIFY_CMD = ['node', 'web/scripts/verify-deployed-integrity.mjs', '--url', 'https://www.humanaiconvention.com/', '--json'];
const MAX_ATTEMPTS = 12; // ~6 minutes (12 * 30s)
const INTERVAL_MS = 30_000;

async function runOnce() {
  return new Promise((resolve) => {
    const p = spawn(VERIFY_CMD[0], VERIFY_CMD.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (b) => { out += b.toString(); });
    p.stderr.on('data', (b) => { out += b.toString(); });
    p.on('close', (code) => {
      let json = null;
      try { json = JSON.parse(out); } catch (e) { /* ignore */ }
      resolve({ code, out, json });
    });
  });
}

(async function main(){
  for (let i=1;i<=MAX_ATTEMPTS;i++){
    console.log(`Poll attempt ${i}/${MAX_ATTEMPTS}`);
    const { code, out, json } = await runOnce();
    console.log(out);
    if (json && json.match === true) {
      console.log('Deployed SHA matches baseline.');
      process.exit(0);
    }
    console.log('Not matched yet. Waiting...');
    if (i < MAX_ATTEMPTS) await wait(INTERVAL_MS);
  }
  console.error('Timed out waiting for deployed SHA to match baseline');
  process.exit(2);
})();
