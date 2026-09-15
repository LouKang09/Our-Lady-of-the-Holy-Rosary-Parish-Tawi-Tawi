// Dispatch-owned ChatGPT authentication, matching the Sites auth helper contract.
// Identity headers are supplied and sanitized by Sites; authorization stays here.
import { HttpError } from './domain.js';
export function getChatGPTUser(request){const userId=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');return userId&&email?{userId,email:email.trim().toLowerCase()}:null;}
export const chatGPTSignInPath=()=>'/signin-with-chatgpt?return_to=%2Fadmin';
export async function requireAdmin(request,env){
 const user=getChatGPTUser(request);if(!user)throw new HttpError(401,'Please sign in to manage the parish website.');
 if(!env.ADMIN_EMAIL||user.email!==env.ADMIN_EMAIL.trim().toLowerCase())throw new HttpError(403,'This account does not have parish administrator access.');
 if(!env.DB)throw new HttpError(503,'The parish database is temporarily unavailable.');
 await env.DB.prepare('INSERT OR IGNORE INTO admin_identity (id,user_id,created_at) VALUES (?,?,?)').bind('owner',user.userId,new Date().toISOString()).run();
 const identity=await env.DB.prepare('SELECT user_id FROM admin_identity WHERE id=?').bind('owner').first();
 if(identity?.user_id!==user.userId)throw new HttpError(403,'This account does not match the registered parish administrator.');
 return user;
}
export function requireSameOrigin(request){const origin=request.headers.get('origin');if(origin!==new URL(request.url).origin||request.headers.get('x-parish-request')!=='1'||request.headers.get('sec-fetch-site')==='cross-site')throw new HttpError(403,'Please make this change from the parish admin page.');}
