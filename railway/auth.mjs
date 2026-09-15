import {createStaffManager} from './staff.mjs';
import {randomBytes,randomUUID,scrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scryptAsync=promisify(scrypt),hash=value=>createHash('sha256').update(value).digest('hex');
const COOKIE='parish_admin_session',SESSION_MS=12*60*60*1000;
export async function passwordHash(password){const salt=randomBytes(16).toString('hex');const result=await scryptAsync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return `scrypt:${salt}:${result.toString('hex')}`;}
export async function passwordMatches(password,encoded){const [algorithm,salt,key]=encoded.split(':');if(algorithm!=='scrypt'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(key))return false;const calculated=await scryptAsync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return timingSafeEqual(calculated,Buffer.from(key,'hex'));}
const same=(a,b)=>timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}});
function passwordValid(value){return typeof value==='string'&&value.length>=12&&value.length<=256;}
export function createAuth(db,config){
 const sql=db.sqlite;let running=0;
 function cookie(token,clear=false){return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:SESSION_MS/1000}${config.origin.startsWith('https:')?'; Secure':''}`;}
 function cookieToken(request){return (request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}
 function user(request){const token=cookieToken(request);if(!/^[a-f0-9]{64}$/.test(token))return null;return sql.prepare('SELECT a.id,a.email,a.name,a.access_role,a.committee FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.disabled=0').get(hash(token),Date.now())||null;}
 function issue(account){const token=randomBytes(32).toString('hex');sql.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());sql.prepare('INSERT INTO sessions (token_hash,account_id,expires_at) VALUES (?,?,?)').run(hash(token),account.id,Date.now()+SESSION_MS);return cookie(token);}
 function rate(key,max){const now=Date.now(),record=sql.prepare('SELECT count,expires_at FROM login_attempts WHERE key=?').get(key);if(record&&record.expires_at>now&&record.count>=max)return false;sql.prepare('INSERT INTO login_attempts (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END').run(key,now+15*60*1000,now,now);sql.prepare('DELETE FROM login_attempts WHERE expires_at<?').run(now-60000);return true;}
 const manageStaff=createStaffManager(sql,config,user,passwordHash,passwordValid);
 async function handle(request,ip='unknown'){
  const route=new URL(request.url).pathname;
  if(route.startsWith('/api/auth/staff'))return manageStaff(request);
  if(route==='/api/auth/status')return json({configured:!!sql.prepare('SELECT id FROM accounts LIMIT 1').get(),authenticated:!!user(request)});
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(request.headers.get('origin')!==config.origin||request.headers.get('x-parish-request')!=='1')return json({error:'Use the parish login page to continue.'},403);
  let input;try{const raw=await request.text();if(raw.length>6000)return json({error:'Request too large.'},413);input=JSON.parse(raw);}catch{return json({error:'Invalid request.'},400);}
  if(route==='/api/auth/logout'){const token=cookieToken(request);if(token)sql.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));return json({ok:true},200,{'set-cookie':cookie('',true)});}
  if(!['/api/auth/login','/api/auth/setup','/api/auth/password'].includes(route))return json({error:'Not found.'},404);
  if(!rate('ip:'+hash(ip),100)||!rate('account:'+hash(String(input.email||config.email).toLowerCase()),20))return json({error:'Too many attempts. Please wait 15 minutes before trying again.'},429);
  if(running>=4)return json({error:'Sign-in is busy. Please try again in a moment.'},429);running++;
  try{
   if(route==='/api/auth/setup'){
    if(sql.prepare('SELECT id FROM accounts LIMIT 1').get())return json({error:'The administrator is already configured. Please sign in.'},409);
    if(!config.setupToken||config.setupToken.length<32||typeof input.token!=='string'||!same(input.token,config.setupToken))return json({error:'A valid private setup link is required.'},403);
    if(String(input.email||'').trim().toLowerCase()!==config.email)return json({error:'Use the configured parish administrator email.'},400);
    if(!passwordValid(input.password))return json({error:'Choose a password between 12 and 256 characters.'},400);
    const encoded=await passwordHash(input.password);const identity=sql.prepare('SELECT user_id FROM admin_identity WHERE id=?').get('owner');const account={id:identity?.user_id||randomUUID(),email:config.email};
    sql.exec('BEGIN IMMEDIATE');try{if(sql.prepare('SELECT id FROM accounts LIMIT 1').get()){sql.exec('ROLLBACK');return json({error:'Setup has already been completed. Please sign in.'},409);}sql.prepare("INSERT INTO accounts (id,email,password_hash,created_at,access_role) VALUES (?,?,?,?,'owner')").run(account.id,account.email,encoded,new Date().toISOString());sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
    return json({ok:true},201,{'set-cookie':issue(account)});
   }
   if(route==='/api/auth/password'){
    const account=user(request);if(!account)return json({error:'Please sign in again.'},401);if(!passwordValid(input.newPassword)||typeof input.currentPassword!=='string'||input.currentPassword.length>256)return json({error:'Choose a new password between 12 and 256 characters.'},400);
    const record=sql.prepare('SELECT password_hash FROM accounts WHERE id=?').get(account.id);if(!await passwordMatches(input.currentPassword,record.password_hash))return json({error:'The current password is incorrect.'},401);
    const encoded=await passwordHash(input.newPassword);sql.exec('BEGIN IMMEDIATE');try{if(!user(request)||sql.prepare('SELECT password_hash FROM accounts WHERE id=?').get(account.id)?.password_hash!==record.password_hash){sql.exec('ROLLBACK');return json({error:'The account changed. Please sign in again.'},401);}sql.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(encoded,account.id);sql.prepare('DELETE FROM sessions WHERE account_id=?').run(account.id);sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
    return json({ok:true},200,{'set-cookie':issue(account)});
   }
   const email=String(input.email||'').trim().toLowerCase(),password=input.password;
   if(typeof password!=='string'||password.length>256)return json({error:'The email or password is incorrect.'},401);
   const account=sql.prepare('SELECT * FROM accounts WHERE email=?').get(email);
   const dummy='scrypt:00000000000000000000000000000000:'+('0'.repeat(128));const valid=await passwordMatches(password,account?.password_hash||dummy);
   if(!account||account.disabled||!valid)return json({error:'The email or password is incorrect.'},401);
   if(sql.prepare('SELECT disabled,password_hash FROM accounts WHERE id=?').get(account.id)?.password_hash!==account.password_hash||sql.prepare('SELECT disabled FROM accounts WHERE id=?').get(account.id)?.disabled)return json({error:'The account changed. Please sign in again.'},401);
   sql.prepare('DELETE FROM login_attempts WHERE key=?').run('account:'+hash(email));return json({ok:true},200,{'set-cookie':issue(account)});
  }finally{running--;}
 }
 return {user,handle};
}
