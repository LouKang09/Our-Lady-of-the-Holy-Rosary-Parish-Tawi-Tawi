import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {renderHierarchyAdmin} from '../public/hierarchy-admin.js';
import {initialHierarchy,validateHierarchy} from '../server/hierarchy.js';
import {escapeHtml} from '../server/domain.js';

test('Admin editor applies custom roles, uploads, pointer moves, dropdown moves, undo, and published refresh',async()=>{
 const {document,window}=parseHTML('<html><body><main id="workspace"></main></body></html>');
 globalThis.document=document;globalThis.window=window;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 // Supply browser form interfaces that linkedom does not implement.
 Object.defineProperty(window.HTMLElement.prototype,'elements',{configurable:true,get(){return new Proxy({}, {get:(_,name)=>this.querySelector(`[name="${String(name)}"]`)});}});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(value){for(const option of this.querySelectorAll('option'))value===option.value?option.setAttribute('selected',''):option.removeAttribute('selected');}});
 window.HTMLElement.prototype.reportValidity=()=>true;
 let state={nodes:initialHierarchy(),version:0},dirty=false,picked='m_'+crypto.randomUUID(),writes=0;
 const context={api:async(route,method='GET',body)=>{assert.equal(route,'/api/admin/hierarchy');if(method==='PUT'){state={nodes:validateHierarchy(body),version:state.version+1};writes++;}return structuredClone(state);},e:escapeHtml,choosePhotos:async()=>[picked],toast:()=>{},setDirty:value=>dirty=value};
 const workspace=document.getElementById('workspace'),$=s=>workspace.querySelector(s);
 const fire=(el,type,props={})=>{const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,props);el.dispatchEvent(event);};
 try{
  await renderHierarchyAdmin(workspace,context);assert.equal(workspace.querySelectorAll('.hierarchy-card').length,9);
  assert.equal($('[name="role"]').disabled,true);assert.equal($('[name="parent"]').disabled,true);
  $('[name="name"]').value='Test Priest';fire($('[name="name"]'),'input');assert.equal($('[data-node-id="priest"] .hierarchy-name').textContent,'Test Priest');
  await $('#hierarchy-photo').onclick();assert.equal($('.hierarchy-editor-photo img').getAttribute('src'),'/media/'+picked);
  $('#hierarchy-add').click();const added=$('.is-selected').dataset.nodeId;assert.equal($('[name="role"]').value,'other');
  $('[name="customRole"]').value='PPC Secretary';fire($('[name="customRole"]'),'input');$('[name="name"]').value='Member & <img>';fire($('[name="name"]'),'input');
  const ppc=state.nodes[2],choir=state.nodes[1];$('[name="parent"]').value=ppc.id;fire($('[name="parent"]'),'change');assert.equal($('[name="parent"]').value,ppc.id);
  $('#hierarchy-undo').click();assert.equal($('[name="parent"]').value,'priest');
  const viewport=$('.hierarchy-viewport');viewport.setPointerCapture=()=>{};viewport.hasPointerCapture=()=>true;viewport.releasePointerCapture=()=>{};
  document.elementFromPoint=()=>$(`[data-node-id="${choir.id}"] .hierarchy-photo`);
  fire($(`[data-node-id="${added}"] [data-drag-handle]`),'pointerdown',{button:0,pointerId:1,clientX:10,clientY:10});
  fire(viewport,'pointermove',{pointerId:1,clientX:150,clientY:150});assert.equal($('.is-drop-target').dataset.nodeId,choir.id);
  fire(viewport,'pointerup',{pointerId:1,clientX:150,clientY:150});assert.equal($('[name="parent"]').value,choir.id);
  assert.equal(dirty,true);await $('#hierarchy-save').onclick();assert.equal(writes,1);assert.equal(dirty,false);assert.equal(state.nodes.find(n=>n.id===added).parentId,choir.id);assert.equal(state.nodes.find(n=>n.id===added).role,'PPC Secretary');
  await renderHierarchyAdmin(workspace,context);assert.equal($(`[data-node-id="${added}"] .hierarchy-name`).textContent,'Member & <img>');assert.equal($(`[data-node-id="${added}"] .hierarchy-name img`),null);assert.equal($('[data-node-id="priest"] img').getAttribute('src'),'/media/'+picked);
  // Clicking/tapping the photo without dragging must still select the member.
  const view=$('.hierarchy-viewport');view.setPointerCapture=()=>{};view.hasPointerCapture=()=>false;
  fire($(`[data-node-id="${choir.id}"] [data-drag-handle]`),'pointerdown',{button:0,pointerId:2,clientX:20,clientY:20});fire(view,'pointerup',{pointerId:2,clientX:20,clientY:20});assert.equal($('[name="role"]').value,'Choir Head');
 }finally{delete globalThis.document;delete globalThis.window;delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;}
});
