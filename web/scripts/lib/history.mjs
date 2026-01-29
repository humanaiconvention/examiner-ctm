import { readFile, writeFile } from 'node:fs/promises';

export async function loadHistory(path) {
  if (!path) return null;
  try { return JSON.parse(await readFile(path,'utf-8')); } catch { return { runs: [] }; }
}

export async function saveHistory(path, history, maxEntries) {
  if (!path) return;
  try {
    const pruned = { runs: history.runs.slice(-maxEntries) };
    await writeFile(path, JSON.stringify(pruned, null, 2), 'utf-8');
  } catch {}
}

export function appendRun(history, run) {
  history.runs.push(run);
}
