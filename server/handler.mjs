import { loadConfig } from './config.mjs';
import { HttpError, fail } from './errors.mjs';
import { cookieNames, cookies, securityHeaders, assertSameOrigin, assertMutation, readJson, issueCsrf, storeSession, clearSession } from './security.mjs';
import { createAuth, createStore } from './supabase.mjs';
import { keys, recordId, version, validateRecord, loginInput } from './validation.mjs';
import { loginPage, mfaPage, dashboardPage, unavailablePage, forbiddenPage } from './views.mjs';

export function createHandler({ env = process.env, authFactory = createAuth, storeFactory = createStore } = {}) {
  return async function handler(request) {
    const url = new URL(request.url), path = url.pathname.replace(/\/$/, '') || '/';
    const isPage = path === '/admin' || path.startsWith('/admin/');
    const headers = securityHeaders(path !== '/api/catalog');
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    const html = (body, status = 200) => { headers.set('Content-Type','text/html; charset=utf-8'); return new Response(body, { status, headers }); };
    const redirect = location => { headers.set('Location', location); return new Response(null, { status: 303, headers }); };
    let cfg;
    try {
      if (!isPage && path !== '/api/catalog' && !path.startsWith('/api/admin/') && !path.startsWith('/api/auth/')) fail(404,'not_found','Not found.');
      cfg = loadConfig(env);
      if (cfg.secure) headers.set('Strict-Transport-Security','max-age=31536000');
      if (url.origin !== cfg.origin) fail(403, 'wrong_host', 'Use the configured canonical website address.');
      if (isPage && request.method !== 'GET') fail(405,'method_not_allowed','Method not allowed.');
      if (!isPage) assertSameOrigin(request,cfg);
      if (!['GET','POST','PATCH','DELETE'].includes(request.method)) fail(405,'method_not_allowed','Method not allowed.');
      const auth = authFactory(cfg);
      const token = cookies(request)[cookieNames(cfg).session];
      async function owner(requireMfa = true, candidate = token) {
        if (!candidate) fail(401,'sign_in_required','Sign in to continue.');
        const verified = await auth.verify(candidate);
        if (verified.user.id.toLowerCase() !== cfg.owner || verified.claims.sub.toLowerCase() !== cfg.owner) fail(403,'owner_only','This account is not authorized.');
        if (requireMfa && (verified.claims.aal !== 'aal2' || !(verified.user.factors || []).some(f => f.factor_type === 'totp' && f.status === 'verified'))) fail(403,'mfa_required','Verify your authenticator to continue.');
        return verified;
      }
      async function authorizedStore(candidate = token) {
        const verified = await owner(true,candidate);
        const store = storeFactory(cfg,verified.token);
        await store.assertOwner(); // DB designation + aal2; no data operation before this check.
        return { store, verified };
      }
      if (path === '/api/catalog' && request.method === 'GET') return json(await storeFactory(cfg).publicCatalog());
      if (path === '/admin/login') {
        issueCsrf(request,headers,cfg);
        return html(loginPage());
      }
      if (path === '/admin/mfa') {
        try { await owner(false); } catch (e) { if (e.status === 401) return redirect('/admin/login'); throw e; }
        issueCsrf(request,headers,cfg);
        return html(mfaPage());
      }
      if (path === '/admin') {
        try { await authorizedStore(); }
        catch (e) {
          if (e.status === 401) return redirect('/admin/login');
          if (e.code === 'mfa_required') return redirect('/admin/mfa');
          throw e;
        }
        issueCsrf(request,headers,cfg);
        return html(dashboardPage());
      }
      if (isPage) fail(404,'not_found','Not found.');
      if (path === '/api/auth/session' && request.method === 'GET') {
        const csrf = issueCsrf(request,headers,cfg);
        if (!token) return json({ state:'anonymous', csrf });
        try {
          const verified = await owner(false);
          const factors = (verified.user.factors || []).filter(f => f.factor_type === 'totp' && f.status === 'verified').map(f => ({ id:f.id, name:f.friendly_name || 'Authenticator' }));
          if (verified.claims.aal === 'aal2' && factors.length) {
            await storeFactory(cfg,verified.token).assertOwner();
            return json({ state:'authenticated', csrf, factors });
          }
          return json({ state:'mfa_required', csrf, factors, enrollmentAllowed: !(verified.user.factors || []).some(f => f.status === 'verified') });
        } catch (e) {
          if (e.status !== 401) throw e;
          clearSession(headers,cfg); return json({ state:'anonymous',csrf });
        }
      }
      if (path.startsWith('/api/auth/') && request.method === 'POST') {
        assertMutation(request,cfg);
        const data = await readJson(request);
        if (path === '/api/auth/login') {
          const credentials = loginInput(data);
          const access = await auth.signIn(credentials.email,credentials.password);
          let verified;
          try { verified = await owner(false,access); }
          catch (e) { await auth.signOut(access).catch(()=>{}); clearSession(headers,cfg); throw e; }
          storeSession(headers,cfg,verified);
          // Always pass through the MFA screen; it redirects only after verified aal2.
          return json({ next:'/admin/mfa' });
        }
        if (path === '/api/auth/logout') {
          keys(data,[]);
          clearSession(headers,cfg);
          if (token) {
            try { await owner(false); await auth.signOut(token); } catch { /* Expired sessions are still cleared. */ }
          }
          return json({ next:'/admin/login' });
        }
        if (path === '/api/auth/mfa/enroll') {
          keys(data,[]);
          const verified = await owner(false);
          if ((verified.user.factors || []).some(f => f.status === 'verified')) fail(403,'factor_exists','Use the existing authenticator; factor replacement requires recovery.');
          return json(await auth.enroll(verified.token, verified.user.factors || []));
        }
        if (path === '/api/auth/mfa/verify') {
          keys(data,['factorId','code']);
          const verified = await owner(false);
          const factorId = recordId(data.factorId);
          if (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code)) fail(400,'invalid_code','Enter the 6-digit authenticator code.');
          const factors = verified.user.factors || [];
          const hasVerified = factors.some(f => f.status === 'verified');
          const factor = factors.find(f => f.id === factorId && f.factor_type === 'totp');
          if (!factor || (hasVerified && factor.status !== 'verified')) fail(403,'invalid_factor','Use your enrolled authenticator.');
          const access = await auth.challengeAndVerify(verified.token,factorId,data.code);
          const result = await authorizedStore(access);
          storeSession(headers,cfg,result.verified);
          return json({ next:'/admin' });
        }
        fail(404,'not_found','Not found.');
      }
      const match = path.match(/^\/api\/admin\/(products|packages|services|contacts)(?:\/([0-9a-f-]+))?$/i);
      if (match) {
        const kind = match[1].toLowerCase(), id = match[2];
        const {store} = await authorizedStore(); // Runs for every read/create/update/delete.
        if (request.method === 'GET' && !id) return json({ records:await store.list(kind) });
        assertMutation(request,cfg);
        const data = await readJson(request);
        if (request.method === 'POST' && !id && kind !== 'contacts') return json({record:await store.insert(kind,validateRecord(kind,data))},201);
        if (request.method === 'PATCH' && (id || kind === 'contacts')) {
          if (kind === 'contacts' && id) fail(404,'not_found','Not found.');
          keys(data,['updated_at','values']);
          if (!data.values || typeof data.values !== 'object' || Array.isArray(data.values)) fail(400,'invalid_input','Record values must be an object.');
          const values = validateRecord(kind,data.values);
          return json({record:await store.update(kind,kind === 'contacts' ? null : recordId(id),version(data.updated_at),values)});
        }
        if (request.method === 'DELETE' && id && kind !== 'contacts') {
          keys(data,['updated_at']);
          await store.remove(kind,recordId(id),version(data.updated_at));
          return json({deleted:true});
        }
        fail(405,'method_not_allowed','Method not allowed.');
      }
      fail(404,'not_found','Not found.');
    } catch (error) {
      const known = error instanceof HttpError;
      const status = known ? error.status : 502;
      const code = known ? error.code : 'upstream_unavailable';
      const message = known ? error.message : 'The authentication or database service is unavailable. Try again later.';
      // No raw exception, token, password, OTP or SQL detail is returned or logged.
      if (isPage) {
        if (status === 503) return html(unavailablePage(),503);
        if (status === 403) return html(forbiddenPage(),403);
        return html('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VEZLIO</title><p>Owner workspace unavailable. <a href="/">Return to storefront</a>.</p></html>',status);
      }
      return json({error:{code,message}},status);
    }
  };
}
