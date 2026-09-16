// Shared, escaped chart markup for the first public response and the admin editor.
export const hierarchyRoles = ['Parish Priest','Choir Head','Parish Pastoral Council (PPC) Head','Knights of Columbus (KofC) Head','Parish Youth Head / President','Knights of the Altar (Male) Head','Ladies of the Altar (Female) Head','Secretary Head','Church Utility & Maintenance Personnel'];
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function descendants(nodes,id) {
 const found=new Set([id]);let changed=true;
 while(changed){changed=false;for(const n of nodes)if(found.has(n.parentId)&&!found.has(n.id)){found.add(n.id);changed=true;}}
 return found;
}
export function moveMember(nodes,id,parentId) {
 if(id==='priest')throw new Error('The Parish Priest stays at the top.');
 if(!nodes.some(n=>n.id===id)||!nodes.some(n=>n.id===parentId))throw new Error('Select an existing member and leader.');
 if(descendants(nodes,id).has(parentId))throw new Error('A person cannot report to themselves or anyone in their own downline.');
 return nodes.map(n=>n.id===id?{...n,parentId}:n);
}
export function renderTree(nodes,{editable=false,selected='',collapsed=new Set()}={}) {
 if(!nodes.length)return '<p class="hierarchy-empty">The parish leadership chart will appear here once it has been published.</p>';
 const children=new Map();for(const n of nodes){if(!children.has(n.parentId))children.set(n.parentId,[]);children.get(n.parentId).push(n);}
 const draw=(n,level=0)=>{
  if(level>12)return '';
  const kids=children.get(n.id)||[],closed=collapsed.has(n.id),photo=/^m_[a-z0-9-]{36}$/.test(n.photo||'');
  const initials=n.name?n.name.split(/\s+/).slice(0,2).map(x=>x[0]).join(''):'✝';
  return `<li class="hierarchy-branch"><div class="hierarchy-card ${n.id===selected?'is-selected':''}" data-node-id="${e(n.id)}"><${editable?'button type="button"':'div'} class="hierarchy-person" ${editable?`aria-label="Edit ${e(n.name||n.role)}"`:''}><span class="hierarchy-photo" ${editable&&n.id!=='priest'?'data-drag-handle':''}>${photo?`<img src="/media/${e(n.photo)}" alt="${e(n.name||n.role)}" width="88" height="88" loading="lazy" draggable="false">`:`<span aria-hidden="true">${e(initials)}</span>`}</span><span class="hierarchy-role">${e(n.role)}</span><strong class="hierarchy-name">${e(n.name||'Position awaiting update')}</strong></${editable?'button':'div'}>${kids.length?`<button type="button" class="hierarchy-collapse" data-collapse="${e(n.id)}" aria-expanded="${!closed}" aria-label="${closed?'Show':'Hide'} downline of ${e(n.name||n.role)}">${closed?'+':'−'} ${kids.length} direct ${kids.length===1?'member':'members'}</button>`:''}</div>${kids.length&&!closed?`<ul>${kids.map(k=>draw(k,level+1)).join('')}</ul>`:''}</li>`;
 };
 const root=nodes.find(n=>n.id==='priest');return root?`<ul class="hierarchy-tree" aria-label="Parish leadership hierarchy">${draw(root)}</ul>`:'';
}
export function chartControls(){return '<div class="hierarchy-toolbar"><label>View <select data-chart-view><option value="chart">Organization chart</option><option value="list">Indented list</option></select></label><label>Zoom <select data-chart-zoom><option value="0.6">60%</option><option value="0.8">80%</option><option value="1" selected>100%</option><option value="1.2">120%</option></select></label><button type="button" class="secondary-button" data-chart-expand>Expand all</button><span>Scroll sideways to explore the chart.</span></div>';}
export function bindChartControls(container,redraw,collapsed){
 const viewport=container.querySelector('.hierarchy-viewport');
 const view=container.querySelector('[data-chart-view]'),zoom=container.querySelector('[data-chart-zoom]');
 if(globalThis.matchMedia?.('(max-width: 640px)').matches)view.value='list';
 const apply=()=>{viewport.classList.toggle('hierarchy-list',view.value==='list');viewport.style.setProperty('--chart-zoom',zoom.value);};
 view.onchange=apply;zoom.onchange=apply;apply();
 container.querySelector('[data-chart-expand]').onclick=()=>{collapsed.clear();redraw();};
 container.addEventListener('click',event=>{const button=event.target.closest('[data-collapse]');if(!button)return;const id=button.dataset.collapse;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);redraw();});
}
