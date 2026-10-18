import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../server/handler.mjs';
import { harness,request,product,ID,FACTOR,timestamp,env,CUSTOMER,identity } from './helpers.mjs';
import { HttpError } from '../server/errors.mjs';

for(const token of [undefined,'customer1','customer2','owner1','ownerNoFactor','forged']){
  for(const kind of ['products','packages','services','contacts']){
    test(`${token||'anonymous'} cannot read or mutate ${kind}`,async()=>{
      const h=harness(),run=createHandler(h.options);
      for(const [method,path,body] of [['GET','/api/admin/'+kind,undefined],['POST','/api/admin/'+kind,product],['PATCH','/api/admin/'+kind+'/'+ID,{updated_at:timestamp,values:product}],['DELETE','/api/admin/'+kind+'/'+ID,{updated_at:timestamp}]]){
        const response=await run(request(path,{token,method,body,extra:{'X-Admin':'true','X-User-ID':env.SUPABASE_OWNER_UUID,'X-AAL':'aal2'}}));
        assert.ok([401,403].includes(response.status),`${method} returned ${response.status}`);
      }
      assert.equal(h.calls.some(c=>['list','insert','update','remove','assertOwner'].includes(c[0])),false);
    });
  }
}
test('protected dashboard is served only after both server and database checks',async()=>{
 const h=harness(),run=createHandler(h.options);
 assert.equal((await run(request('/admin'))).headers.get('location'),'/admin/login');
 assert.equal((await run(request('/admin',{token:'owner1'}))).headers.get('location'),'/admin/mfa');
 assert.equal((await run(request('/admin',{token:'customer2'}))).status,403);
 const response=await run(request('/admin',{token:'owner2'}));
 assert.equal(response.status,200);assert.match(await response.text(),/id="productForm"/);assert.deepEqual(h.calls.slice(-2).map(c=>c[0]),['verify','assertOwner']);
 assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal((await run(request('/admin/dashboard.html'))).status,404);
});
test('each owner CRUD request repeats server verification and database designation check',async()=>{
 const h=harness(),run=createHandler(h.options);
 for(const [method,path,body] of [['GET','/api/admin/products'],['POST','/api/admin/products',product],['PATCH','/api/admin/products/'+ID,{updated_at:timestamp,values:product}],['DELETE','/api/admin/products/'+ID,{updated_at:timestamp}]]){
  h.calls.length=0;const response=await run(request(path,{method,body,token:'owner2'}));assert.ok(response.ok,await response.text());assert.deepEqual(h.calls.slice(0,2).map(c=>c[0]),['verify','assertOwner']);
 }
});
test('database owner mismatch blocks even a valid server owner',async()=>{
 const h=harness();h.store.assertOwner=async()=>{throw new HttpError(403,'owner_not_designated','Denied');};
 const response=await createHandler(h.options)(request('/api/admin/products',{token:'owner2'}));assert.equal(response.status,403);assert.equal(h.calls.some(c=>c[0]==='list'),false);
});
test('subject mismatch, missing MFA factor, and metadata do not grant access',async()=>{
 const h=harness();h.identities.owner2.claims.sub=CUSTOMER;
 const response=await createHandler(h.options)(request('/api/admin/products',{token:'owner2'}));assert.equal(response.status,403);assert.equal(h.calls.some(c=>c[0]==='list'),false);
});
test('same-origin CSRF is mandatory, including login',async()=>{
 for(const [csrf,origin] of [['',env.SITE_ORIGIN],['b'.repeat(64),env.SITE_ORIGIN],['a'.repeat(64),'https://attacker.test'],['a'.repeat(64),'null']]){
  const h=harness();const response=await createHandler(h.options)(request('/api/admin/products',{token:'owner2',method:'POST',body:product,csrf,origin}));assert.equal(response.status,403);assert.equal(h.calls.some(c=>c[0]==='insert'),false);
  assert.equal((await createHandler(h.options)(request('/api/auth/login',{method:'POST',body:{email:'test@example.test',password:'fixture'},csrf,origin}))).status,403);
 }
});
test('client cannot set role, owner UUID, IDs, timestamps or unsupported fields',async()=>{
 for(const extra of [{role:'admin'},{user_metadata:{role:'admin'}},{owner_uuid:env.SUPABASE_OWNER_UUID},{id:ID},{updated_at:timestamp},{published:true,legitimacy_confirmed:false}]){
  const h=harness();const response=await createHandler(h.options)(request('/api/admin/products',{token:'owner2',method:'POST',body:{...product,...extra}}));assert.equal(response.status,400);assert.equal(h.calls.some(c=>c[0]==='insert'),false);
 }
});
test('TOTP setup is for the designated owner without an existing verified factor only',async()=>{
 const h=harness(),run=createHandler(h.options);
 assert.equal((await run(request('/api/auth/mfa/enroll',{token:'customer2',method:'POST',body:{}}))).status,403);
 assert.equal((await run(request('/api/auth/mfa/enroll',{token:'owner1',method:'POST',body:{}}))).status,403);
 const response=await run(request('/api/auth/mfa/enroll',{token:'setup',method:'POST',body:{}}));assert.equal(response.status,200);assert.equal((await response.json()).factorId,FACTOR);
});
test('MFA verification checks factor ownership, validates the upgraded token, then issues HttpOnly cookie',async()=>{
 const h=harness(),run=createHandler(h.options);
 assert.equal((await run(request('/api/auth/mfa/verify',{token:'owner1',method:'POST',body:{factorId:ID,code:'123456'}}))).status,403);
 const response=await run(request('/api/auth/mfa/verify',{token:'owner1',method:'POST',body:{factorId:FACTOR,code:'123456'}}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{next:'/admin'});
 const set=response.headers.get('set-cookie');assert.match(set,/__Host-vezlio_session=owner2/);assert.match(set,/HttpOnly; SameSite=Strict/);assert.match(set,/Secure/);assert.doesNotMatch(set,/refresh/i);
 h.auth.challengeAndVerify=async()=> 'customer2';assert.equal((await run(request('/api/auth/mfa/verify',{token:'owner1',method:'POST',body:{factorId:FACTOR,code:'123456'}}))).status,403);
});
test('customer password login never receives an owner cookie',async()=>{
 const h=harness();h.auth.signIn=async()=> 'customer2';
 const response=await createHandler(h.options)(request('/api/auth/login',{method:'POST',body:{email:'customer@example.test',password:'fixture'}}));assert.equal(response.status,403);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
});
test('logout clears session; no sign-up, orders, owner assignment or payment endpoints exist',async()=>{
 const run=createHandler(harness().options);
 const out=await run(request('/api/auth/logout',{token:'owner2',method:'POST',body:{}}));assert.equal(out.status,200);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
 for(const path of ['/api/admin/owner','/api/admin/orders','/api/payments','/api/auth/signup','/.netlify/functions/vezlio']) assert.equal((await run(request(path,{token:'owner2',method:'POST',body:{}}))).status,404);
});
test('configuration is fail-closed; secret/service-role keys are rejected',async()=>{
 for(const changed of [{SUPABASE_OWNER_UUID:''},{SUPABASE_PUBLISHABLE_KEY:'sb_secret_this_is_a_fixture_only'},{SITE_ORIGIN:'http://vezlio.test'},{SUPABASE_OWNER_UUID:'not-a-uuid'}]){
  const h=harness();h.options.env={...env,...changed};assert.equal((await createHandler(h.options)(request('/api/admin/products',{token:'owner2'}))).status,503);assert.equal(h.calls.length,0);
 }
});
test('public catalogue is the only anonymous data operation and cannot receive mutations',async()=>{
 const h=harness(),run=createHandler(h.options);
 const response=await run(request('/api/catalog'));assert.equal(response.status,200);assert.deepEqual(await response.json(),{products:[],services:[],contacts:{}});assert.deepEqual(h.calls,[]);
 assert.equal((await run(request('/api/catalog',{method:'POST',body:product}))).status,404);
});
test('cross-site reads, noncanonical hosts and oversized bodies are rejected',async()=>{
 const h=harness(),run=createHandler(h.options);
 assert.equal((await run(request('/api/auth/session',{extra:{'Sec-Fetch-Site':'cross-site'}}))).status,403);
 assert.equal((await run(new Request('https://attacker.test/admin/login'))).status,403);
 const response=await run(request('/api/admin/products',{token:'owner2',method:'POST',body:{...product,description:'x'.repeat(17000)}}));assert.equal(response.status,413);assert.equal(h.calls.some(c=>c[0]==='insert'),false);
});

test('credential forms fail safely before JavaScript initialization',async()=>{
 const response=await createHandler(harness().options)(request('/admin/login'));
 const html=await response.text();assert.match(html,/<form method="post" id="loginForm"/);assert.match(html,/<button class="primary" type="submit" disabled>/);
});
