import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function openDatabase(directory){
 fs.mkdirSync(directory,{recursive:true});const sqlite=new DatabaseSync(path.join(directory,'parish.sqlite'));
 sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 sqlite.exec('CREATE TABLE IF NOT EXISTS _schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
 for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){
  const sql=fs.readFileSync(path.join('drizzle',file),'utf8'),sum=createHash('sha256').update(sql).digest('hex');const existing=sqlite.prepare('SELECT checksum FROM _schema_migrations WHERE name=?').get(file);
  if(existing){if(existing.checksum!==sum)throw new Error('An applied migration was modified: '+file);continue;}
  sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(sql);sqlite.prepare('INSERT INTO _schema_migrations (name,checksum) VALUES (?,?)').run(file,sum);sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}
 }
 const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};},sql,args});
 return {sqlite,prepare:wrap,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>{const statement=sqlite.prepare(s.sql);if(/^\s*SELECT/i.test(s.sql))return {results:statement.all(...s.args)};const result=statement.run(...s.args);return {results:[],meta:{changes:Number(result.changes)}};});sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
export function openPhotoStorage(directory){const root=path.join(directory,'uploads');fs.mkdirSync(root,{recursive:true});const filename=key=>{if(!/^parish\/m_[a-z0-9-]{36}$/.test(key))throw new Error('Invalid photo key');return path.join(root,path.basename(key));};return {async put(key,bytes){const target=filename(key);await fsp.writeFile(target+'.tmp',bytes,{mode:0o600});await fsp.rename(target+'.tmp',target);},async get(key){try{return {body:await fsp.readFile(filename(key))};}catch(error){if(error.code==='ENOENT')return null;throw error;}},async delete(key){await fsp.rm(filename(key),{force:true});}};}
