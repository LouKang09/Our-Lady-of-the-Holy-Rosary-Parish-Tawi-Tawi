import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
await fs.rm(path.join(root,'dist'),{recursive:true,force:true});
await fs.mkdir('dist/server',{recursive:true});
await fs.mkdir('dist/.openai',{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const resources={};
async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await walk(file);else{const ext=path.extname(file);resources['/'+path.relative('public',file).replaceAll('\\','/')]=[mime[ext]||'application/octet-stream',(await fs.readFile(file)).toString('base64')];}}}
await walk('public');
await fs.writeFile('dist/server/assets.js','export const assets='+JSON.stringify(resources)+';\n');
await fs.cp('server','dist/server',{recursive:true});
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
await fs.cp('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Built parish website, protected admin, API, and migrations.');

await fs.mkdir('dist/public',{recursive:true});
await fs.copyFile('public/hierarchy-view.js','dist/public/hierarchy-view.js');
