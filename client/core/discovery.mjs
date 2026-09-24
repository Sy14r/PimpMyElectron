import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function discoverApps(catalog,{roots=['/Applications',path.join(os.homedir(),'Applications'),'/System/Applications'],extraPaths=[],metadataSearch=true}={}){
 const paths=new Set(extraPaths.filter(p=>typeof p==='string'&&path.isAbsolute(p))),found=[],seen=new Set();
 async function walk(root,depth=0){
  const entries=await fs.readdir(root,{withFileTypes:true}).catch(()=>[]);
  for(const entry of entries){
   if(entry.name.startsWith('.'))continue;
   const candidate=path.join(root,entry.name);
   if(entry.name.endsWith('.app'))paths.add(candidate);
   else if(entry.isDirectory()&&depth<2)await walk(candidate,depth+1);
  }
 }
 await Promise.all(roots.map(r=>walk(r)));
 if(metadataSearch)for(const app of catalog.apps){
  try{const {stdout}=await exec('/usr/bin/mdfind',[`kMDItemCFBundleIdentifier == '${app.bundleId}'`],{timeout:5000,maxBuffer:1024*1024});for(const line of stdout.split('\n'))if(path.isAbsolute(line)&&line.endsWith('.app'))paths.add(line);}catch{}
 }
 for(const candidate of [...paths].slice(0,1500)){
  try{
   const real=await fs.realpath(candidate);if(seen.has(real))continue;seen.add(real);
   const {stdout}=await exec('/usr/bin/plutil',['-convert','json','-o','-',path.join(real,'Contents/Info.plist')],{timeout:3000,maxBuffer:256*1024});
   const info=JSON.parse(stdout),app=catalog.apps.find(a=>a.bundleId===info.CFBundleIdentifier);if(!app)continue;
   found.push({appId:app.id,path:real,version:String(info.CFBundleShortVersionString||'Unknown'),name:app.name});
  }catch{/* Unreadable and unsupported application bundles are not managed. */}
 }
 return found.sort((a,b)=>a.path.localeCompare(b.path));
}
