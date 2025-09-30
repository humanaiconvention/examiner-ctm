#!/usr/bin/env node
/**
 * Minimal HMAC-SHA256 signed token utilities (JWT-lite) for single-owner auth.
 * Format: base64url(header).base64url(payload).base64url(signature)
 * Header: { alg: 'HS256', typ: 'JWT' }
 * Payload: { sub, exp, purpose }
 */
import crypto from 'node:crypto';

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function b64urlJson(obj) { return b64url(JSON.stringify(obj)); }
function hmacSign(data, secret) { return b64url(crypto.createHmac('sha256', secret).update(data).digest()); }

export function signToken({ sub, exp, purpose }, secret) {
  if (!secret) throw new Error('Missing secret');
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub, exp, purpose };
  const body = b64urlJson(header) + '.' + b64urlJson(payload);
  const sig = hmacSign(body, secret);
  return body + '.' + sig;
}

export function verifyToken(token, secret) {
  if (!secret) throw new Error('Missing secret');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [h, p, s] = parts;
  const expected = hmacSign(h + '.' + p, secret);
  if (!timingSafeEqual(expected, s)) throw new Error('Bad signature');
  let payload;
  try { payload = JSON.parse(Buffer.from(p.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8')); } catch { throw new Error('Invalid payload'); }
  if (payload.exp && Date.now()/1000 > payload.exp) throw new Error('Expired');
  return payload;
}

function timingSafeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// If invoked directly: generate a sample token (dev convenience)
if (import.meta.url === 'file://' + process.argv[1]) {
  const secret = process.env.SESSION_SIGNING_SECRET || 'dev-secret';
  const ttl = parseInt(process.env.LOGIN_TOKEN_TTL_SECONDS || '600', 10);
  const email = process.env.OWNER_EMAIL || 'unset@example.com';
  const exp = Math.floor(Date.now()/1000) + ttl;
  const token = signToken({ sub: email, exp, purpose: 'owner-login' }, secret);
  console.log(token);
}
