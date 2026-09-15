import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createParishServer} from '../railway/start.mjs';
import {openDatabase} from '../railway/storage.mjs';

test('Existing sole administrator keeps owner access when staff migration runs',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parish-migrate-'));
 try{const sql=new DatabaseSync(path.join(dir,'parish.sqlite'));sql.exec('CREATE TABLE _schema_migrations (name TEXT PRIMARY KEY,checksum TEXT NOT NULL)');
 for(const name of ['0000_late_switch.sql','0001_boring_white_queen.sql']){const content=fs.readFileSync('drizzle/'+name,'utf8');sql.exec(content);sql.prepare('INSERT INTO _schema_migrations VALUES (?,?)').run(name,createHash('sha256').update(content).digest('hex'));}
 sql.prepare('INSERT INTO accounts VALUES (?,?,?,?)').run('existing-owner','owner@example.com','existing-password-hash','2026-01-01');sql.close();
 const db=openDatabase(dir);const owner=db.sqlite.prepare('SELECT * FROM accounts').get();assert.equal(owner.access_role,'owner');assert.equal(owner.password_hash,'existing-password-hash');assert.equal(owner.disabled,0);db.sqlite.close();
 const reopened=openDatabase(dir);assert.equal(reopened.sqlite.prepare('SELECT access_role FROM accounts').get().access_role,'owner');reopened.sqlite.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Owner can create staff with flexible committees; staff can publish but cannot manage users; disabling and password reset revoke access',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'parish-staff-'));const config={origin:'https://parish.example',email:'owner@example.com',setupToken:'test-only-setup-token-32-characters-long',dataDir};
 const app=createParishServer(config);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 async function req(route,method='GET',body,cookie='',extra={}){const r=await fetch(base+route,{method,headers:{...(method==='GET'?{}:{origin:config.origin,'x-parish-request':'1','content-type':'application/json'}),...(cookie?{cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,value:r.headers.get('content-type')?.includes('json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  const owner=await req('/api/auth/setup','POST',{token:config.setupToken,email:config.email,password:'primary password test!'});assert.equal(owner.status,201);
  const input={name:'Choir Secretary',email:'choir@example.com',role:'Other',committee:'Choir Secretary',password:'staff password test!',disabled:false};
  assert.equal((await req('/api/auth/staff')).status,401);
  assert.equal((await req('/api/auth/staff','POST',input)).status,401);
  assert.equal((await req('/api/auth/staff','POST',input,owner.cookie,{origin:'https://evil.example'})).status,403);
  assert.equal((await req('/api/auth/staff','POST',{...input,committee:''},owner.cookie)).status,400);
  assert.equal((await req('/api/auth/staff','POST',{...input,password:'weak'},owner.cookie)).status,400);
  const created=await req('/api/auth/staff','POST',{...input,access_role:'owner'},owner.cookie);assert.equal(created.status,201);assert.equal(created.value.access_role,'staff');assert.equal(created.value.committee,'Choir Secretary');assert.equal(created.value.password_hash,undefined);
  assert.equal((await req('/api/auth/staff','POST',{...input,email:'CHOIR@example.com'},owner.cookie)).status,409);
  const catalog=await req('/api/auth/staff','GET',undefined,owner.cookie);assert.deepEqual(catalog.value.roles,['Secretary staff','Choir Head','PCC Head','PPC Secretary','KofC']);assert.equal(catalog.value.items.length,1);assert.ok(!JSON.stringify(catalog.value).includes('password_hash'));
  const staff=await req('/api/auth/login','POST',{email:input.email,password:input.password});assert.equal(staff.status,200);
  const session=await req('/api/admin/session','GET',undefined,staff.cookie,{'oai-authenticated-user-email':config.email,'oai-authenticated-user-id':owner.value.id||'fake','oai-role':'owner'});assert.equal(session.value.role,'staff');assert.equal(session.value.email,input.email);
  assert.equal((await req('/admin','GET',undefined,staff.cookie)).status,200);
  assert.equal((await req('/api/auth/staff','GET',undefined,staff.cookie)).status,403);
  assert.equal((await req('/api/auth/staff','POST',input,staff.cookie)).status,403);
  assert.equal((await req('/api/auth/staff/'+created.value.id,'PUT',{...input,version:1},staff.cookie)).status,403);
  assert.equal((await req('/api/admin/settings','PUT',{},staff.cookie)).status,403);
  assert.equal((await req('/api/admin/audit','GET',undefined,staff.cookie)).status,403);
  const bytes=fs.readFileSync('public/assets/rosary.jpg');const upload=await fetch(base+'/api/admin/media?filename=test.jpg&alt=Staff%20photo',{method:'POST',headers:{origin:config.origin,'x-parish-request':'1',cookie:staff.cookie},body:bytes});assert.equal(upload.status,201);const photo=await upload.json();
  const post=await req('/api/admin/content','POST',{kind:'post',title:'Choir update',body:'Practice details.',status:'published',images:[photo.id],data:{author:'Choir Secretary',excerpt:''}},staff.cookie);assert.equal(post.status,201);
  assert.equal(app.DB.sqlite.prepare('SELECT created_by FROM content WHERE id=?').get(post.value.id).created_by,created.value.id);
  assert.equal((await req('/api/public/records?kind=post')).value.count,1);
  const updated=await req('/api/auth/staff/'+created.value.id,'PUT',{...input,role:'KofC',committee:'ignored',password:'',version:1,disabled:true},owner.cookie);assert.equal(updated.status,200);assert.equal(updated.value.committee,'KofC');
  assert.equal((await req('/api/admin/session','GET',undefined,staff.cookie)).status,401);
  assert.equal((await req('/api/auth/login','POST',{email:input.email,password:input.password})).status,401);
  assert.equal((await req('/api/auth/staff/'+created.value.id,'PUT',{...input,version:1},owner.cookie)).status,409);
  assert.equal((await req('/api/public/records?kind=post')).value.count,1);
  const reset=await req('/api/auth/staff/'+created.value.id,'PUT',{...input,version:2,password:'reset staff password!'},owner.cookie);assert.equal(reset.status,200);
  assert.equal((await req('/api/admin/session','GET',undefined,staff.cookie)).status,401);
  assert.equal((await req('/api/auth/login','POST',{email:input.email,password:input.password})).status,401);
  const fresh=await req('/api/auth/login','POST',{email:input.email,password:'reset staff password!'});assert.equal(fresh.status,200);
  const changed=await req('/api/auth/password','POST',{currentPassword:'reset staff password!',newPassword:'staff chosen password!'},fresh.cookie);assert.equal(changed.status,200);
  assert.equal((await req('/api/admin/session','GET',undefined,changed.cookie)).value.role,'staff');
  const audits=app.DB.sqlite.prepare("SELECT * FROM audit WHERE action LIKE 'staff-%'").all();assert.equal(audits.length,3);assert.ok(!JSON.stringify(audits).includes('scrypt:'));
 }finally{await app.close();fs.rmSync(dataDir,{recursive:true,force:true});}
});
