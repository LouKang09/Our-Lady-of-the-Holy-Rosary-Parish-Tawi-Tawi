import {renderTree,bindChartControls} from './hierarchy-view.js?v=hierarchy-1';
export async function enhanceHierarchy(){
 const container=document.getElementById('public-hierarchy');if(!container)return;
 try{const response=await fetch('/api/public/hierarchy');if(!response.ok)return;const {nodes}=await response.json(),collapsed=new Set(),draw=()=>{container.querySelector('.hierarchy-viewport').innerHTML=renderTree(nodes,{collapsed});};bindChartControls(container,draw,collapsed);draw();}catch{/* The server-rendered chart remains readable when the connection drops. */}
}
