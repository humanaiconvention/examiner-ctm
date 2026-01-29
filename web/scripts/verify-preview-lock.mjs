#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';
import crypto from 'crypto';

function fail(msg) {
  console.error(`VERIFY_PREVIEW_LOCK: FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`VERIFY_PREVIEW_LOCK: OK: ${msg}`);
}

const args = process.argv.slice(2);
let distPath = 'dist/index.html';
let jsonMode = false;
let outPath = null;
let requirePassword = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dist' && args[i + 1]) { distPath = args[++i]; continue; }
  if (a === '--json') { jsonMode = true; continue; }
  if (a === '--out' && args[i + 1]) { outPath = args[++i]; continue; }
  if (a === '--require-password') { requirePassword = true; continue; }
}

// Preflight password status
const rawPassword = process.env.PREVIEW_PASSWORD || '';
const passwordDisabled = rawPassword === '__DISABLED__';
const passwordProvided = rawPassword.length > 0 && !passwordDisabled;

// If password required but not provided or disabled => fail early (still emit JSON if requested)
if (requirePassword && (!passwordProvided)) {
  const summary = {
    schemaVersion: '1.1.0',
    file: distPath,
    scriptLength: 0,
    tokensChecked: 0,
    tokensMissing: [],
    hasMarker: false,
    status: 'fail',
    reason: passwordDisabled ? 'password_disabled' : 'password_missing',
    passwordProvided,
    passwordDisabled,
    requirePassword,
    scriptHashSha256: null
  };
  const json = JSON.stringify(summary, null, 2);
  if (jsonMode) {
    if (outPath) {
      try { writeFileSync(outPath, json, 'utf8'); } catch (e) { /* ignore */ }
    }
    console.log(json);
  } else {
    console.error('VERIFY_PREVIEW_LOCK: FAIL: Password required but not provided / disabled.');
  }
  process.exit(1);
}

let html;
try { html = readFileSync(distPath, 'utf8'); }
catch (e) { fail(`Cannot read ${distPath}: ${e.message}`); }

// Basic presence
const markers = { hasMarker: html.includes('__PREVIEW_LOCK__') };
// Missing marker is acceptable only if password not required and not provided.
if (!markers.hasMarker && passwordProvided) fail('Missing marker id __PREVIEW_LOCK__ despite password provided');
if (!markers.hasMarker && !passwordProvided) {
  const summary = {
    schemaVersion: '1.1.0',
    file: distPath,
    scriptLength: 0,
    tokensChecked: 0,
    tokensMissing: [],
    hasMarker: false,
    status: 'ok',
    reason: 'no_password_unprotected',
    passwordProvided,
    passwordDisabled,
    requirePassword,
    scriptHashSha256: null
  };
  const json = JSON.stringify(summary, null, 2);
  if (jsonMode) {
    if (outPath) { try { writeFileSync(outPath, json, 'utf8'); } catch (e) { /* ignore */ } }
    console.log(json);
  } else {
    ok('Preview unlocked (no password provided)');
  }
  process.exit(0);
}

// Extract script tag
const scriptRegex = /<script[^>]*id="__PREVIEW_LOCK__"[^>]*>([\s\S]*?)<\/script>/i;
const match = html.match(scriptRegex);
if (!match) fail('Script tag with id __PREVIEW_LOCK__ not found');

const body = match[1];

// Expected minimal patterns
const expected = [
  'localStorage',
  'prompt(',
  'PREVIEW_PASSWORD',
  'window.__previewLock',
  '!== password'
];

const missing = expected.filter(t => !body.includes(t));
if (missing.length) fail(`Expected token(s) not found: ${missing.join(', ')}`);

// Simple size sanity: ensure script isn't truncated
if (body.length < 120) fail(`Injected script body unexpectedly short (${body.length} chars)`);

const scriptHashSha256 = crypto.createHash('sha256').update(body).digest('hex');

const summary = {
  schemaVersion: '1.2.0',
  file: distPath,
  scriptLength: body.length,
  tokensChecked: expected.length,
  tokensMissing: [],
  hasMarker: markers.hasMarker,
  status: 'ok',
  passwordProvided,
  passwordDisabled,
  requirePassword,
  scriptHashSha256
};

if (jsonMode) {
  const json = JSON.stringify(summary, null, 2);
  if (outPath) {
    try { writeFileSync(outPath, json, 'utf8'); } catch (e) { fail(`Unable to write JSON report: ${e.message}`); }
  }
  console.log(json);
} else {
  ok(`Verified preview lock script in ${basename(distPath)} (length=${body.length})`);
}
