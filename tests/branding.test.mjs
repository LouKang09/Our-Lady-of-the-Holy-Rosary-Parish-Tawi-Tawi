import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {parseHTML} from 'linkedom';
import {createParishServer} from '../railway/start.mjs';

test('Brand name and uploaded logo render immediately across public/admin pages; selected logo remains public and protected until reset',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'parish-brand-')),config={dataDir,origin:'https://parish.example',email:'owner@example.com',setupToken:'local-test-setup-token-32-characters'};
 const app=createParishServer(config);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;let cookie='';
 async function req(route,method='GET',body,authorized=true){const r=await fetch(base+route,{method,headers:{origin:config.origin,'x-parish-request':'1','content-type':'application/json',...(authorized&&cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,value:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};}
 try{
  const setup=await req('/api/auth/setup','POST',{email:config.email,token:config.setupToken,password:'local test password!'});assert.equal(setup.status,201);cookie=setup.headers.get('set-cookie').split(';')[0];
  const upload=await fetch(base+'/api/admin/media?filename=parish-logo.jpg&alt=Parish%20logo',{method:'POST',headers:{origin:config.origin,'x-parish-request':'1',cookie},body:fs.readFileSync('public/assets/rosary.jpg')});assert.equal(upload.status,201);const logo=await upload.json();assert.equal((await req('/media/'+logo.id,'GET',undefined,false)).status,404);
  const initial=(await req('/api/admin/settings')).value;
  assert.equal((await req('/api/admin/settings','PUT',{...initial,logoImage:'m_00000000-0000-4000-8000-000000000000'})).status,400);
  assert.equal((await req('/api/admin/settings','PUT',{...initial,logoImage:'javascript:alert(1)'})).status,400);
  const name='Our Lady of the Holy Rosary Parish — Tawi-Tawi & <community>';
  const saved=await req('/api/admin/settings','PUT',{...initial,parishName:name,logoImage:logo.id,copy:{copy_58:'Separate contact heading'}});assert.equal(saved.status,200);assert.equal((await req('/api/public/settings','GET',undefined,false)).value.logoImage,logo.id);
  assert.equal((await req('/media/'+logo.id,'GET',undefined,false)).status,200);
  for(const route of ['/','/blog','/events','/schedules','/collections','/people','/admin','/admin/login','/admin/setup']){
   const page=await req(route,'GET',undefined,route==='/admin');assert.equal(page.status,200,route);assert.equal(page.headers.get('cache-control'),'no-store');
   const {document}=parseHTML(page.value);const brands=document.querySelectorAll('.brand');assert.ok(brands.length,route);
   for(const brand of brands){assert.equal(brand.querySelector('[data-brand-name]').textContent,name,route+' name');assert.equal(brand.querySelector('.brand-mark').textContent,'',route+' no default cross');assert.equal(brand.querySelector('.brand-mark img').getAttribute('src'),'/media/'+logo.id,route+' initial logo');assert.equal(brand.querySelector('community'),null,'Name is escaped');assert.equal(brand.getAttribute('aria-label'),name+' home');}
   assert.equal(document.querySelector('link[rel="icon"]').getAttribute('href'),'/media/'+logo.id,route+' favicon');
  }
  assert.equal((await req('/api/admin/media/'+logo.id,'DELETE',{})).status,409);
  const changed=await req('/api/admin/settings','PUT',{...saved.value,officeHours:'Open weekdays'});assert.equal(changed.status,200);assert.equal(changed.value.logoImage,logo.id,'Unrelated edits retain logo');
  const reset=await req('/api/admin/settings','PUT',{...changed.value,logoImage:''});assert.equal(reset.status,200);const {document}=parseHTML((await req('/','GET',undefined,false)).value);assert.equal(document.querySelector('.brand-mark').textContent,'✝');assert.equal(document.querySelector('.brand-mark img'),null);assert.ok(!document.querySelector('link[rel="icon"]').getAttribute('href').includes(logo.id));
  assert.equal((await req('/media/'+logo.id,'GET',undefined,false)).status,404);assert.equal((await req('/api/admin/media/'+logo.id,'DELETE',{})).status,200);
 }finally{await app.close();fs.rmSync(dataDir,{recursive:true,force:true});}
});
