import { HttpError } from '../server/errors.mjs';
export const OWNER='11111111-1111-4111-8111-111111111111';
export const CUSTOMER='22222222-2222-4222-8222-222222222222';
export const FACTOR='33333333-3333-4333-8333-333333333333';
export const ID='44444444-4444-4444-8444-444444444444';
export const CSRF='a'.repeat(64);
export const env={SUPABASE_URL:'https://fixture-project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_fixture_only',SUPABASE_OWNER_UUID:OWNER,SITE_ORIGIN:'https://vezlio.test'};
export const timestamp='2026-10-17T10:00:00.000000+00:00';
export const product={name:'Test fixture product',category:'Creative',description:'Synthetic test data only.',compatibility:null,authorization_notes:'Private fixture note',legitimacy_confirmed:true,published:false};
export function identity(id=OWNER,aal='aal2',factors=[{id:FACTOR,factor_type:'totp',status:'verified'}]) {return {token:'signed.test.token',claims:{sub:id,role:'authenticated',aal,exp:Math.floor(Date.now()/1000)+900},user:{id,factors,user_metadata:{role:'admin',is_admin:true}}};}
export function harness() {
  const calls=[],identities={owner2:identity(),owner1:identity(OWNER,'aal1'),ownerNoFactor:identity(OWNER,'aal2',[]),setup:identity(OWNER,'aal1',[{id:FACTOR,factor_type:'totp',status:'unverified'}]),customer1:identity(CUSTOMER,'aal1'),customer2:identity(CUSTOMER,'aal2')};
  const auth={verify:async token=>{calls.push(['verify',token]);if(!identities[token])throw new HttpError(401,'sign_in_required','Invalid session.');return {...identities[token],token};},signIn:async()=> 'owner1',signOut:async token=>{calls.push(['signOut',token]);},enroll:async()=>({factorId:FACTOR,qrCode:'<svg/>',secret:'TEST_ONLY'}),challengeAndVerify:async()=> 'owner2'};
  const store={assertOwner:async()=>{calls.push(['assertOwner']);},publicCatalog:async()=>({products:[],services:[],contacts:{}}),list:async kind=>{calls.push(['list',kind]);return [];},insert:async(kind,data)=>{calls.push(['insert',kind,data]);return {id:ID,...data,updated_at:timestamp};},update:async(kind,id,at,data)=>{calls.push(['update',kind,id,at,data]);return {...data,id,updated_at:timestamp};},remove:async(kind,id)=>{calls.push(['remove',kind,id]);}};
  return {calls,auth,store,identities,options:{env,authFactory:()=>auth,storeFactory:()=>store}};
}
export function request(path,{token,method='GET',body,csrf=CSRF,origin=env.SITE_ORIGIN,extra={}}={}) {
  const cookie=[token?'__Host-vezlio_session='+token:'','__Host-vezlio_csrf='+CSRF].filter(Boolean).join('; ');
  return new Request(env.SITE_ORIGIN+path,{method,headers:{cookie,...(method==='GET'?{}:{'Content-Type':'application/json',Origin:origin,'X-VEZLIO-CSRF':csrf}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
