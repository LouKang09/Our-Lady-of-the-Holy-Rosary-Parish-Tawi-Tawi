import {db,verifyImages} from './database.js';
import {fail,text,imageIds} from './domain.js';
import {hierarchyRoles} from '../public/hierarchy-view.js';
export function initialHierarchy(){return hierarchyRoles.map((role,i)=>({id:i?'n_'+crypto.randomUUID():'priest',parentId:i?'priest':null,role,name:'',photo:''}));}
export function validateHierarchy(input){
 if(!input||!Array.isArray(input.nodes)||!input.nodes.length||input.nodes.length>200)fail('The hierarchy needs the Parish Priest and supports up to 200 positions.');
 const nodes=input.nodes.map(n=>{
  if(!n||typeof n!=='object'||!(/^(priest|n_[a-z0-9-]{36})$/).test(n.id||''))fail('Invalid hierarchy member.');
  const photo=n.photo||'';if(photo)imageIds([photo],1);
  return {id:n.id,parentId:n.parentId??null,name:text(n.name,'Full name',160),role:text(n.role,'Committee / position',140,true),photo};
 });
 const map=new Map(nodes.map(n=>[n.id,n]));if(map.size!==nodes.length)fail('Each hierarchy position must be unique.');
 const root=map.get('priest');if(!root||root.parentId!==null||root.role!=='Parish Priest')fail('The Parish Priest must be the single top leader.');
 for(const n of nodes){
  if(n.id!=='priest'&&(n.role==='Parish Priest'||!map.has(n.parentId)))fail('Choose an existing leader for every position below the Parish Priest.');
  const visited=new Set();let current=n;
  while(current){if(visited.has(current.id))fail('A person cannot report to themselves or someone in their own downline.');visited.add(current.id);if(visited.size>13)fail('Keep the hierarchy within 12 levels below the priest.');current=map.get(current.parentId);}
 }
 return nodes;
}
export async function getHierarchy(env,admin=false){const row=await db(env).prepare('SELECT data,version FROM settings WHERE id=?').bind('hierarchy').first();return row?{...JSON.parse(row.data),version:row.version}:{nodes:admin?initialHierarchy():[],version:0};}
export async function saveHierarchy(env,user,input){
 const nodes=validateHierarchy(input),previous=await getHierarchy(env);
 if(input.version!==previous.version)fail('Another administrator updated the hierarchy. Reload before saving to keep their changes.',409);
 await verifyImages(env,[...new Set(nodes.map(n=>n.photo).filter(Boolean))]);
 const value={nodes},now=new Date().toISOString(),mutation='change_'+crypto.randomUUID();
 const sql=previous.version?db(env).prepare('UPDATE settings SET data=?,version=version+1,updated_at=?,mutation=? WHERE id=? AND version=?').bind(JSON.stringify(value),now,mutation,'hierarchy',previous.version):db(env).prepare('INSERT OR IGNORE INTO settings (id,data,version,updated_at,mutation) VALUES (?,?,1,?,?)').bind('hierarchy',JSON.stringify(value),now,mutation);
 const result=await db(env).batch([sql,db(env).prepare('INSERT INTO audit (id,entity_id,action,actor,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM settings WHERE id=? AND mutation=?)').bind(mutation,'hierarchy','hierarchy',user.userId,JSON.stringify(previous),JSON.stringify(value),now,'hierarchy',mutation)]);
 if(!result[0].meta.changes)fail('The hierarchy changed. Reload before saving.',409);
 return getHierarchy(env);
}
