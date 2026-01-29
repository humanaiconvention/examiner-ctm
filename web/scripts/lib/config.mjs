import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DEFAULT_CONFIG_PATH = 'diagnostics.config.json';

function envOverride(obj, prefix = 'DIAG_') {
  // Flatten path keys like thresholds.maxHtmlMs => DIAG_THRESHOLDS_MAXHTMLMS
  const out = structuredClone(obj);
  const walk = (cur, path=[]) => {
    for (const k of Object.keys(cur)) {
      const val = cur[k];
      const newPath = [...path, k];
      if (val && typeof val === 'object' && !Array.isArray(val)) walk(val, newPath);
      else {
        const envKey = prefix + newPath.join('_').replace(/[-.]/g,'_').toUpperCase();
        if (process.env[envKey] != null) {
          const raw = process.env[envKey];
          let parsed = raw;
            if (raw === 'true') parsed = true; else if (raw === 'false') parsed = false; else if (!isNaN(Number(raw))) parsed = Number(raw);
          cur[k] = parsed;
        }
      }
    }
  };
  walk(out);
  return out;
}

export async function loadDiagnosticsConfig(path = DEFAULT_CONFIG_PATH) {
  if (!existsSync(path)) return null;
  try {
    const txt = await readFile(path, 'utf-8');
    const json = JSON.parse(txt);
    return envOverride(json);
  } catch (e) {
    return null;
  }
}

export function resolveThreshold(val, fallback) {
  return typeof val === 'number' && val > 0 ? val : (fallback || 0);
}
