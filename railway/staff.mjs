import {randomUUID} from 'node:crypto';
export const committeeRoles=['Secretary staff','Choir Head','PCC Head','PPC Secretary','KofC'];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const safeColumns='id,email,name,access_role,committee,disabled,version,created_at';
export function createStaffManager(sql,config,user,passwordHash,passwordValid){
 let saving=0;
 return async function staff(request){
  const actor=user(request);if(!actor)return json({error:'Please sign in.'},401);
  if(actor.access_role!=='owner')return json({error:'Only the primary administrator can manage staff accounts.'},403);
  const route=new URL(request.url).pathname,match=route.match(/^\/api\/auth\/staff(?:\/([a-z0-9-]{36}))?$/);
  if(!match)return json({error:'Not found.'},404);const id=match[1];
  if(request.method==='GET'&&!id)return json({items:sql.prepare(`SELECT ${safeColumns} FROM accounts WHERE access_role='staff' ORDER BY created_at DESC,id`).all(),roles:committeeRoles});
  if(!((request.method==='POST'&&!id)||(request.method==='PUT'&&id)))return json({error:'Method not allowed.'},405);
  if(request.headers.get('origin')!==config.origin||request.headers.get('x-parish-request')!=='1'||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Use the parish admin page to make this change.'},403);
  let input;try{const raw=await request.text();if(raw.length>6000)return json({error:'Request too large.'},413);input=JSON.parse(raw);if(!input||typeof input!=='object')throw Error();}catch{return json({error:'Invalid request.'},400);}
  const previous=id?sql.prepare(`SELECT ${safeColumns} FROM accounts WHERE id=? AND access_role='staff'`).get(id):null;
  if(id&&!previous)return json({error:'Staff account not found.'},404);
  if(previous&&previous.version!==input.version)return json({error:'This account changed. Reload it before saving.'},409);
  const name=typeof input.name==='string'?input.name.trim():'',email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  const committee=input.role==='Other'&&typeof input.committee==='string'?input.committee.trim():committeeRoles.includes(input.role)?input.role:'';
  if(!name||name.length>120)return json({error:'Enter a staff name of up to 120 characters.'},400);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json({error:'Enter a valid staff email address.'},400);
  if(!committee||committee.length>100)return json({error:'Choose a role or enter your committee (up to 100 characters).'},400);
  if(input.disabled!==undefined&&typeof input.disabled!=='boolean')return json({error:'Choose a valid account status.'},400);
  if(!previous&&!passwordValid(input.password)||input.password&&!passwordValid(input.password))return json({error:'Choose a password between 12 and 256 characters.'},400);
  if(saving>=2)return json({error:'Another account is being saved. Please try again shortly.'},429);saving++;
  try{
   const encoded=input.password?await passwordHash(input.password):null,record=id||randomUUID(),disabled=input.disabled?1:0,now=new Date().toISOString();
   sql.exec('BEGIN IMMEDIATE');
   try{
    if(user(request)?.access_role!=='owner'){sql.exec('ROLLBACK');return json({error:'Please sign in again.'},401);}
    if(sql.prepare('SELECT id FROM accounts WHERE email=? AND id<>?').get(email,record)){sql.exec('ROLLBACK');return json({error:'An account already uses this email address.'},409);}
    if(previous){
     const result=sql.prepare("UPDATE accounts SET name=?,email=?,committee=?,disabled=?,password_hash=COALESCE(?,password_hash),version=version+1 WHERE id=? AND access_role='staff' AND version=?").run(name,email,committee,disabled,encoded,record,input.version);
     if(!result.changes){sql.exec('ROLLBACK');return json({error:'This account changed. Reload it before saving.'},409);}
     if(disabled||encoded||email!==previous.email)sql.prepare('DELETE FROM sessions WHERE account_id=?').run(record);
    }else sql.prepare("INSERT INTO accounts (id,email,name,password_hash,access_role,committee,disabled,created_at) VALUES (?,?,?,?,'staff',?,?,?)").run(record,email,name,encoded,committee,disabled,now);
    const after=sql.prepare(`SELECT ${safeColumns} FROM accounts WHERE id=?`).get(record);
    sql.prepare('INSERT INTO audit (id,entity_id,action,actor,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?)').run('change_'+randomUUID(),record,previous?'staff-update':'staff-create',actor.id,previous?JSON.stringify(previous):null,JSON.stringify({...after,passwordReset:!!previous&&!!encoded}),now);
    sql.exec('COMMIT');return json(after,previous?200:201);
   }catch(error){sql.exec('ROLLBACK');throw error;}
  }finally{saving--;}
 };
}
