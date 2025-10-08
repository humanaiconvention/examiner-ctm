#!/usr/bin/env node
// Lightweight Azure Text Analytics connectivity test (ESM, no extra deps)
import fs from 'fs';
import path from 'path';

// Try to load a local .env if present (without adding dotenv as a dependency)
function loadDotenv(projectRoot = process.cwd()) {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Remove surrounding quotes if present
    if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// Load .env from the current working directory (repo root when running from repo)
loadDotenv();

const endpoint = (process.env.AZURE_TEXT_ANALYTICS_ENDPOINT || '').replace(/\/$/, '');
const key = process.env.AZURE_TEXT_ANALYTICS_KEY;

if (!endpoint || !key) {
  console.error('Missing AZURE_TEXT_ANALYTICS_ENDPOINT or AZURE_TEXT_ANALYTICS_KEY in environment or .env');
  console.error('See DEPLOY_AZURE.md for how to set these safely.');
  process.exit(2);
}

const sampleText = `Azure Cognitive Services provide powerful Natural Language features. This repository contains automation that will call Text Analytics for a small smoke test.`;

const urlV32 = `${endpoint}/text/analytics/v3.2/keyPhrases`;
const urlV31 = `${endpoint}/text/analytics/v3.1/keyPhrases`;

// Prefer v3.2 but fall back to v3.1 on 404s for older endpoints
let url = urlV32;

async function run() {
  try {
    const body = { documents: [{ id: '1', language: 'en', text: sampleText }] };
    let res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': key
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // If the v3.2 route returns 404, try v3.1
      if (res.status === 404 && url === urlV32) {
        console.warn('v3.2 endpoint returned 404, trying v3.1 fallback...');
        url = urlV31;
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': key
          },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const txt = await res.text();
        console.error(`Request failed: ${res.status} ${res.statusText}`);
        console.error(txt);
        process.exit(3);
      }
    }

    const json = await res.json();
    // Print a concise, non-secret result
    const doc = json.documents && json.documents[0];
    if (doc && Array.isArray(doc.keyPhrases)) {
      console.log('Text Analytics key phrases (sample):');
      console.log('-', doc.keyPhrases.join('\n- '));
      process.exit(0);
    }

    console.log('Unexpected response shape:');
    console.log(JSON.stringify(json, null, 2));
    process.exit(4);
  } catch (err) {
    console.error('Error calling Text Analytics:', err && err.message ? err.message : err);
    process.exit(5);
  }
}

run();
