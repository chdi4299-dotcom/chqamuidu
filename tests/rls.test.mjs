import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { OWNER,CUSTOMER,ID } from './helpers.mjs';
// Real PostgreSQL engine (WASM). Only Supabase auth schema/JWT context is stubbed.
// These identities and catalogue rows are synthetic fixtures, never production seeds.
test('PostgreSQL RLS and public projection',async t=>{
 const db=new PGlite();
 await db.exec(`create role anon nologin; create role authenticated nologin;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
 grant usage on schema auth to anon,authenticated;
 grant execute on function auth.jwt(),auth.uid() to anon,authenticated;
 insert into auth.users values ('${OWNER}'),('${CUSTOMER}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/202610170001_owner_catalog.sql',import.meta.url),'utf8'));
 async function as(role,claims,fn){await db.exec(`set role ${role}`);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);try{return await fn();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");}}
 const claims=(id,aal='aal2')=>({sub:id,aal,role:'authenticated',user_metadata:{role:'admin',is_admin:true,owner_uuid:OWNER}});
 const query=async(sql,args=[])=> (await db.query(sql,args)).rows;
 try{
  await t.test('empty owner configuration fails closed; no fabricated catalogue or orders',async()=>{
   const data=await query('select * from public.vezlio_products');assert.equal(data.length,0);
   assert.equal((await query("select to_regclass('public.orders') as orders"))[0].orders,null);
   await as('authenticated',claims(OWNER),async()=>assert.equal((await query('select public.vezlio_is_owner() as ok'))[0].ok,false));
  });
  await db.query('insert into vezlio_private.owner_config values (true,$1)',[OWNER]);
  // Database-owner fixture creation permits testing hidden drafts and published projections.
  await db.query(`insert into public.vezlio_products(id,name,category,description,authorization_notes,legitimacy_confirmed,published)
   values ($1,'TEST ONLY published product','Creative','Synthetic description','SECRET INTERNAL FIXTURE NOTE',true,true)`,[ID]);
  await db.query(`insert into public.vezlio_products(name,category,description,authorization_notes) values ('TEST ONLY draft','Creative','Unpublished fixture','PRIVATE DRAFT')`);
  await db.query(`insert into public.vezlio_packages(product_id,name,price_lkr,published) values ($1,'TEST ONLY published plan',123.45,true),($1,'TEST ONLY draft plan',987.65,false)`,[ID]);
  await db.query(`insert into public.vezlio_services(service_code,platform,name,method,description,compliance_notes,legitimacy_confirmed,published)
   values ('TEST-PUBLIC','YouTube','TEST ONLY service','content_strategy','Synthetic service','PRIVATE COMPLIANCE NOTE',true,true),('TEST-DRAFT','TikTok','TEST ONLY draft service','content_strategy','Synthetic draft','PRIVATE DRAFT',false,false)`);
  const kinds=['products','packages','services','contact_settings'];
  for(const [label,role,context] of [['anonymous','anon',{}],['customer aal1','authenticated',claims(CUSTOMER,'aal1')],['customer aal2','authenticated',claims(CUSTOMER)],['owner aal1','authenticated',claims(OWNER,'aal1')]]){
   await t.test(`${label} cannot read or change protected tables even with admin metadata`,async()=>{
    await as(role,context,async()=>{
     assert.equal((await query('select public.vezlio_is_owner() as ok'))[0].ok,false);
     for(const kind of kinds){
      if(role==='anon')await assert.rejects(()=>query(`select * from public.vezlio_${kind}`),e=>e.code==='42501');
      else{assert.equal((await query(`select * from public.vezlio_${kind}`)).length,0);assert.equal((await query(`update public.vezlio_${kind} set updated_at=now() returning *`)).length,0);}
     }
     await assert.rejects(()=>query("insert into public.vezlio_products(name,category,description) values ('Attack','Creative','Not permitted')"),e=>e.code==='42501');
     await assert.rejects(()=>query("insert into public.vezlio_packages(product_id,name) values ($1,'Attack')",[ID]),e=>e.code==='42501');
     await assert.rejects(()=>query("insert into public.vezlio_services(service_code,platform,name,method,description) values ('ATTACK','YouTube','Attack','content_strategy','Not permitted')"),e=>e.code==='42501');
     if(role==='anon')await assert.rejects(()=>query('delete from public.vezlio_products returning id'),e=>e.code==='42501');
     else assert.equal((await query('delete from public.vezlio_products returning id')).length,0);
     await assert.rejects(()=>query("update vezlio_private.owner_config set auth_user_id=$1",[CUSTOMER]),e=>e.code==='42501');
     await assert.rejects(()=>query("create function public.escalate() returns boolean language sql as 'select true'"),e=>e.code==='42501');
    });
   });
  }
  await t.test('all tables have RLS, no anonymous direct grants, no owner-management function',async()=>{
   const rows=await query("select relname,relrowsecurity from pg_class where relname in ('vezlio_products','vezlio_packages','vezlio_services','vezlio_contact_settings','owner_config')");assert.equal(rows.length,5);assert.ok(rows.every(r=>r.relrowsecurity));
   const policies=await query("select * from pg_policies where tablename like 'vezlio_%'");assert.equal(policies.length,8);assert.ok(policies.every(p=>p.qual.includes('vezlio_is_owner')));assert.equal(policies.filter(p=>p.permissive==='RESTRICTIVE'&&p.roles.includes('public')).length,4);
   assert.equal((await query("select has_table_privilege('anon','public.vezlio_products','select') as ok"))[0].ok,false);
  });
  await t.test('restrictive owner/MFA guard survives an accidentally permissive customer policy',async()=>{
   await db.exec('create policy temporary_broad_test_policy on public.vezlio_products for all to authenticated using (true) with check (true)');
   try{
    await as('authenticated',claims(CUSTOMER),async()=>{assert.equal((await query('select * from public.vezlio_products')).length,0);await assert.rejects(()=>query("insert into public.vezlio_products(name,category,description) values ('Attack','Creative','Not permitted')"),e=>e.code==='42501');});
    await as('authenticated',claims(OWNER,'aal1'),async()=>assert.equal((await query('select * from public.vezlio_products')).length,0));
   }finally{await db.exec('drop policy temporary_broad_test_policy on public.vezlio_products');}
  });
  await t.test('public RPC returns reviewed published fields only, never notes, drafts or owner data',async()=>{
   await as('anon',{},async()=>{
    const catalog=(await query('select public.vezlio_public_catalog() as data'))[0].data;
    assert.equal(catalog.products.length,1);assert.equal(catalog.products[0].packages.length,1);assert.equal(catalog.products[0].packages[0].price_lkr,123.45);assert.equal(catalog.services.length,1);
    assert.equal(catalog.contacts.whatsappNumber,'94788245211');
    const serialized=JSON.stringify(catalog);assert.doesNotMatch(serialized,/SECRET|PRIVATE|TEST-DRAFT|authorization_notes|compliance_notes|legitimacy_confirmed|auth_user_id|updated_at/);assert.ok(!serialized.includes(OWNER));
   });
  });
  await t.test('only owner aal2 can perform CRUD without a service role',async()=>{
   await as('authenticated',claims(OWNER),async()=>{
    assert.equal((await query('select public.vezlio_is_owner() as ok'))[0].ok,true);
    assert.equal((await query('select * from public.vezlio_products')).length,2);
    const created=(await query("insert into public.vezlio_products(name,category,description) values ('Owner fixture','Creative','Synthetic') returning *"))[0];
    const updated=(await query("update public.vezlio_products set name='Owner edited fixture',updated_at='2000-01-01' where id=$1 returning *",[created.id]))[0];assert.equal(updated.name,'Owner edited fixture');assert.ok(new Date(updated.updated_at)>new Date('2000-01-01'));
    assert.equal((await query('delete from public.vezlio_products where id=$1 returning id',[created.id])).length,1);
    assert.equal((await query("update public.vezlio_contact_settings set support_note='TEST ONLY' returning *")).length,1);
    await assert.rejects(()=>query('delete from public.vezlio_contact_settings'),e=>e.code==='42501');
    await assert.rejects(()=>query('update vezlio_private.owner_config set auth_user_id=$1',[CUSTOMER]),e=>e.code==='42501');
   });
  });
  await t.test('database constraints prohibit unsupported methods, invalid money and unreviewed publication',async()=>{
   await as('authenticated',claims(OWNER),async()=>{
    await assert.rejects(()=>query("update public.vezlio_products set legitimacy_confirmed=false where id=$1",[ID]),e=>e.code==='23514');
    for(const value of [-1,'NaN',100000000])await assert.rejects(()=>query('update public.vezlio_packages set price_lkr=$1',[value]),e=>e.code==='23514');
    await assert.rejects(()=>query("update public.vezlio_services set method='fake_followers'"),e=>e.code==='23514');
    await assert.rejects(()=>query("update public.vezlio_contact_settings set telegram_url='https://attacker.test/'"),e=>e.code==='23514');
   });
  });
  await t.test('changing the one owner UUID immediately removes the prior DB authorization',async()=>{
   await db.query('update vezlio_private.owner_config set auth_user_id=$1',[CUSTOMER]);
   await as('authenticated',claims(OWNER),async()=>assert.equal((await query('select * from public.vezlio_products')).length,0));
   await as('authenticated',claims(CUSTOMER),async()=>assert.equal((await query('select * from public.vezlio_products')).length,2));
   await assert.rejects(()=>db.query('insert into vezlio_private.owner_config values(true,$1)',[OWNER]),e=>e.code==='23505');
  });
 }finally{await db.close();}
});
