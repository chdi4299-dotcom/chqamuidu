import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../server/config.mjs';
import { createAuth } from '../server/supabase.mjs';
// Opt-in only, against a DISPOSABLE configured Supabase project. Never run on production.
const enabled=process.env.VEZLIO_TEST_DISPOSABLE==='YES_I_AM_USING_A_DISPOSABLE_PROJECT';
test('live Supabase owner/MFA and direct Data API denial', {skip:enabled?false:'Live project and ephemeral test sessions have not been configured.'}, async()=>{
 const cfg=loadConfig(process.env);
 const tokens={owner:process.env.SUPABASE_TEST_OWNER_AAL2_JWT,owner1:process.env.SUPABASE_TEST_OWNER_AAL1_JWT,customer:process.env.SUPABASE_TEST_CUSTOMER_AAL2_JWT};
 for(const [name,value] of Object.entries(tokens))assert.ok(value,`Missing ${name} test session; do not paste session tokens into chat.`);
 const auth=createAuth(cfg);
 const verified=await Promise.all(Object.values(tokens).map(token=>auth.verify(token)));
 assert.equal(verified[0].user.id,cfg.owner);assert.equal(verified[0].claims.aal,'aal2');
 assert.ok(verified[0].user.factors.some(f=>f.factor_type==='totp'&&f.status==='verified'));
 assert.equal(verified[1].user.id,cfg.owner);assert.equal(verified[1].claims.aal,'aal1');
 assert.notEqual(verified[2].user.id,cfg.owner);assert.equal(verified[2].claims.aal,'aal2');
 const db=token=>createClient(cfg.supabaseUrl,cfg.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:token?{Authorization:`Bearer ${token}`}:{}}});
 const owner=db(tokens.owner),fixtures=[];
 async function create(table,values){const {data,error}=await owner.from(table).insert(values).select('*').single();assert.equal(error,null,'Owner fixture creation failed; check migration/owner setup.');fixtures.push([table,data.id]);return data;}
 try{
  const access=await owner.rpc('vezlio_is_owner');assert.equal(access.error,null);assert.equal(access.data,true);
  const product=await create('vezlio_products',{name:'SECURITY TEST ONLY — unpublished fixture',category:'Other',description:'Disposable-project authorization test. Not an offer.',published:false});
  const pack=await create('vezlio_packages',{product_id:product.id,name:'SECURITY TEST ONLY',published:false});
  const service=await create('vezlio_services',{service_code:'TEST-'+randomUUID().slice(0,8).toUpperCase(),platform:'YouTube',name:'SECURITY TEST ONLY',method:'content_strategy',description:'Disposable-project test. Not an offer.',published:false});
  for(const token of [undefined,tokens.owner1,tokens.customer]){
   const client=db(token),anonymous=!token;
   const check=await client.rpc('vezlio_is_owner');assert.equal(check.data,false);
   for(const [table,id] of [['vezlio_products',product.id],['vezlio_packages',pack.id],['vezlio_services',service.id]]){
    const read=await client.from(table).select('*').eq('id',id);
    if(anonymous)assert.ok(read.error);else{assert.equal(read.error,null);assert.deepEqual(read.data,[]);}
    const update=await client.from(table).update({name:'ATTEMPTED UNAUTHORIZED CHANGE'}).eq('id',id).select('id');
    assert.ok(update.error||update.data.length===0);
    const remove=await client.from(table).delete().eq('id',id).select('id');assert.ok(remove.error||remove.data.length===0);
   }
   const contacts=await client.from('vezlio_contact_settings').select('*');assert.ok(contacts.error||contacts.data.length===0);
   const contactUpdate=await client.from('vezlio_contact_settings').update({support_note:'UNAUTHORIZED TEST'}).eq('singleton',true).select('singleton');assert.ok(contactUpdate.error||contactUpdate.data.length===0);
   const insert=await client.from('vezlio_products').insert({name:'UNAUTHORIZED TEST',category:'Other',description:'This must fail.'});assert.ok(insert.error);
   const publicData=await client.rpc('vezlio_public_catalog');assert.equal(publicData.error,null);assert.ok(!JSON.stringify(publicData.data).includes(product.id));
  }
 }finally{
  for(const [table,id] of fixtures.reverse()){const result=await owner.from(table).delete().eq('id',id);assert.equal(result.error,null,'Test fixture cleanup failed. Remove the unpublished SECURITY TEST records using the owner account.');}
 }
});
