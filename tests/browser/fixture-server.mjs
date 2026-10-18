// Isolated browser-test transport only. Never imported by production code or copied to dist.
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createHandler } from '../../server/handler.mjs';
import { HttpError } from '../../server/errors.mjs';
import { OWNER,CUSTOMER,FACTOR,identity } from '../helpers.mjs';
const origin='http://127.0.0.1:8991';
const env={SUPABASE_URL:'https://test-only.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_browser_test_only',SUPABASE_OWNER_UUID:OWNER,SITE_ORIGIN:origin,VEZLIO_LOCAL_DEV:'1'};
let rows;let factorVerified;let counter=0;
const now=()=>new Date(Date.now()+counter++).toISOString();
function reset(){rows={products:[],packages:[],services:[],contacts:[{singleton:true,whatsapp_number:'94788245211',telegram_url:'https://t.me/VEZLIO',support_email:null,support_note:null,updated_at:now()}]};factorVerified=true;}
reset();
const access=level=>'fixture.'+level+'.token';
const auth={
 async verify(token){
  if(![access('aal1'),access('aal2'),access('customer')].includes(token))throw new HttpError(401,'sign_in_required','Sign in again.');
  const customer=token===access('customer');const aal=token===access('aal2')?'aal2':'aal1';
  const result=identity(customer?CUSTOMER:OWNER,aal,[{id:FACTOR,factor_type:'totp',status:factorVerified?'verified':'unverified'}]);result.token=token;return result;
 },
 async signIn(email,password){if(password!=='fixture password ')throw new HttpError(401,'sign_in_failed','Test credentials rejected.');return email==='owner@example.test'?access('aal1'):access('customer');},
 async signOut(){},
 async enroll(){return {factorId:FACTOR,qrCode:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0h100v100H0z" fill="white"/></svg>',secret:'TESTFIXTUREONLY'};},
 async challengeAndVerify(token,factorId,code){if(code!=='123456')throw new HttpError(400,'mfa_failed','Authenticator request failed. Check the code.');factorVerified=true;return access('aal2');}
};
function publicCatalog(){return {products:rows.products.filter(p=>p.published&&p.legitimacy_confirmed).map(({authorization_notes,legitimacy_confirmed,published,created_at,updated_at,...p})=>({...p,packages:rows.packages.filter(k=>k.product_id===p.id&&k.published).map(({created_at,updated_at,published,...k})=>k)})),services:rows.services.filter(s=>s.published&&s.legitimacy_confirmed).map(({compliance_notes,legitimacy_confirmed,published,created_at,updated_at,...s})=>s),contacts:{whatsappNumber:rows.contacts[0].whatsapp_number,telegramUrl:rows.contacts[0].telegram_url,supportEmail:rows.contacts[0].support_email,supportNote:rows.contacts[0].support_note}};}
const store={
 async assertOwner(){},async publicCatalog(){return publicCatalog();},async list(kind){return structuredClone(rows[kind]);},
 async insert(kind,data){const record={...data,id:randomUUID(),created_at:now(),updated_at:now()};rows[kind].push(record);return record;},
 async update(kind,id,at,data){const index=rows[kind].findIndex(x=>(kind==='contacts'||x.id===id)&&x.updated_at===at);if(index<0)throw new HttpError(409,'record_changed','This record changed. Reload it.');rows[kind][index]={...rows[kind][index],...data,updated_at:now()};return rows[kind][index];},
 async remove(kind,id,at){const item=rows[kind].find(x=>x.id===id&&x.updated_at===at);if(!item)throw new HttpError(409,'record_changed','This record changed.');rows[kind]=rows[kind].filter(x=>x.id!==id);if(kind==='products')rows.packages=rows.packages.filter(x=>x.product_id!==id);}
};
const handler=createHandler({env,authFactory:()=>auth,storeFactory:()=>store});
const files=new Set(['index.html','app.js','styles.css','config.js','favicon.svg','admin.js','admin.css']);
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__test/reset'&&req.method==='POST'){reset();res.end('Reset test fixtures');return;}
  if(url.pathname==='/__test/first-enrollment'&&req.method==='POST'){factorVerified=false;res.end('Fixture enrollment');return;}
  if(url.pathname==='/admin'||url.pathname.startsWith('/admin/')||url.pathname.startsWith('/api/')){
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});const response=await handler(request);res.statusCode=response.status;for(const [key,value] of response.headers)if(key!=='set-cookie')res.setHeader(key,value);const set=response.headers.getSetCookie();if(set.length)res.setHeader('Set-Cookie',set);res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!files.has(file)){res.statusCode=404;res.end('Not found');return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'text/html');res.setHeader('Cache-Control','no-store');res.end(await readFile(new URL('../../'+file,import.meta.url)));
 }catch{res.statusCode=500;res.end('Browser test fixture failed');}
}).listen(8991,'127.0.0.1',()=>console.log('Isolated browser test fixtures listening. Not a real Supabase backend.'));
