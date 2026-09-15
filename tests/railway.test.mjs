import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createParishServer} from '../railway/start.mjs';
test('Railway login, setup, header-spoof protection, password change and persistent uploads work over HTTP',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'parish-auth-'));
 const config={origin:'https://parish.example',email:'owner@example.com',setupToken:'test-only-setup-token-32-characters-long',dataDir};
 let app=createParishServer(config);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));let base='http://127.0.0.1:'+app.server.address().port;
 async function request(route,method='GET',body,token='',extra={}){const response=await fetch(base+route,{method,headers:{...(method==='GET'?{}:{origin:config.origin,'x-parish-request':'1','content-type':'application/json'}),...(token?{cookie:token}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});const value=response.headers.get('content-type')?.includes('json')?await response.json():await response.text();return {status:response.status,value,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};}
 try{
  const login=await request('/admin');assert.equal(login.status,200);assert.match(login.value,/Admin email/);assert.ok(!login.value.includes('Sign in with ChatGPT'));
  assert.equal((await request('/api/admin/session','GET',undefined,'',{'oai-authenticated-user-id':'fake-owner','oai-authenticated-user-email':config.email})).status,401);
  assert.equal((await request('/api/auth/setup','POST',{token:'wrong',email:config.email,password:'initial test password!'})).status,403);
  const setup=await request('/api/auth/setup','POST',{token:config.setupToken,email:config.email,password:'initial test password!'});assert.equal(setup.status,201);assert.match(setup.headers.get('set-cookie'),/HttpOnly/);assert.match(setup.headers.get('set-cookie'),/Secure/);const cookie=setup.cookie;
  assert.equal((await request('/api/auth/setup','POST',{token:config.setupToken,email:config.email,password:'another test password!'})).status,409);
  assert.equal((await request('/api/admin/session','GET',undefined,cookie)).value.authMode,'password');
  assert.equal((await request('/api/auth/login','POST',{email:config.email,password:'incorrect'})).status,401);
  const second=await request('/api/auth/login','POST',{email:config.email,password:'initial test password!'});assert.equal(second.status,200);
  const photoBytes=fs.readFileSync('public/assets/rosary.jpg');const uploaded=await fetch(base+'/api/admin/media?filename=rosary.jpg&alt=Parish%20photo',{method:'POST',headers:{origin:config.origin,'x-parish-request':'1',cookie},body:photoBytes});assert.equal(uploaded.status,201);const photo=await uploaded.json();
  const profile={kind:'person',title:'Test choir member',body:'Integration test',images:[photo.id],status:'published',data:{group:'choir',role:'Choir member',terms:[{role:'Choir member',startYear:2020,endYear:null,current:true,notes:''}]}};
  assert.equal((await request('/api/admin/content','POST',profile,cookie)).status,201);
  const changed=await request('/api/auth/password','POST',{currentPassword:'initial test password!',newPassword:'replacement test password!'},cookie);assert.equal(changed.status,200);assert.equal((await request('/api/admin/session','GET',undefined,second.cookie)).status,401);
  assert.equal((await request('/api/auth/login','POST',{email:config.email,password:'initial test password!'})).status,401);
  await app.close();app=createParishServer(config);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;
  const after=await request('/api/auth/login','POST',{email:config.email,password:'replacement test password!'});assert.equal(after.status,200);
  assert.equal((await request('/api/public/records?kind=person&group=choir')).value.count,1);
  const photoAfter=await fetch(base+'/media/'+photo.id);assert.equal(photoAfter.status,200);assert.equal((await photoAfter.arrayBuffer()).byteLength,photoBytes.length);
  assert.equal((await request('/api/auth/logout','POST',{},after.cookie)).status,200);assert.equal((await request('/api/admin/session','GET',undefined,after.cookie)).status,401);
 }finally{await app.close();fs.rmSync(dataDir,{recursive:true,force:true});}
});
