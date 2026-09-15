import { HttpError, defaultSettings } from './domain.js';
export function db(env){if(!env.DB)throw new HttpError(503,'The parish database is temporarily unavailable.');return env.DB;}
export async function settings(env){const row=await db(env).prepare('SELECT data,version FROM settings WHERE id=?').bind('parish').first();return row?{...defaultSettings,...JSON.parse(row.data),version:row.version}:{...defaultSettings};}
export async function verifyImages(env,ids){for(const id of ids){if(!await db(env).prepare('SELECT id FROM media WHERE id=?').bind(id).first())throw new HttpError(400,'One selected photo is no longer available. Please select it again.');}}
export async function mediaUsed(env,id,publishedOnly=false){
 const s=await settings(env);if(s.heroImage===id||s.aboutImage===id||(s.heroImages||[]).includes(id))return true;
 const row=await db(env).prepare(`SELECT c.id FROM content c, json_each(c.images) i WHERE c.deleted=0 AND i.value=? ${publishedOnly?"AND c.status='published'":''} LIMIT 1`).bind(id).first();return !!row;
}
