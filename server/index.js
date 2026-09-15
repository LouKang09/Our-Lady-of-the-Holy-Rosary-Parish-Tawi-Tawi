import {brandResponse} from './branding.js';
import { copyFields } from './copy-schema.js';
import { assets } from './assets.js';
import { HttpError,fail,kinds,text,validateContent,validateSettings,decodeRow,publicRow,defaultSettings,imageMime,escapeHtml as e } from './domain.js';
import {getChatGPTUser,requireAdmin,requireSameOrigin,chatGPTSignInPath} from './auth.js';
import {db,settings,verifyImages,mediaUsed} from './database.js';
const MAX_UPLOAD=8*1024*1024;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const id=prefix=>prefix+crypto.randomUUID();
function resource(path,status=200){const asset=assets[path];if(!asset)return new Response('Not found',{status:404});const binary=Uint8Array.from(atob(asset[1]),x=>x.charCodeAt(0));return new Response(binary,{status,headers:{'content-type':asset[0],'cache-control':path.endsWith('.html')?'no-store':'public, max-age=300'}});}
function publicHtml(path='/index.html'){return resource(path);}
async function homepage(env){
 let html=await resource('/index.html').text();
 try{
  const s=await settings(env),photo=id=>/^m_[a-z0-9-]{36}$/.test(id||'')?'/media/'+id:'/assets/rosary.jpg';
  const first=s.heroImages?.length?s.heroImages[0]:s.heroImage,hero=photo(first),about=photo(s.aboutImage);
  const position=['center','top','bottom','left','right'].includes(s.heroPosition)?s.heroPosition:'center';
  html=html.replace('data-home-photo="hero"','data-home-photo="hero" style="background-image:url(\''+hero+'\');background-position:'+position+'"');
  html=html.replace('data-home-photo="about" hidden','data-home-photo="about" src="'+about+'"');
  if(!first)html=html.replace('aria-label="Parish background photograph"','aria-label="Wooden rosary beads and cross resting on a dark surface"');
  if(!s.aboutImage)html=html.replace('alt="Parish community photograph"','alt="A wooden rosary and cross, a reminder to make time for prayer"');
  html=html.replace('</head>','<link rel="preload" as="image" href="'+hero+'" fetchpriority="high"></head>');
  if(first&&s.aboutImage)html=html.replace(/<p class="image-credit" id="image-credit">.*?<\/p>/,'');
 }catch{console.error('Homepage photo settings unavailable; awaiting client retry.');}
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}

function htmlPage(title,body,status=200){const html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} | Holy Rosary Parish</title><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/cms.css?v=branding-1"><script type="module" src="/public-content.js?v=branding-1"></script></head><body><header class="inner-header"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">✝</span><span data-brand-name>Our Lady of the<br><strong>Holy Rosary Parish</strong></span></a><a href="/">Back to parish home →</a></header><main class="article-page">${body}</main><footer><a href="/">Our Lady of the Holy Rosary Parish · Bongao, Tawi-Tawi</a></footer></body></html>`;return new Response(html,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});}
async function readJson(request){if(!request.headers.get('content-type')?.startsWith('application/json'))fail('Send JSON content.',415);const raw=await limitedBody(request,120000);try{return JSON.parse(new TextDecoder().decode(raw));}catch{fail('The submitted data could not be read.');}}
async function limitedBody(request,max){if(Number(request.headers.get('content-length'))>max)fail('The file or content is too large.',413);if(!request.body)return new Uint8Array();const reader=request.body.getReader();let size=0,chunks=[];for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail('The file or content is too large.',413);}chunks.push(value);}const result=new Uint8Array(size);let pos=0;for(const part of chunks){result.set(part,pos);pos+=part.length;}return result;}
function normalizeError(error){if(error instanceof HttpError)return json({error:error.message},error.status);if(String(error?.message).includes('UNIQUE constraint failed: content.report_date'))return json({error:'A report already exists for this Sunday. Edit that report instead.'},409);console.error('Parish request failed',error);return json({error:'We could not complete this request. Your changes have not been cleared. Please try again.'},503);}
async function list(request,env,admin=false){
 const url=new URL(request.url),kind=url.searchParams.get('kind');if(!kinds.includes(kind))fail('Choose a content type.');
 const limit=Math.min(50,Math.max(1,Math.floor(Number(url.searchParams.get('limit')))||24)),offset=Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0));
 let where='kind=? AND deleted=0',args=[kind];if(!admin)where+=" AND status='published'";
 const status=url.searchParams.get('status');if(admin&&['draft','published'].includes(status)){where+=' AND status=?';args.push(status);}
 if(kind==='person'&&['priest','ppc','choir','staff'].includes(url.searchParams.get('group'))){where+=" AND json_extract(data,'$.group')=?";args.push(url.searchParams.get('group'));}
 if(kind==='person'&&['current','former'].includes(url.searchParams.get('tenure'))){where+=url.searchParams.get('tenure')==='current'?" AND EXISTS (SELECT 1 FROM json_each(content.data,'$.terms') t WHERE json_extract(t.value,'$.current')=1)":" AND NOT EXISTS (SELECT 1 FROM json_each(content.data,'$.terms') t WHERE json_extract(t.value,'$.current')=1)";}
 if(kind==='collection'&&url.searchParams.has('year')){const year=url.searchParams.get('year');if(!/^\d{4}$/.test(year))fail('Choose a valid year.');where+=' AND report_date >= ? AND report_date < ?';args.push(`${year}-01-01`,`${Number(year)+1}-01-01`);}
 if(kind==='event'&&url.searchParams.get('timeframe')==='upcoming'){where+=" AND json_extract(data,'$.end')>=?";args.push(new Date().toISOString());}
 if(kind==='event'&&url.searchParams.get('timeframe')==='past'){where+=" AND json_extract(data,'$.end')<?";args.push(new Date().toISOString());}
 const order=kind==='collection'?'report_date DESC':kind==='event'?(url.searchParams.get('timeframe')==='upcoming'?'event_start ASC':'event_start DESC'):'created_at DESC';
 const results=await db(env).batch([db(env).prepare(`SELECT * FROM content WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...args,limit,offset),db(env).prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(amount_cents),0) AS total FROM content WHERE ${where}`).bind(...args)]);
 return json({items:results[0].results.map(admin?decodeRow:publicRow),count:results[1].results[0].count,totalCents:kind==='collection'?results[1].results[0].total:undefined,offset,limit});
}
async function adminContent(request,env,user,recordId){
 if(request.method==='GET'){if(!recordId)return list(request,env,true);const row=await db(env).prepare('SELECT * FROM content WHERE id=? AND deleted=0').bind(recordId).first();if(!row)fail('This item is no longer available.',404);return json(decodeRow(row));}
 const input=await readJson(request),existing=recordId?await db(env).prepare('SELECT * FROM content WHERE id=? AND deleted=0').bind(recordId).first():null;
 if(recordId&&!existing)fail('This item is no longer available.',404);
 if(existing&&input.version!==existing.version)fail('Someone changed this item after you opened it. Reload it before saving.',409);
 const now=new Date().toISOString(),mutation=id('change_'),record=recordId||id('c_');
 if(request.method==='DELETE'){
  const result=await db(env).batch([db(env).prepare('UPDATE content SET deleted=1,status=?,updated_at=?,version=version+1,mutation=? WHERE id=? AND version=?').bind('draft',now,mutation,record,input.version),db(env).prepare('INSERT INTO audit (id,entity_id,action,actor,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM content WHERE id=? AND mutation=?)').bind(mutation,record,'archive',user.userId,JSON.stringify(existing),null,now,record,mutation)]);
  if(!result[0].meta.changes)fail('This item changed. Reload before deleting.',409);return json({ok:true});
 }
 if(!['POST','PUT'].includes(request.method))fail('Method not allowed.',405);
 const v=validateContent(input);if(existing&&v.kind!==existing.kind)fail('The content type cannot be changed.');await verifyImages(env,v.images);
 const columns=[v.kind,v.title,v.body,v.status,JSON.stringify(v.data),JSON.stringify(v.images),v.eventStart,v.reportDate,v.amountCents];
 const after=JSON.stringify(v);
 if(existing){const result=await db(env).batch([db(env).prepare('UPDATE content SET kind=?,title=?,body=?,status=?,data=?,images=?,event_start=?,report_date=?,amount_cents=?,updated_at=?,version=version+1,mutation=? WHERE id=? AND version=? AND deleted=0').bind(...columns,now,mutation,record,input.version),db(env).prepare('INSERT INTO audit (id,entity_id,action,actor,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM content WHERE id=? AND mutation=?)').bind(mutation,record,'update',user.userId,JSON.stringify(existing),after,now,record,mutation)]);if(!result[0].meta.changes)fail('This item changed. Reload it before saving.',409);}
 else await db(env).batch([db(env).prepare('INSERT INTO content (id,kind,title,body,status,data,images,event_start,report_date,amount_cents,created_by,created_at,updated_at,version,deleted,mutation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,?)').bind(record,...columns,user.userId,now,now,mutation),db(env).prepare('INSERT INTO audit (id,entity_id,action,actor,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?)').bind(mutation,record,'create',user.userId,null,after,now)]);
 return json(decodeRow(await db(env).prepare('SELECT * FROM content WHERE id=?').bind(record).first()),existing?200:201);
}
async function adminMedia(request,env,user,mediaId){
 if(!env.BUCKET)fail('Photo storage is temporarily unavailable.',503);
 if(request.method==='GET'){const url=new URL(request.url),offset=Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0));const result=await db(env).batch([db(env).prepare('SELECT id,filename,mime,size,alt,created_at FROM media ORDER BY created_at DESC LIMIT 48 OFFSET ?').bind(offset),db(env).prepare('SELECT COUNT(*) AS count FROM media')]);return json({items:result[0].results,count:result[1].results[0].count,offset,limit:48});}
 if(request.method==='DELETE'){
  const row=await db(env).prepare('SELECT * FROM media WHERE id=?').bind(mediaId).first();if(!row)fail('This photo was not found.',404);
  if(await mediaUsed(env,mediaId))fail('This photo is used by a post, event, or homepage. Remove it there before deleting it.',409);
  // Keep bytes until metadata removal succeeds; requests require metadata to serve them.
  const removed=await db(env).prepare("DELETE FROM media WHERE id=? AND NOT EXISTS (SELECT 1 FROM content c,json_each(c.images) i WHERE c.deleted=0 AND i.value=?) AND NOT EXISTS (SELECT 1 FROM settings WHERE json_extract(data,'$.heroImage')=? OR json_extract(data,'$.aboutImage')=? OR json_extract(data,'$.logoImage')=?) AND NOT EXISTS (SELECT 1 FROM settings,json_each(settings.data,'$.heroImages') hi WHERE hi.value=?)").bind(mediaId,mediaId,mediaId,mediaId,mediaId,mediaId).run();if(!removed.meta.changes)fail('This photo was just attached to an item. Remove it there before deleting it.',409);await env.BUCKET.delete(row.object_key);return json({ok:true});
 }
 if(request.method==='PUT'){const input=await readJson(request);const alt=text(input.alt,'Photo description',300,true);const result=await db(env).prepare('UPDATE media SET alt=? WHERE id=?').bind(alt,mediaId).run();if(!result.meta.changes)fail('This photo was not found.',404);return json({ok:true});}
 if(request.method!=='POST')fail('Method not allowed.',405);
 const bytes=await limitedBody(request,MAX_UPLOAD);if(bytes.length<24)fail('Please select a valid image.');const mime=imageMime(bytes);if(!mime)fail('Upload a JPG, PNG, or WebP image. SVG and other file types are not accepted.',415);
 const url=new URL(request.url),alt=text(url.searchParams.get('alt'),'Photo description',300,true),filename=text(url.searchParams.get('filename'),'Filename',180,true).replace(/[\r\n]/g,'');
 const media=id('m_'),key='parish/'+media,now=new Date().toISOString();
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
 try{await db(env).prepare('INSERT INTO media (id,object_key,filename,mime,size,alt,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)').bind(media,key,filename,mime,bytes.length,alt,now,user.userId).run();}catch(error){await env.BUCKET.delete(key);throw error;}
 return json({id:media,filename,mime,size:bytes.length,alt,created_at:now},201);
}
async function saveSettings(request,env,user){if(request.method==='GET')return json(await settings(env));if(request.method!=='PUT')fail('Method not allowed.',405);const input=await readJson(request),previous=await settings(env);if(input.version!==previous.version)fail('Settings have changed. Reload before saving.',409);const value=validateSettings(input);await verifyImages(env,[...new Set([value.logoImage,value.heroImage,value.aboutImage,...(value.heroImages||[])].filter(Boolean))]);const now=new Date().toISOString(),mutation=id('change_');const sql=previous.version?db(env).prepare('UPDATE settings SET data=?,version=version+1,updated_at=?,mutation=? WHERE id=? AND version=?').bind(JSON.stringify(value),now,mutation,'parish',previous.version):db(env).prepare('INSERT OR IGNORE INTO settings (id,data,version,updated_at,mutation) VALUES (?,?,1,?,?)').bind('parish',JSON.stringify(value),now,mutation);
 const result=await db(env).batch([sql,db(env).prepare('INSERT INTO audit (id,entity_id,action,actor,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM settings WHERE id=? AND mutation=?)').bind(mutation,'parish','settings',user.userId,JSON.stringify(previous),JSON.stringify(value),now,'parish',mutation)]);if(!result[0].meta.changes)fail('Settings have changed. Reload before saving.',409);return json(await settings(env));}
async function handle(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/health')return json({ok:true});
 if(path==='/admin'||path==='/admin/'||path==='/admin.html'){
  if(!getChatGPTUser(request))return htmlPage('Parish administration',`<div class="login-card"><div class="eyebrow">PARISH ADMINISTRATION</div><h1>Welcome back.</h1><p>Sign in with the ChatGPT account authorized to manage this parish website.</p><a class="button gold" href="${chatGPTSignInPath()}" target="_top">Sign in with ChatGPT →</a><p class="muted">Parish visitors can browse the public website without signing in.</p></div>`);
  try{await requireAdmin(request,env);}catch(error){if(error.status===403)return htmlPage('Administrator access required',`<h1>Administrator access required.</h1><p>${e(error.message)}</p><p><a href="/signout-with-chatgpt?return_to=%2Fadmin" target="_top">Sign out and use another account →</a></p>`,403);throw error;}
  return resource('/admin.html');
 }
 if(path.startsWith('/api/admin/')){
  const user=await requireAdmin(request,env);if(!['GET','HEAD'].includes(request.method))requireSameOrigin(request);
  if(path==='/api/admin/session')return json({email:user.email,userId:user.userId,authMode:env.AUTH_MODE||'chatgpt',role:user.role,name:user.name||'',committee:user.committee||''});
  if(path==='/api/admin/overview'){const results=await db(env).prepare('SELECT kind,status,COUNT(*) AS count FROM content WHERE deleted=0 GROUP BY kind,status').all();const recent=await db(env).prepare('SELECT id,entity_id,action,created_at FROM audit ORDER BY created_at DESC LIMIT 8').all();return json({counts:results.results,recent:recent.results});}
  if(path==='/api/admin/copy-schema')return json({fields:copyFields});
  if(path==='/api/admin/settings'){if(user.role==='staff'&&request.method!=='GET')fail('Only the primary administrator can change website settings.',403);return saveSettings(request,env,user);}
  const content=path.match(/^\/api\/admin\/content(?:\/(c_[a-z0-9-]{36}))?$/);if(content)return adminContent(request,env,user,content[1]);
  const media=path.match(/^\/api\/admin\/media(?:\/(m_[a-z0-9-]{36}))?$/);if(media)return adminMedia(request,env,user,media[1]);
  if(path==='/api/admin/audit'){if(user.role==='staff')fail('Only the primary administrator can view the audit history.',403);const result=await db(env).prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 100').all();return json({items:result.results});}
  fail('This admin action was not found.',404);
 }
 if(path.startsWith('/api/public')){
  if(request.method!=='GET')fail('Method not allowed.',405);
  if(path==='/api/public/settings')return json(await settings(env));
  if(path==='/api/public/records')return list(request,env);
  if(path==='/api/public'){
   const now=new Date().toISOString();const [s,rows]=await Promise.all([settings(env),db(env).batch([db(env).prepare("SELECT * FROM content WHERE kind='post' AND status='published' AND deleted=0 ORDER BY created_at DESC LIMIT 3"),db(env).prepare("SELECT * FROM content WHERE kind='event' AND status='published' AND deleted=0 AND json_extract(data,'$.end')>=? ORDER BY event_start ASC LIMIT 4").bind(now),db(env).prepare("SELECT * FROM content WHERE kind='schedule' AND status='published' AND deleted=0 ORDER BY created_at DESC LIMIT 300"),db(env).prepare("SELECT * FROM content WHERE kind='collection' AND status='published' AND deleted=0 ORDER BY report_date DESC LIMIT 1")])]);return json({settings:s,posts:rows[0].results.map(publicRow),events:rows[1].results.map(publicRow),schedules:rows[2].results.map(publicRow),collections:rows[3].results.map(publicRow)});
  }
  fail('Not found.',404);
 }
 const mediaPath=path.match(/^\/media\/(m_[a-z0-9-]{36})$/);
 if(mediaPath){if(!['GET','HEAD'].includes(request.method))fail('Method not allowed.',405);const mediaId=mediaPath[1];let allowed=await mediaUsed(env,mediaId,true);if(!allowed){try{await requireAdmin(request,env);allowed=true;}catch(error){if(![401,403].includes(error.status))throw error;}}
  if(!allowed)return new Response('Not found',{status:404});const row=await db(env).prepare('SELECT * FROM media WHERE id=?').bind(mediaId).first();if(!row||!env.BUCKET)return new Response('Not found',{status:404});const object=await env.BUCKET.get(row.object_key);if(!object)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:object.body,{headers:{'content-type':row.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 }
 const article=path.match(/^\/blog\/(c_[a-z0-9-]{36})$/);
 if(article){const row=await db(env).prepare("SELECT * FROM content WHERE id=? AND kind='post' AND status='published' AND deleted=0").bind(article[1]).first();if(!row)return htmlPage('Post not found','<h1>This post is not available.</h1><p><a href="/blog">Browse parish stories →</a></p>',404);const r=publicRow(row);let images=[];for(const photo of r.images){images.push(await db(env).prepare('SELECT id,alt FROM media WHERE id=?').bind(photo).first());}return htmlPage(r.title,`<a class="text-link" href="/blog">← Parish stories</a><div class="eyebrow article-kicker">PARISH LIFE</div><h1>${e(r.title)}</h1><p class="article-meta">${e(new Date(r.createdAt).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'long',day:'numeric'}))}${r.data.author?' · '+e(r.data.author):''}</p>${images[0]?`<img class="article-cover" src="/media/${images[0].id}" alt="${e(images[0].alt)}">`:''}<div class="article-body">${r.body.split(/\n\s*\n/).map(p=>`<p>${e(p).replace(/\n/g,'<br>')}</p>`).join('')}</div><div class="article-gallery">${images.slice(1).filter(Boolean).map(p=>`<figure><img src="/media/${p.id}" alt="${e(p.alt)}" loading="lazy"><figcaption>${e(p.alt)}</figcaption></figure>`).join('')}</div>`);}
 if(['/blog','/events','/schedules','/collections','/people'].includes(path))return publicHtml('/listing.html');
 if(path==='/')return homepage(env);
 if(assets[path]&&path!=='/index.html')return resource(path);
 return htmlPage('Page not found','<h1>Let’s find your way back.</h1><p>This page does not exist. <a href="/">Return to the parish homepage →</a></p>',404);
}
export default {async fetch(request,env){let response;try{response=await brandResponse(await handle(request,env),env);}catch(error){response=normalizeError(error);}const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");return new Response(response.body,{status:response.status,headers});}};
