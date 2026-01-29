import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { signToken, verifyToken } from './auth-token.mjs';

const epochPath = join(process.cwd(), 'web', '.auth', 'session-epoch.json');

export async function getCurrentEpoch() {
  if (!existsSync(epochPath)) return 0;
  try { const data = JSON.parse(await readFile(epochPath, 'utf8')); return data.epoch || 0; } catch { return 0; }
}

function uaHash(ua) {
  if (!ua) return '';
  // lightweight hash (not cryptographic requirement, just binding token to agent class)
  let h = 0; for (let i=0;i<ua.length;i++) { h = (h*31 + ua.charCodeAt(i)) >>> 0; }
  return h.toString(16);
}

export async function issueSession(email, secret, maxAgeSec, req) {
  const exp = Math.floor(Date.now()/1000) + maxAgeSec;
  const ep = await getCurrentEpoch();
  const ua = uaHash(req.headers['user-agent'] || '');
  const ip = (req.socket.remoteAddress || '').split(':').slice(-1)[0];
  return signToken({ sub: email, exp, purpose: 'owner-session', ep, ua, ip }, secret);
}

export async function validateSession(token, secret, req) {
  try {
    const payload = verifyToken(token, secret);
    if (payload.purpose !== 'owner-session') return null;
    // epoch match
    const epNow = await getCurrentEpoch();
    if (typeof payload.ep === 'number' && payload.ep !== epNow) return null;
    // UA hash match (allow empty tolerance for older tokens without ua claim)
    const ua = uaHash(req.headers['user-agent'] || '');
    if (payload.ua && payload.ua !== ua) return null;
    // Short IP prefix binding (/24 style). Only apply if token had ip claim.
    const ip = (req.socket.remoteAddress || '').split(':').slice(-1)[0];
    if (payload.ip && payload.ip.split('.').slice(0,3).join('.') !== ip.split('.').slice(0,3).join('.')) return null;
    return payload;
  } catch { return null; }
}
