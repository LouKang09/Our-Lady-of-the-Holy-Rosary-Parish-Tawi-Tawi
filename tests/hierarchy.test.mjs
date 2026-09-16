import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {parseHTML} from 'linkedom';import {createParishServer} from '../railway/start.mjs';
import {initialHierarchy,validateHierarchy} from '../server/hierarchy.js';
import {descendants,moveMember,renderTree} from '../public/hierarchy-view.js';

test('Hierarchy rejects loops, disconnected positions and excess depth, and moves complete downlines',()=>{
 const nodes=initialHierarchy(),choir=nodes[1],ppc=nodes[2];
 assert.equal(nodes.length,9);assert.ok(nodes.some(n=>n.role.includes('(Male)')));assert.ok(nodes.some(n=>n.role.includes('(Female)')));
 assert.deepEqual(validateHierarchy({nodes}),nodes);
 const secretary={id:'n_'+crypto.randomUUID(),parentId:choir.id,name:'Member A',role:'Choir Secretary',photo:''};
 const singer={id:'n_'+crypto.randomUUID(),parentId:secretary.id,name:'Member B',role:'Singer',photo:''};nodes.push(secretary,singer);
 const moved=moveMember(nodes,secretary.id,ppc.id);assert.equal(moved.find(n=>n.id===singer.id).parentId,secretary.id);assert.ok(descendants(moved,ppc.id).has(singer.id));assert.deepEqual(validateHierarchy({nodes:moved}),moved);
 assert.throws(()=>moveMember(moved,ppc.id,singer.id),/downline/);assert.throws(()=>moveMember(nodes,'priest',ppc.id),/top/);
 assert.throws(()=>validateHierarchy({nodes:nodes.map(n=>n.id===choir.id?{...n,parentId:singer.id}:n)}),/downline/);
 assert.throws(()=>validateHierarchy({nodes:nodes.map(n=>n.id===choir.id?{...n,parentId:'missing'}:n)}),/existing leader/);
 assert.throws(()=>validateHierarchy({nodes:nodes.slice(1)}),/single top/);
 assert.throws(()=>validateHierarchy({nodes:[...nodes,nodes[1]]}),/unique/);
 let deep=[nodes[0]];for(let i=0;i<13;i++)deep.push({id:'n_'+crypto.randomUUID(),parentId:deep.at(-1).id,name:'',role:'Member',photo:''});assert.throws(()=>validateHierarchy({nodes:deep}),/12 levels/);
});

test('Hierarchy persists across server restart; public SSR uses safe photos; owner-only writes, version conflicts and photo protection work',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'parish-hierarchy-')),config={dataDir,origin:'https://parish.example',email:'owner@example.com',setupToken:'local-test-setup-token-32-characters'};
 let app=createParishServer(config),base,cookie='';async function start(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}await start();
 async function req(route,method='GET',body,auth=cookie,origin=config.origin){const r=await fetch(base+route,{method,headers:{origin,'x-parish-request':'1','content-type':'application/json',...(auth?{cookie:auth}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,value:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};}
 try{
  assert.equal((await req('/api/admin/hierarchy')).status,401);assert.deepEqual((await req('/api/public/hierarchy')).value.nodes,[]);
  const setup=await req('/api/auth/setup','POST',{email:config.email,token:config.setupToken,password:'local test password!'});assert.equal(setup.status,201);cookie=setup.headers.get('set-cookie').split(';')[0];
  const initial=(await req('/api/admin/hierarchy')).value;assert.equal(initial.nodes.length,9);
  const upload=await fetch(base+'/api/admin/media?filename=member.jpg&alt=Member%20portrait',{method:'POST',headers:{origin:config.origin,'x-parish-request':'1',cookie},body:fs.readFileSync('public/assets/rosary.jpg')});assert.equal(upload.status,201);const photo=await upload.json();
  const nodes=initial.nodes.map((n,i)=>({...n,name:i?'Test member '+i:'Test Priest & <script>alert(1)</script>',photo:i===0?photo.id:''}));
  assert.equal((await req('/api/admin/hierarchy','PUT',{nodes,version:0},cookie,'https://evil.example')).status,403);
  assert.equal((await req('/api/admin/hierarchy','PUT',{nodes:nodes.map(n=>({...n,photo:'m_00000000-0000-4000-8000-000000000000'})),version:0})).status,400);
  const saved=await req('/api/admin/hierarchy','PUT',{nodes,version:0});assert.equal(saved.status,200);assert.equal(saved.value.version,1);
  assert.equal((await req('/api/admin/hierarchy','PUT',{nodes,version:0})).status,409);
  const doc=parseHTML((await req('/hierarchy','GET',undefined,'')).value).document;assert.equal(doc.querySelectorAll('.hierarchy-card').length,9);assert.equal(doc.querySelector('.hierarchy-name').textContent,nodes[0].name);assert.equal(doc.querySelector('.hierarchy-card script'),null);assert.equal(doc.querySelector('.hierarchy-photo img').getAttribute('src'),'/media/'+photo.id);
  assert.equal((await req('/media/'+photo.id,'GET',undefined,'')).status,200);assert.equal((await req('/api/admin/media/'+photo.id,'DELETE',{})).status,409);
  const settings=(await req('/api/admin/settings')).value;await req('/api/admin/settings','PUT',{...settings,parishName:'Updated parish name'});assert.deepEqual((await req('/api/public/hierarchy','GET',undefined,'')).value.nodes,nodes,'Ordinary page settings preserve hierarchy');
  const staff=await req('/api/auth/staff','POST',{name:'Test staff',email:'staff@example.com',password:'test staff password!',role:'Choir Head'});assert.equal(staff.status,201,JSON.stringify(staff.value));
  const login=await req('/api/auth/login','POST',{email:'staff@example.com',password:'test staff password!'},'');assert.equal(login.status,200);const staffCookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await req('/api/admin/hierarchy','PUT',{nodes,version:1},staffCookie)).status,403);
  const priestName=nodes[0].name;await app.close();app=createParishServer(config);await start();assert.equal((await req('/api/public/hierarchy','GET',undefined,'')).value.nodes[0].name,priestName);
  const moved=moveMember(nodes,nodes[1].id,nodes[2].id);const updated=await req('/api/admin/hierarchy','PUT',{nodes:moved,version:1});assert.equal(updated.status,200);assert.equal((await req('/api/public/hierarchy')).value.nodes[1].parentId,nodes[2].id);
  const reset=await req('/api/admin/hierarchy','PUT',{nodes:moved.map(n=>({...n,photo:''})),version:2});assert.equal(reset.status,200);assert.equal((await req('/media/'+photo.id,'GET',undefined,'')).status,404);assert.equal((await req('/api/admin/media/'+photo.id,'DELETE',{})).status,200);
 }finally{await app.close();fs.rmSync(dataDir,{recursive:true,force:true});}
});
