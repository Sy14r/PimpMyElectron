import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {readJSON,writeJSON} from './state.mjs';
import {readSource,regularFile,verifyFiles,verifyHelper,digest,externalID} from '../../src/mod-packages.mjs';
export class ModSources {
 constructor(dataDir,{helperVerifier=verifyHelper}={}){this.base=path.join(dataDir,'mod-sources');this.file=path.join(this.base,'sources.json');this.helperVerifier=helperVerifier;this.sources=[];this.candidates=new Map();}
 async load(){this.sources=await readJSON(this.file,[]);if(!Array.isArray(this.sources))throw Error('Invalid mod source settings');return this;}
 async save(){await writeJSON(this.file,this.sources);}
 source(id){const s=this.sources.find(s=>s.id===id);if(!s)throw Error('Unknown mod source');return s;}
 location(s,hash=s.installed){if(!/^[a-z][a-z0-9-]{1,63}$/.test(s.id)||!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid installed source identity');return path.join(this.base,'packages',s.id,hash);}
 async add(folder){
  if(typeof folder!=='string'||!path.isAbsolute(folder))throw Error('Choose a local mod folder');
  const c=await readSource(folder);if(this.sources.some(s=>s.id===c.catalog.id||s.path===c.root))throw Error('This source identity or folder is already registered');
  const s={id:c.catalog.id,name:c.catalog.name,path:c.root,installed:null,previous:null};this.sources.push(s);this.candidates.set(s.id,c);await this.save();return s;
 }
 async refresh(){for(const s of this.sources){try{const c=await readSource(s.path);if(c.catalog.id!==s.id)throw Error('Source identity changed');this.candidates.set(s.id,c);delete s.error;}catch(error){this.candidates.delete(s.id);s.error=error.code==='ENOENT'?'Source folder is unavailable. Installed versions remain available.':error.message;}}}
 async installed(s){if(!s.installed)return null;const c=await readSource(this.location(s));if(c.digest!==s.installed||c.catalog.id!==s.id)throw Error('Installed mod metadata changed; reinstall from the source');return c;}
 async snapshot(){return this.sources.map(s=>{const c=this.candidates.get(s.id);return {...s,available:c?.digest||null,updateAvailable:!!c&&c.digest!==s.installed,mods:c?.mods.map(({manifest:m})=>({name:m.name,version:m.version,app:m.app,access:m.access,helpers:m.helpers.map(h=>({id:h.id,teamId:h.teamId,arch:h.arch}))}))||[]};});}
 async install(id,expected){
  const s=this.source(id),c=await readSource(s.path);if(c.catalog.id!==s.id||c.digest!==expected)throw Error('The source changed after review. Refresh and review it again.');
  const parent=path.join(this.base,'packages',s.id);await fs.mkdir(parent,{recursive:true,mode:0o700});const stage=path.join(parent,'.stage-'+randomUUID());await fs.mkdir(stage,{mode:0o700});
  try{
   await writeJSON(path.join(stage,'catalog.json'),c.catalog);let total=0;
   for(const p of c.mods){let packageBytes=0;const destination=path.join(stage,p.path),source=path.join(c.root,p.path);await fs.mkdir(destination,{recursive:true,mode:0o700});
    await writeJSON(path.join(destination,'mod.json'),p.manifest);
    for(const [name,record] of Object.entries(p.manifest.files)){
     const data=await fs.readFile(await regularFile(source,name));total+=data.length;packageBytes+=data.length;if(packageBytes>256*1024*1024)throw Error('Package exceeds 256 MB');if(total>512*1024*1024)throw Error('Source exceeds 512 MB');
     if(digest(data)!==record.sha256)throw Error('Source files are incomplete or changed. Wait for sync and refresh.');
     const target=path.join(destination,name);await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});await fs.writeFile(target,data,{mode:record.executable?0o700:0o600});
    }
    // Unsupported packages can be listed, but their native code is never executed here.
    for(const h of p.manifest.helpers)if(process.platform==='darwin'&&(h.arch==='universal'||h.arch===process.arch))await this.helperVerifier(destination,h);
   }
   if((await readSource(s.path)).digest!==expected)throw Error('Source changed during installation; refresh and retry');
   const target=this.location(s,c.digest);
   // Immutable version directories are never overwritten underneath a running session.
   if(await fs.stat(target).catch(()=>null)){
    const existing=await readSource(target);if(existing.digest!==c.digest)throw Error('Cached package metadata changed');
    for(const p of existing.mods)await verifyFiles(path.join(target,p.path),p.manifest);
   }else await fs.rename(stage,target);
   if(s.installed!==c.digest){s.previous=s.installed;s.installed=c.digest;}s.name=c.catalog.name;delete s.error;await this.save();this.candidates.set(s.id,c);
  }finally{await fs.rm(stage,{recursive:true,force:true});}
 }
 async rollback(id){const s=this.source(id);if(!s.previous)throw Error('No previous version is available');const old=s.installed;s.installed=s.previous;try{const c=await this.installed(s);for(const p of c.mods)await verifyFiles(path.join(c.root,p.path),p.manifest);}catch(e){s.installed=old;throw e;}s.previous=old;await this.save();}
 async remove(id){this.source(id);this.sources=this.sources.filter(s=>s.id!==id);this.candidates.delete(id);await this.save();/* Cached sessions retain their immutable files until they finish. */}
 async mods(){const result=[];for(const s of this.sources){try{const c=await this.installed(s);if(!c)continue;
  for(const p of c.mods){const m=p.manifest;result.push({id:externalID(s.id,m.id),name:m.name,version:m.version,author:m.author,description:m.description,summary:m.description,access:m.access,features:m.features||[],platforms:m.platforms,defaultEnabled:false,modules:[],
   requires:m.requires.map(id=>c.mods.some(p=>p.manifest.id===id)?externalID(s.id,id):id),
   source:{id:s.id,name:s.name,digest:s.installed},appId:m.app,packagePath:p.path,packageRoot:c.root,manifest:m,
   unavailableReason:m.app!=='slack'?'External package execution currently supports Slack. Spotify support needs its own adapter contract.':m.helpers.some(h=>h.platform!=='mac'||h.arch!=='universal'&&h.arch!==process.arch)?'A helper does not support this CPU architecture.':null});}
 }catch(error){s.error=error.message;}}return result;}
 async launchPlan(app,selected){const mods=selected.map(id=>app.mods.find(m=>m.id===id)).filter(m=>m?.source);const packages=[];
  for(const m of mods){await verifyFiles(path.join(m.packageRoot,m.packagePath),m.manifest);for(const h of m.manifest.helpers)await this.helperVerifier(path.join(m.packageRoot,m.packagePath),h);packages.push({id:m.id,root:m.packageRoot,path:m.packagePath,digest:m.source.digest});}
  return {schemaVersion:1,packages};
 }
}
