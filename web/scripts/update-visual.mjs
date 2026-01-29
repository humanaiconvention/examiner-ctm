#!/usr/bin/env node
import { spawn } from 'node:child_process';

const env = { ...process.env, PLAYWRIGHT_UPDATE_SNAPSHOTS: '1' };

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env });
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
  });
}
(async () => {
  try {
    console.log('[visual] updating snapshots for all browsers');
    await run('npx', ['playwright', 'test', 'tests/visual.spec.ts']);
  } catch (e) {
    console.error('[visual] update failed', e.message);
    process.exit(1);
  }
})();
