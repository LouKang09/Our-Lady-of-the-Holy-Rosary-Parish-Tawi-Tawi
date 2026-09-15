import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {parseHTML} from 'linkedom';
import worker from '../dist/server/index.js';
import {openDatabase} from '../railway/storage.mjs';
import {copyFields} from '../server/copy-schema.js';
const origin='https://parish.example';let renderId=0;
async function render(env,route){
 const html=await (await worker.fetch(new Request(origin+route),env)).text();const {window,document}=parseHTML(html);
 globalThis.document=document;globalThis.window=window;globalThis.location=new URL(origin+route);
 globalThis.fetch=async url=>worker.fetch(new Request(new URL(url,origin)),env);
 await (await import('../public/public-content.js?render='+ ++renderId)).publicPageReady;
 return document;
}
async function call(env,route,method='GET',body){const r=await worker.fetch(new Request(origin+route,{method,headers:{'oai-authenticated-user-id':'copy-test-owner','oai-authenticated-user-email':env.ADMIN_EMAIL,origin,'x-parish-request':'1','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env);const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;}

test('Every page-content field saves, survives refresh, and reaches its public destination',async()=>{
 const originalFetch=globalThis.fetch,dir=fs.mkdtempSync(path.join(os.tmpdir(),'parish-copy-')),env={ADMIN_EMAIL:'owner@example.com',DB:openDatabase(dir)};
 try{
  const initial=await call(env,'/api/admin/settings'),copy=Object.fromEntries(copyFields.map(f=>[f.key,`Updated ${f.key}\nTawi-Tawi & <b>parish</b>`]));
  const saved=await call(env,'/api/admin/settings','PUT',{...initial,parishName:'General parish name',mapUrl:'https://example.com/map',welcome:'General welcome text',copy});
  assert.deepEqual((await call(env,'/api/public/settings')).copy,copy);
  const covered=new Set();
  for(let refresh=0;refresh<2;refresh++){
   const doc=await render(env,'/');assert.equal(doc.querySelector('#public-update-status').hidden,true,'No public rendering error');
   for(const node of doc.querySelectorAll('[data-copy]')){const key=node.dataset.copy;assert.ok(Object.hasOwn(copy,key),key+' has an editable field');assert.equal(node.textContent,copy[key],key+' survives complete homepage rendering');assert.equal(node.querySelector('b'),null,key+' is safe plain text');covered.add(key);}
   assert.equal(doc.querySelector('.visit-info h3').textContent,copy.copy_58);
   assert.equal(doc.querySelector('.map-note').textContent,copy.copy_57);
   assert.equal(doc.querySelector('.about-copy .lead').textContent,copy.copy_14);
   assert.equal(doc.querySelector('.brand>span:last-child').textContent,'General parish name');
  }
  for(const page of ['blog','events','schedules','collections','people']){
   const doc=await render(env,'/'+page);
   for(const [suffix,selector] of [['Title','#listing-title'],['Description','#listing-description']]){const key=page+suffix;assert.equal(doc.querySelector(selector).textContent,copy[key],key+' reaches listing');covered.add(key);}
   if(page==='people')for(const [group,key] of Object.entries({priest:'priestsLabel',ppc:'ppcLabel',choir:'choirLabel',staff:'staffLabel'}))assert.equal(doc.querySelector(`option[value="${group}"]`).textContent,copy[key]);
  }
  assert.deepEqual([...covered].sort(),copyFields.map(f=>f.key).sort(),'Every schema field has a verified public destination');
  await call(env,'/api/admin/content','POST',{kind:'schedule',title:'Published Mass',body:'Confirmed by the parish',status:'published',images:[],data:{category:'Mass',recurrence:'weekly',days:[0],startTime:'08:00',endTime:'09:00',location:'Church',language:'English',validFrom:'',validUntil:''}});
  const populated=await render(env,'/');assert.equal(populated.querySelector('#public-update-status').hidden,true);assert.equal(populated.querySelector('.schedule-note p').textContent,copy.copy_29,'Published schedules do not override saved note');assert.ok(populated.querySelector('.public-schedule-grid').textContent.includes('Published Mass'));
  for(let n=20;n<=28;n++){assert.equal(populated.querySelector(`[data-copy="copy_${n}"]`),null);assert.match(copyFields.find(f=>f.key==='copy_'+n).help,/no active published schedules/);}
  const profile=await call(env,'/api/admin/content','POST',{kind:'person',title:'Test choir profile',body:'Test biography',status:'published',images:[],data:{group:'choir',role:'Singer',terms:[{role:'Singer',startYear:2026,endYear:null,current:true,notes:''}]}});
  assert.ok(profile.id);const people=await render(env,'/people');assert.ok(people.querySelector('.person-card .notice-tag').textContent.includes(copy.choirLabel));assert.equal(people.querySelector('.person-card .notice-tag b'),null);
  // Explicitly clearing copy must stay blank instead of restoring the general defaults.
  const cleared={...copy,copy_58:'',copy_57:'',copy_29:'',eventsTitle:''};await call(env,'/api/admin/settings','PUT',{...saved,copy:cleared});
  const empty=await render(env,'/');for(const key of ['copy_58','copy_57','copy_29'])assert.equal(empty.querySelector(`[data-copy="${key}"]`).textContent,'');assert.equal((await render(env,'/events')).querySelector('#listing-title').textContent,'');
 }finally{globalThis.fetch=originalFetch;delete globalThis.document;delete globalThis.window;delete globalThis.location;env.DB.sqlite.close();fs.rmSync(dir,{recursive:true,force:true});}
});
