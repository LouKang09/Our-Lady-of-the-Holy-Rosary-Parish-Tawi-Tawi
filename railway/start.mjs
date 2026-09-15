import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import fs from 'node:fs/promises';
import worker from '../dist/server/index.js';
import {openDatabase,openPhotoStorage} from './storage.mjs';
import {createAuth} from './auth.mjs';
export function createParishServer(config){
 const DB=openDatabase(config.dataDir),BUCKET=openPhotoStorage(config.dataDir),auth=createAuth(DB,config);const env={DB,BUCKET,ADMIN_EMAIL:config.email,AUTH_MODE:'password'};
 const server=http.createServer(async(req,res)=>{
  try{
   if(!req.url.startsWith('/')||req.url.startsWith('//')){res.writeHead(400).end();return;}
   const headers=new Headers();for(const [key,value] of Object.entries(req.headers)){if(key.startsWith('oai-')||['host','connection','transfer-encoding'].includes(key))continue;if(value)headers.set(key,Array.isArray(value)?value.join(', '):value);}
   let rawBody;
   if(!['GET','HEAD'].includes(req.method)){const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>8*1024*1024+1000){res.writeHead(413,{'content-type':'application/json'}).end(JSON.stringify({error:'The upload is too large.'}));return;}chunks.push(chunk);}rawBody=Buffer.concat(chunks);}
   let request=new Request(config.origin+req.url,{method:req.method,headers,body:rawBody});const account=auth.user(request);
   if(account){headers.set('oai-authenticated-user-id',account.id);headers.set('oai-authenticated-user-email',account.email);request=new Request(config.origin+req.url,{method:req.method,headers,body:rawBody});}
   const pathname=new URL(request.url).pathname;let response;
   if(pathname.startsWith('/api/auth/'))response=await auth.handle(request,req.socket.remoteAddress);
   else if(['/admin/login','/admin/setup','/admin/logout'].includes(pathname)||(['/admin','/admin/','/admin.html'].includes(pathname)&&!account)){
    if(account&&pathname==='/admin/login')response=Response.redirect(config.origin+'/admin',303);else response=new Response(await fs.readFile('public/login.html'),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
   }else response=await worker.fetch(request,env);
   const out=Object.fromEntries(response.headers);out['x-content-type-options']='nosniff';out['referrer-policy']='no-referrer';out['cache-control']=response.headers.get('cache-control')||'no-store';res.writeHead(response.status,out);if(req.method==='HEAD'||!response.body)res.end();else Readable.fromWeb(response.body).pipe(res);
  }catch(error){console.error('Parish server error',error.message);if(!res.headersSent)res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'Service temporarily unavailable. Please try again.'}));}
 });
 return {server,DB,close:()=>new Promise(resolve=>server.close(()=>{DB.sqlite.close();resolve();}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||3000),origin=process.env.PUBLIC_URL||(process.env.RAILWAY_PUBLIC_DOMAIN?'https://'+process.env.RAILWAY_PUBLIC_DOMAIN:`http://localhost:${port}`),email=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
 if(!email)throw new Error('Set ADMIN_EMAIL before starting.');if(process.env.NODE_ENV==='production'&&!origin.startsWith('https://'))throw new Error('Set PUBLIC_URL to the public HTTPS Railway URL.');
 if(process.env.RAILWAY_PROJECT_ID&&process.env.RAILWAY_VOLUME_MOUNT_PATH!==process.env.DATA_DIR)throw new Error('Attach a Railway volume and set DATA_DIR to its mount path.');
 if(process.env.NODE_ENV==='production'&&!process.env.DATA_DIR)throw new Error('Mount a persistent volume and set DATA_DIR before starting.');
 const app=createParishServer({origin,email,setupToken:process.env.ADMIN_SETUP_TOKEN||'',dataDir:process.env.DATA_DIR||'./.local-data'});app.server.listen(port,'0.0.0.0',()=>console.log('Parish server listening on port '+port));process.on('SIGTERM',()=>app.close().then(()=>process.exit(0)));
}
