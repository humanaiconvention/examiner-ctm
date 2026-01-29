#!/usr/bin/env node
import { spawn } from 'node:child_process';

const env = { ...process.env, VITE_ENABLE_DRIFT_HARNESS: 'true' };

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: { ...env, ...opts.env } });
    p.on('exit', (code) => {
      if (code !== 0) reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
      else resolve();
    });
  });
}

(async () => {
  try {
    console.log('[e2e] building with harness enabled');
    await run('npm', ['run', 'build']);
    console.log('[e2e] ensuring Playwright browsers installed');
    await run('npx', ['playwright', 'install', '--with-deps']);
    console.log('[e2e] running Playwright tests');
    await run('playwright', ['test', ...process.argv.slice(2)]);
  } catch (err) {
    console.error('[e2e] failed:', err.message);
    process.exit(1);
  }
})();
