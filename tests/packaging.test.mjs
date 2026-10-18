import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp,copyFile,mkdir,writeFile,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const build=fileURLToPath(new URL('../scripts/build.mjs',import.meta.url));
test('hosted builds require explicit approval; branch/PR deploys remain blocked even with it',()=>{
 for(const flags of [{NETLIFY:'true',VEZLIO_ALLOW_NETLIFY_DEPLOY:''},{NETLIFY:'true',VEZLIO_ALLOW_NETLIFY_DEPLOY:'approved',CONTEXT:'branch-deploy'},{NETLIFY:'true',VEZLIO_ALLOW_NETLIFY_DEPLOY:'approved',CONTEXT:'deploy-preview'}]){
  const result=spawnSync(process.execPath,[build],{env:{...process.env,...flags},encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/locked|disabled/);
 }
});
test('publish output cannot expose server templates, migrations, environment files or tests',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'vezlio-package-'));
 const expected=['index.html','styles.css','app.js','config.js','favicon.svg','admin.js','admin.css'];
 try{
  for(const file of expected)await copyFile(new URL('../'+file,import.meta.url),join(temp,file));
  await mkdir(join(temp,'server'));await writeFile(join(temp,'server','views.mjs'),'SERVER_TEMPLATE_SENTINEL');await writeFile(join(temp,'.env'),'PRIVATE_ENV_SENTINEL');
  const result=spawnSync(process.execPath,[build],{cwd:temp,env:{...process.env,NETLIFY:'false'},encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.deepEqual((await readdir(join(temp,'dist'))).sort(),expected.sort());
 }finally{await rm(temp,{recursive:true,force:true});}
});
