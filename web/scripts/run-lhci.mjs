import { spawn } from 'node:child_process';

const url = process.env.LHCI_URL || 'http://localhost:5173';
const isCI = !!process.env.CI;

async function main() {
  // Start a preview server if not already running (simple heuristic: fetch root)
  let serverProc;
  if (!process.env.LHCI_NO_SERVER) {
    serverProc = spawn('npm', ['run', 'preview', '--', '--port', '5173'], { stdio: 'inherit', shell: true });
    // Give server time to boot
    await new Promise(r => setTimeout(r, 5000));
  }

  const lhciArgs = ['autorun'];
  if (isCI) {
    lhciArgs.push('--collect.numberOfRuns=2');
  }

  const child = spawn('npx', ['lhci', ...lhciArgs, `--collect.url=${url}`], { stdio: 'inherit', shell: true });
  const code = await new Promise(res => child.on('close', res));

  if (serverProc) serverProc.kill('SIGTERM');
  if (code !== 0) process.exit(code);
}

main().catch(e => { console.error(e); process.exit(1); });
