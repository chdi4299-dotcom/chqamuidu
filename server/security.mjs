import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fail } from './errors.mjs';
export const cookieNames = cfg => ({ session: cfg.secure ? '__Host-vezlio_session' : 'vezlio_dev_session', csrf: cfg.secure ? '__Host-vezlio_csrf' : 'vezlio_dev_csrf' });
export function cookies(request) {
  const out = Object.create(null);
  for (const item of (request.headers.get('cookie') || '').split(';')) {
    const i = item.indexOf('=');
    if (i < 0) continue;
    const key = item.slice(0, i).trim();
    if (Object.hasOwn(out, key)) fail(400, 'invalid_cookie', 'Duplicate session cookies. Clear site cookies and sign in again.');
    out[key] = item.slice(i + 1).trim();
  }
  return out;
}
export function setCookie(headers, cfg, name, value, maxAge) {
  headers.append('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAge))}${cfg.secure ? '; Secure' : ''}`);
}
export function issueCsrf(request, headers, cfg) {
  const name = cookieNames(cfg).csrf;
  const current = cookies(request)[name];
  const token = /^[a-f0-9]{64}$/.test(current || '') ? current : randomBytes(32).toString('hex');
  setCookie(headers, cfg, name, token, 3600);
  return token;
}
export function assertSameOrigin(request, cfg) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'cross_origin', 'Cross-site requests are not allowed.');
  const origin = request.headers.get('origin');
  if (origin && origin !== cfg.origin) fail(403, 'cross_origin', 'Request origin is not allowed.');
}
export function assertMutation(request, cfg) {
  assertSameOrigin(request, cfg);
  if (request.headers.get('origin') !== cfg.origin) fail(403, 'cross_origin', 'A same-origin request is required.');
  const given = request.headers.get('x-vezlio-csrf') || '';
  const stored = cookies(request)[cookieNames(cfg).csrf] || '';
  if (!/^[a-f0-9]{64}$/.test(given) || !/^[a-f0-9]{64}$/.test(stored) || !timingSafeEqual(Buffer.from(given), Buffer.from(stored))) {
    fail(403, 'csrf_failed', 'Session verification failed. Reload this page and try again.');
  }
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') fail(415, 'json_required', 'Send an application/json request.');
}
export async function readJson(request) {
  if (!request.body) fail(400, 'invalid_json', 'A JSON object is required.');
  const reader = request.body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16384) { await reader.cancel(); fail(413, 'body_too_large', 'Request is too large.'); }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch (error) {
    if (error.status) throw error;
    fail(400, 'invalid_json', 'A valid JSON object is required.');
  } finally { reader.releaseLock(); }
}
export function securityHeaders(admin = true) {
  return new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Netlify-CDN-Cache-Control': 'no-store',
    'Vary': 'Cookie, Origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
    ...(admin ? { 'X-Robots-Tag': 'noindex, nofollow, noarchive' } : {})
  });
}
export function storeSession(headers, cfg, verified) {
  const token = verified.token;
  if (!token || token.length > 3800 || /[^A-Za-z0-9_.-]/.test(token)) fail(502, 'session_error', 'The owner session could not be stored safely.');
  const remaining = Math.min(3600, verified.claims.exp - Math.floor(Date.now() / 1000));
  if (remaining <= 0) fail(401, 'session_expired', 'Sign in again.');
  setCookie(headers, cfg, cookieNames(cfg).session, token, remaining);
}
export const clearSession = (headers, cfg) => setCookie(headers, cfg, cookieNames(cfg).session, '', 0);
