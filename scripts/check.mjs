import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function walk(path) {
  const entries = await readdir(path,{withFileTypes:true}); const result=[];
  for (const entry of entries) {
    if (['node_modules','.git','dist','.netlify','test-results'].includes(entry.name)) continue;
    const file=`${path}/${entry.name}`;
    if(entry.isDirectory())result.push(...await walk(file));else result.push(file);
  }
  return result;
}
let errors=0;
for (const file of await walk('.')) {
  if (/\.(mjs|js)$/.test(file)) {
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    if(result.status!==0){console.error(result.stderr);errors++;}
  }
  if (/\.(html|css|js|mjs|sql|toml|md)$/.test(file) && !file.startsWith('./tests/')) {
    const text=await readFile(file,'utf8');
    if(/sb_secret_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/.test(text)){console.error(`Possible embedded credential in ${file}`);errors++;}
  }
}
if(errors)process.exit(1);
console.log('JavaScript syntax and embedded-credential checks passed.');
