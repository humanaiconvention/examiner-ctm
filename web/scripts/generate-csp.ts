#!/usr/bin/env ts-node
/**
 * Generates environment-specific routes.json with CSP differences.
 * Usage: ts-node scripts/generate-csp.ts <env> (env = prod|dev)
 */
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const env = process.argv[2] || process.env.NODE_ENV || 'dev';
if (!['prod', 'dev'].includes(env)) {
  console.error('Invalid env. Use prod or dev.');
  process.exit(1);
}

// Base CSP directives shared by both environments
const baseCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // dev includes eval for Vite HMR; stripped below for prod
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.applicationinsights.azure.com https://dc.services.visualstudio.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
];

let csp = [...baseCsp];

if (env === 'prod') {
  // Remove unsafe-eval in prod and narrow script-src
  csp = csp.map(d => d.startsWith('script-src') ? "script-src 'self' 'unsafe-inline'" : d);
  // Optionally add upgrade-insecure-requests
  csp.push('upgrade-insecure-requests');
} else {
  // dev: allow Vite websocket / HMR
  csp = csp.map(d => d.startsWith('connect-src') ? d + ' ws://localhost:*' : d);
}

const cspHeader = csp.join('; ');

const templatePath = join(__dirname, '..', 'public', 'routes.template.json');
const outputPath = join(__dirname, '..', 'public', 'routes.json');

const tmpl = readFileSync(templatePath, 'utf8');
const rendered = tmpl.replace(/__CSP__/, cspHeader);

writeFileSync(outputPath, rendered);
console.log(`Generated routes.json for ${env} with CSP length=${cspHeader.length}`);
