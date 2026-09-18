import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {validateManifest} from '../src/mod-loader.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),[op='list',id]=process.argv.slice(2);
const manifest=validateManifest(JSON.parse(await fs.readFile(path.join(root,'mods/runtime.json'),'utf8'))),file=path.join(root,'.lab/dev/mods.json');
let config;try{config=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;config={disabled:[]};}
if(op!=='list'){
 if(!['enable','disable'].includes(op)||!manifest.modules.some(m=>m.id===id))throw Error('Use list, enable <id>, or disable <id>');
 const disabled=new Set(config.disabled);op==='disable'?disabled.add(id):disabled.delete(id);config={disabled:[...disabled]};
 await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file+'.tmp',JSON.stringify(config,null,2)+'\n',{mode:0o600});await fs.rename(file+'.tmp',file);
}
console.log(JSON.stringify(manifest.modules.map(m=>({id:m.id,version:m.version,enabled:!config.disabled.includes(m.id)})),null,2));
