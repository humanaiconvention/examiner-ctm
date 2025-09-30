#!/usr/bin/env node
/**
 * Generate a one-time (time-bounded) owner login link.
 * Usage: node scripts/gen-owner-link.mjs [--base=http://localhost:5060]
 */
import { signToken } from './auth-token.mjs';

const baseArg = process.argv.find(a => a.startsWith('--base='));
const baseUrl = (baseArg ? baseArg.split('=')[1] : (process.env.LOGIN_BASE_URL || 'http://localhost:5060')).replace(/\/$/, '');

const secret = process.env.SESSION_SIGNING_SECRET;
if (!secret) {
  console.error('Missing SESSION_SIGNING_SECRET');
  process.exit(1);
}
const email = process.env.OWNER_EMAIL;
if (!email) {
  console.error('Missing OWNER_EMAIL');
  process.exit(1);
}
const ttl = parseInt(process.env.LOGIN_TOKEN_TTL_SECONDS || '600', 10);
const exp = Math.floor(Date.now()/1000) + ttl;
const token = signToken({ sub: email, exp, purpose: 'owner-login' }, secret);
const url = `${baseUrl}/login?token=${token}`;
console.log(url);
