import { createClient } from '@supabase/supabase-js';
import { fail } from './errors.mjs';
import { UUID } from './config.mjs';

function timedFetch(fetchImpl) {
  return (input, init = {}) => fetchImpl(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
}
function client(cfg, fetchImpl, token) {
  return createClient(cfg.supabaseUrl, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timedFetch(fetchImpl), headers: token ? { Authorization: `Bearer ${token}` } : {} }
  });
}
export function createAuth(cfg, fetchImpl = fetch) {
  // New client for each request. No browser storage, refresh-token cookie or service key.
  const sb = client(cfg, fetchImpl);
  const transport = timedFetch(fetchImpl);
  async function mfaRequest(token, path, body, method = 'POST') {
    const response = await transport(`${cfg.supabaseUrl}/auth/v1/${path}`, {
      method,
      headers: { apikey: cfg.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) fail(response.status === 429 ? 429 : 400, 'mfa_failed', response.status === 429 ? 'Too many attempts. Wait before trying again.' : 'Authenticator request failed. Check the code or sign in again.');
    return response.status === 204 ? null : response.json();
  }
  return {
    async verify(token) {
      if (typeof token !== 'string' || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) fail(401, 'sign_in_required', 'Sign in to continue.');
      const { data, error } = await sb.auth.getClaims(token);
      if (error || !data?.claims) fail(401, 'sign_in_required', 'Your session is invalid or expired. Sign in again.');
      const c = data.claims, now = Math.floor(Date.now() / 1000);
      const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
      if (!UUID.test(c.sub || '') || c.iss !== `${cfg.supabaseUrl}/auth/v1` || c.role !== 'authenticated' ||
          !aud.includes('authenticated') || !Number.isFinite(c.exp) || c.exp <= now ||
          !Number.isFinite(c.iat) || c.iat > now + 60 || now - c.iat > 3600 || (c.nbf !== undefined && c.nbf > now)) {
        fail(401, 'sign_in_required', 'Your session is invalid or expired. Sign in again.');
      }
      // Network-backed user verification also rejects deleted/disabled users.
      const result = await sb.auth.getUser(token);
      if (result.error || !result.data?.user || result.data.user.id !== c.sub || (result.data.user.banned_until && Date.parse(result.data.user.banned_until) > Date.now()) || result.data.user.deleted_at) fail(401, 'sign_in_required', 'Your account could not be verified. Sign in again.');
      return { token, claims: c, user: result.data.user };
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data?.session?.access_token) fail(error?.status === 429 ? 429 : 401, 'sign_in_failed', 'Sign-in failed. Check your credentials or try again later.');
      return data.session.access_token; // Intentionally discard the refresh token.
    },
    async signOut(token) { await sb.auth.admin.signOut(token, 'local'); },
    async enroll(token, factors) {
      if (factors.some(f => f.status === 'verified')) fail(403, 'factor_exists', 'Use your existing authenticator. Factor replacement requires the documented recovery procedure.');
      // Restart only incomplete TOTP enrollment. Never remove a verified factor.
      for (const f of factors.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
        if (UUID.test(f.id)) await mfaRequest(token, `factors/${f.id}`, undefined, 'DELETE');
      }
      const data = await mfaRequest(token, 'factors', { factor_type: 'totp', friendly_name: 'VEZLIO owner', issuer: 'VEZLIO' });
      if (!UUID.test(data?.id || '') || !data?.totp?.qr_code || !data?.totp?.secret) fail(502, 'mfa_failed', 'Authenticator setup returned an invalid response.');
      return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
    },
    async challengeAndVerify(token, factorId, code) {
      const challenge = await mfaRequest(token, `factors/${factorId}/challenge`, {});
      if (!UUID.test(challenge?.id || '')) fail(502, 'mfa_failed', 'Authenticator challenge could not be created.');
      const session = await mfaRequest(token, `factors/${factorId}/verify`, { challenge_id: challenge.id, code });
      if (!session?.access_token) fail(502, 'mfa_failed', 'Authenticator verification returned no session.');
      return session.access_token;
    }
  };
}
const tables = Object.freeze({ products: 'vezlio_products', packages: 'vezlio_packages', services: 'vezlio_services', contacts: 'vezlio_contact_settings' });
function dbError(error) {
  if (!error) return;
  // Do not leak internal SQL/schema/query details into client responses.
  if (error.code === '23505') fail(409, 'duplicate', 'That service ID already exists. Choose a unique ID.');
  if (['23503', '23514', '23502', '22P02'].includes(error.code)) fail(400, 'invalid_record', 'The record does not meet the catalogue requirements.');
  if (error.code === '42501') fail(403, 'forbidden', 'Database authorization denied this operation.');
  fail(502, 'database_unavailable', 'The database could not complete the request. Check configuration and try again.');
}
export function createStore(cfg, token, fetchImpl = fetch) {
  // User JWT is forwarded to PostgREST, so RLS still applies after server checks.
  const sb = client(cfg, fetchImpl, token);
  return {
    async assertOwner() {
      const { data, error } = await sb.rpc('vezlio_is_owner');
      dbError(error);
      if (data !== true) fail(403, 'owner_not_designated', 'Owner access is not enabled in the database. Check the owner designation.');
    },
    async publicCatalog() {
      const { data, error } = await sb.rpc('vezlio_public_catalog');
      dbError(error);
      return data;
    },
    async list(kind) {
      const records = [], size = 500;
      for (let offset = 0; ; offset += size) {
        let query = sb.from(tables[kind]).select('*').order(kind === 'contacts' ? 'updated_at' : 'created_at', { ascending: true });
        if (kind !== 'contacts') query = query.order('id', { ascending: true });
        const { data, error } = await query.range(offset, offset + size - 1);
        dbError(error);
        records.push(...data);
        if (data.length < size) return records;
      }
    },
    async insert(kind, values) {
      const { data, error } = await sb.from(tables[kind]).insert(values).select('*').single();
      dbError(error); return data;
    },
    async update(kind, id, updatedAt, values) {
      let query = sb.from(tables[kind]).update(values);
      query = kind === 'contacts' ? query.eq('singleton', true) : query.eq('id', id);
      const { data, error } = await query.eq('updated_at', updatedAt).select('*');
      dbError(error);
      if (!data?.length) fail(409, 'record_changed', 'This record changed or was removed. Reload before editing again.');
      return data[0];
    },
    async remove(kind, id, updatedAt) {
      const { data, error } = await sb.from(tables[kind]).delete().eq('id', id).eq('updated_at', updatedAt).select('id');
      dbError(error);
      if (!data?.length) fail(409, 'record_changed', 'This record changed or was removed. Reload before deleting again.');
    }
  };
}
