import fs from 'node:fs/promises';
import path from 'node:path';
import {readSource,verifyFiles,digest,externalID,rendererSource} from './mod-packages.mjs';
export async function loadExternalMods(runtimeDir){
 let plan;try{plan=JSON.parse(await fs.readFile(path.join(runtimeDir,'external-mods.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {modules:[],helpers:[]};throw e;}
 if(plan?.schemaVersion!==1||!Array.isArray(plan.packages)||plan.packages.length>100)throw Error('Invalid external mod launch plan');
 const modules=[],helpers=[],ids=new Set();
 for(const p of plan.packages){
  if(ids.has(p.id))throw Error('Duplicate external package');ids.add(p.id);
  const source=await readSource(p.root);if(source.digest!==p.digest)throw Error('External source metadata changed since launch');
  const entry=source.mods.find(m=>m.path===p.path&&externalID(source.catalog.id,m.manifest.id)===p.id);if(!entry||entry.manifest.app!=='slack')throw Error('Invalid external Slack package');
  const m=entry.manifest,root=path.join(source.root,entry.path);await verifyFiles(root,m);
  if(m.renderer){const files=Object.create(null);for(const name of Object.keys(m.files))if(name===m.renderer.script||name===m.renderer.styles||/\.(png|jpe?g|svg|webp)$/.test(name))files[name]=await fs.readFile(path.join(root,name));const global='__PME_EXTERNAL_'+digest(p.id).slice(0,24).toUpperCase()+'__';
   modules.push({id:p.id,version:m.version,global,requires:['slackPage','dom'],code:rendererSource(m,global,files)});}
  for(const h of m.helpers)helpers.push({...h,modId:p.id,root});
 }
 return {modules,helpers};
}
