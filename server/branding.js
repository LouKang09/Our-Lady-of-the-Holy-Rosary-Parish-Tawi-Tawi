import {settings} from './database.js';
import {escapeHtml as e} from './domain.js';
export function renderBranding(html,s){
 if(s.parishName)html=html.replace(/<a class="brand"([^>]*)>/g,(_,attrs)=>`<a class="brand"${attrs.replace(/\saria-label="[^"]*"/,'')} aria-label="${e(s.parishName)} home">`);
 if(s.parishName)html=html.replace(/<span data-brand-name(?: class="[^"]*")?>[\s\S]*?<\/span>/g,()=>`<span data-brand-name class="editable-brand-name">${e(s.parishName)}</span>`);
 if(/^m_[a-z0-9-]{36}$/.test(s.logoImage||'')){
  const src='/media/'+s.logoImage;
  html=html.replace(/<span class="brand-mark"([^>]*)>✝<\/span>/g,()=>`<span class="brand-mark has-logo" aria-hidden="true"><img src="${src}" alt="" width="64" height="64"></span>`);
  html=html.replace(/<link rel="icon"[^>]*>/g,()=>`<link rel="icon" href="${src}">`);
 }
 return html;
}
export async function brandResponse(response,env){
 if(!response.headers.get('content-type')?.includes('text/html'))return response;
 let s;try{s=await settings(env);}catch{return response;}
 const html=renderBranding(await response.text(),s),headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.delete('content-length');
 return new Response(html,{status:response.status,headers});
}
