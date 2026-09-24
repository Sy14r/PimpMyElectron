import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {readJSON,writeJSON} from './state.mjs';
export const shortcutAttribute='com.pimpmyElectron.launch-profile';
export function profileID(id){if(typeof id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))throw Error('Invalid shortcut profile');return id;}
export const profileFile=(dir,id)=>path.join(dir,'shortcuts',profileID(id)+'.json');
export async function readProfile(dir,id){const p=await readJSON(profileFile(dir,id));if(p?.schemaVersion!==1||p.id!==id||typeof p.appId!=='string'||!path.isAbsolute(p.installationPath||'')||!Array.isArray(p.modIds))throw Error('Invalid saved shortcut');return p;}
export async function listProfiles(dir){const folder=path.join(dir,'shortcuts'),names=await fs.readdir(folder).catch(e=>{if(e.code==='ENOENT')return [];throw e;});const profiles=[];for(const name of names){if(!/^[a-f0-9-]+\.json$/i.test(name))continue;try{profiles.push(await readProfile(dir,name.slice(0,-5)));}catch{/* A broken profile must not hide the rest. */}}return profiles.sort((a,b)=>a.name.localeCompare(b.name));}
function command(bin,args){const p=spawnSync(bin,args,{encoding:'utf8'});if(p.status!==0)throw Error(`Shortcut operation failed: ${path.basename(bin)}`);return p.stdout.trim();}
export function shortcutIdentity(file){return command('/usr/bin/xattr',['-p',shortcutAttribute,file]);}
export async function assertShortcut(file,id){if(!path.isAbsolute(file)||!file.endsWith('.app'))throw Error('Invalid shortcut location');const stat=await fs.lstat(file);if(!stat.isDirectory()||stat.isSymbolicLink()||shortcutIdentity(file)!==profileID(id))throw Error('This app is not the saved PME shortcut');}
export async function createProfile({dataDir,template,appId,installationPath,modIds,destination,clientPath}){
 if(!path.isAbsolute(destination)||!destination.endsWith('.app'))throw Error('Choose an application name ending in .app');
 if(await fs.lstat(destination).catch(()=>null))throw Error('An item already exists there. Choose a different name.');
 const id=randomUUID(),profile={schemaVersion:1,id,name:path.basename(destination,'.app'),appId,installationPath,modIds:[...modIds],shortcutPath:destination,clientPath,createdAt:Date.now()};
 // ditto preserves the signed template and its stapled ticket. The profile ID is
 // a bundle-root extended attribute, outside the sealed resource directory.
 const stage=await fs.mkdtemp(path.join(path.dirname(destination),'.pme-shortcut-'));
 try{const copy=path.join(stage,'Shortcut.app');command('/usr/bin/ditto',[template,copy]);command('/usr/bin/xattr',['-w',shortcutAttribute,id,copy]);command('/usr/bin/codesign',['--verify','--deep','--strict',copy]);
  await writeJSON(profileFile(dataDir,id),profile);
  // Reserve the destination without replacing any existing application.
  await fs.mkdir(destination);try{command('/usr/bin/ditto',[copy,destination]);command('/usr/bin/xattr',['-w',shortcutAttribute,id,destination]);command('/usr/bin/codesign',['--verify','--deep','--strict',destination]);await assertShortcut(destination,id);}catch(e){await fs.rm(destination,{recursive:true,force:true});throw e;}
  return profile;
 }catch(e){await fs.rm(profileFile(dataDir,id),{force:true});throw e;}finally{await fs.rm(stage,{recursive:true,force:true});}
}
export async function updateProfile(dir,id,selection){const p=await readProfile(dir,id);const updated={...p,...selection,updatedAt:Date.now()};await writeJSON(profileFile(dir,id),updated);return updated;}
export async function withLaunchLock(dir,fn){
 await fs.mkdir(dir,{recursive:true,mode:0o700});const lock=path.join(dir,'launch.lock');let handle;
 for(let attempt=0;attempt<120;attempt++){
  try{handle=await fs.open(lock,'wx',0o600);await handle.writeFile(String(process.pid));break;}catch(e){if(e.code!=='EEXIST')throw e;
   const stat=await fs.stat(lock).catch(()=>null),owner=Number(await fs.readFile(lock,'utf8').catch(()=>''));
   let alive=true;if(owner>0){try{process.kill(owner,0);}catch(e){if(e.code==='ESRCH')alive=false;}}
   // A crashed owner can be recovered. Re-check the inode before removing it.
   if(stat&&(!alive||(!owner&&Date.now()-stat.mtimeMs>30000))){const current=await fs.stat(lock).catch(()=>null);if(current?.ino===stat.ino)await fs.unlink(lock).catch(()=>{});continue;}
   await new Promise(r=>setTimeout(r,250));
  }
 }
 if(!handle)throw Error('Another PME launch is still in progress. Try again shortly.');
 try{return await fn();}finally{await handle.close();if(await fs.readFile(lock,'utf8').catch(()=>null)===String(process.pid))await fs.unlink(lock).catch(()=>{});}
}
export function sameSelection(active,selection){return !!active&&active.installationPath===selection.installationPath&&JSON.stringify([...active.modIds].sort())===JSON.stringify([...selection.modIds].sort());}
