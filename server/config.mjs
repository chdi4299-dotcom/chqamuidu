import { fail } from './errors.mjs';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function loadConfig(env) {
  const missing = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_OWNER_UUID', 'SITE_ORIGIN'].filter(k => !env[k]);
  if (missing.length) fail(503, 'not_configured', 'Owner access is not configured. Complete the server setup guide.');
  let base, origin;
  try { base = new URL(env.SUPABASE_URL); origin = new URL(env.SITE_ORIGIN); }
  catch { fail(503, 'not_configured', 'Invalid server URL configuration.'); }
  const localHosts = ['localhost', '127.0.0.1', '[::1]'];
  const local = env.VEZLIO_LOCAL_DEV === '1' && env.NETLIFY !== 'true' && env.NODE_ENV !== 'production' && localHosts.includes(origin.hostname);
  if (!UUID.test(env.SUPABASE_OWNER_UUID) || origin.origin !== env.SITE_ORIGIN || origin.username || origin.password ||
      base.username || base.password || base.search || base.hash || !['', '/'].includes(base.pathname) ||
      (!local && origin.protocol !== 'https:') ||
      (base.protocol !== 'https:' && !(local && base.protocol === 'http:' && localHosts.includes(base.hostname)))) {
    fail(503, 'not_configured', 'Invalid server security configuration.');
  }
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  // Reject secret/service-role keys instead of accidentally bypassing RLS.
  let legacyRole;
  try { legacyRole = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch {}
  if (!(key.startsWith('sb_publishable_') || legacyRole === 'anon')) {
    fail(503, 'not_configured', 'Use a Supabase publishable key (or legacy anon key), never a secret/service-role key.');
  }
  return Object.freeze({ supabaseUrl: base.origin, key, owner: env.SUPABASE_OWNER_UUID.toLowerCase(), origin: origin.origin, secure: !local });
}
