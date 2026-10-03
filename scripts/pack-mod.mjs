// Authoring tool: refresh the complete file inventory before distributing a package.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {digest,validatePackage} from '../src/mod-packages.mjs';
export async function packMod(folder){
 const root=await fs.realpath(folder),manifest=JSON.parse(await fs.readFile(path.join(root,'mod.json'),'utf8')),files={};let total=0;
 async function walk(dir,prefix=''){
  for(const name of (await fs.readdir(dir)).sort()){
   if(name==='.DS_Store'||!prefix&&name==='mod.json')continue;
   const file=path.join(dir,name),relative=prefix+name,s=await fs.lstat(file);
   if(s.isSymbolicLink())throw Error('Package symlinks are not supported');
   if(s.isDirectory())await walk(file,relative+'/');else{
    if(!s.isFile()||s.size>128*1024*1024||(total+=s.size)>256*1024*1024)throw Error('Invalid or oversized package file');
    files[relative]={sha256:digest(await fs.readFile(file)),executable:!!(s.mode&0o111)};
   }
  }
 }
 await walk(root);manifest.files=files;validatePackage(manifest);await fs.writeFile(path.join(root,'mod.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw Error('Usage: node scripts/pack-mod.mjs /path/to/mod-folder');
 const m=await packMod(process.argv[2]);console.log(`Prepared ${m.id} ${m.version}: ${Object.keys(m.files).length} files. Review the inventory before sharing.`);
}
