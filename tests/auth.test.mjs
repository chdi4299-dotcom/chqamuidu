import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync,sign,randomUUID } from 'node:crypto';
import { createAuth,createStore } from '../server/supabase.mjs';
import { loadConfig } from '../server/config.mjs';
import { env,OWNER,CUSTOMER,FACTOR,ID } from './helpers.mjs';
const cfg=loadConfig(env);
function signedFixture(changes={}) {
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'}),kid=randomUUID();
 const jwk={...publicKey.export({format:'jwk'}),kid,alg:'ES256',use:'sig'};
 const c={sub:OWNER,iss:cfg.supabaseUrl+'/auth/v1',aud:'authenticated',role:'authenticated',aal:'aal2',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+900,...changes};
 const head=Buffer.from(JSON.stringify({alg:'ES256',typ:'JWT',kid})).toString('base64url');const payload=Buffer.from(JSON.stringify(c)).toString('base64url');const input=head+'.'+payload;
 return {token:input+'.'+sign('sha256',Buffer.from(input),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url'),jwk};
}
function transport(fixture,userId=OWNER){const calls=[];return {calls,fetch:async(input,init)=>{const url=String(input);calls.push({url,init});if(url.endsWith('/.well-known/jwks.json'))return Response.json({keys:[fixture.jwk]});if(url.endsWith('/user'))return Response.json({id:userId,factors:[{id:FACTOR,status:'verified',factor_type:'totp'}]});return Response.json({error:'unsupported test request'},{status:400});}};}
test('real SDK verifies ES256 signature and performs network-backed user verification',async()=>{
 const fixture=signedFixture(),network=transport(fixture);const verified=await createAuth(cfg,network.fetch).verify(fixture.token);assert.equal(verified.user.id,OWNER);assert.equal(verified.claims.aal,'aal2');assert.ok(network.calls.some(x=>x.url.endsWith('/user')));
});
test('forged JWT payload/signature is rejected before any account request',async()=>{
 const fixture=signedFixture(),network=transport(fixture);const [header,payload,signature]=fixture.token.split('.');const claims=JSON.parse(Buffer.from(payload,'base64url'));claims.sub=CUSTOMER;const forged=header+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.'+signature;
 await assert.rejects(()=>createAuth(cfg,network.fetch).verify(forged));assert.equal(network.calls.some(x=>x.url.endsWith('/user')),false);
});
for(const [label,changes,userId] of [['expired',{exp:1},OWNER],['wrong issuer',{iss:'https://attacker.test/auth/v1'},OWNER],['wrong audience',{aud:'service_role'},OWNER],['wrong role',{role:'service_role'},OWNER],['future issue',{iat:Math.floor(Date.now()/1000)+1000},OWNER],['old issue',{iat:Math.floor(Date.now()/1000)-4000},OWNER],['user mismatch',{},CUSTOMER]]){
 test(`verified signature alone is insufficient: ${label}`,async()=>{const fixture=signedFixture(changes),network=transport(fixture,userId);await assert.rejects(()=>createAuth(cfg,network.fetch).verify(fixture.token));});
}
test('removed user fails even when signed JWT has not expired',async()=>{
 const fixture=signedFixture(),network=transport(fixture);const original=network.fetch;network.fetch=(input,init)=>String(input).endsWith('/user')?Promise.resolve(Response.json({message:'User not found'},{status:401})):original(input,init);await assert.rejects(()=>createAuth(cfg,network.fetch).verify(fixture.token));
});
test('MFA uses bearer Auth API and returns no refresh token from its public result',async()=>{
 const requests=[];
 const auth=createAuth(cfg,async(input,init)=>{requests.push({url:String(input),init});if(String(input).endsWith('/challenge'))return Response.json({id:ID});if(String(input).endsWith('/verify'))return Response.json({access_token:'new-signed-token',refresh_token:'MUST_NOT_BE_RETURNED'});return Response.json({id:FACTOR,totp:{qr_code:'<svg/>',secret:'TEST_FIXTURE_ONLY'}});});
 assert.equal(await auth.challengeAndVerify('signed-fixture',FACTOR,'123456'),'new-signed-token');assert.equal(requests[0].init.headers.Authorization,'Bearer signed-fixture');assert.deepEqual(JSON.parse(requests[1].init.body),{challenge_id:ID,code:'123456'});
 assert.deepEqual(await auth.enroll('signed-fixture',[]),{factorId:FACTOR,qrCode:'<svg/>',secret:'TEST_FIXTURE_ONLY'});
 await assert.rejects(()=>auth.enroll('signed-fixture',[{id:FACTOR,status:'verified',factor_type:'totp'}]),e=>e.status===403);
});
test('database operations forward user JWT and publishable key, not a service-role credential',async()=>{
 const calls=[];const store=createStore(cfg,'fixture-user-jwt',async(input,init)=>{calls.push({url:String(input),headers:new Headers(init.headers)});return Response.json(true);});await store.assertOwner();assert.equal(calls[0].headers.get('authorization'),'Bearer fixture-user-jwt');assert.equal(calls[0].headers.get('apikey'),cfg.key);
});

test('an explicitly banned account is denied despite a current signed token',async()=>{
 const fixture=signedFixture(),network=transport(fixture),original=network.fetch;
 network.fetch=(input,init)=>String(input).endsWith('/user')?Promise.resolve(Response.json({id:OWNER,banned_until:new Date(Date.now()+60000).toISOString()})):original(input,init);
 await assert.rejects(()=>createAuth(cfg,network.fetch).verify(fixture.token));
});
