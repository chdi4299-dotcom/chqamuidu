import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createHandler } from '../server/handler.mjs';
const port=Number(process.env.PORT || 8888);
const handler=createHandler();
const allowed=new Set(['index.html','styles.css','app.js','config.js','favicon.svg','admin.js','admin.css']);
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml'};
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://localhost:${port}`);
    if(url.pathname==='/admin'||url.pathname.startsWith('/admin/')||url.pathname.startsWith('/api/')){
      const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
      const response=await handler(request);
      res.statusCode=response.status;
      for(const [key,value] of response.headers){if(key!=='set-cookie')res.setHeader(key,value);}
      const cookieHeaders=response.headers.getSetCookie();if(cookieHeaders.length)res.setHeader('Set-Cookie',cookieHeaders);
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!['GET','HEAD'].includes(req.method)||!allowed.has(file)){res.statusCode=404;return res.end('Not found');}
    const body=await readFile(new URL('../'+file,import.meta.url));
    res.setHeader('Content-Type',types[file.split('.').pop()]);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.statusCode=500;res.end('Local preview unavailable.');}
}).listen(port,'127.0.0.1',()=>console.log(`Local storefront: http://localhost:${port} · owner access: /admin (requires your Supabase setup). No public deployment.`));
