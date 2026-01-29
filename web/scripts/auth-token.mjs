#!/usr/bin/env node
// Wrapper script with shebang; re-export core utilities for CLI + other scripts.
import { signToken, verifyToken } from './auth-token-core.mjs';
export { signToken, verifyToken };

if (import.meta.url === 'file://' + process.argv[1]) {
  const secret = process.env.SESSION_SIGNING_SECRET || 'dev-secret';
  const ttl = parseInt(process.env.LOGIN_TOKEN_TTL_SECONDS || '600', 10);
  const email = process.env.OWNER_EMAIL || 'unset@example.com';
  const exp = Math.floor(Date.now()/1000) + ttl;
  const token = signToken({ sub: email, exp, purpose: 'owner-login' }, secret);
  console.log(token);
}

