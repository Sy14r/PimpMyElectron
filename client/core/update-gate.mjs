import fs from 'node:fs/promises';import path from 'node:path';
import {readJSON,writeJSON} from './state.mjs';
export const gateFile=dir=>path.join(dir,'update-pending.json');
export async function assertNoUpdate(dir,now=Date.now()){
 const gate=await readJSON(gateFile(dir),null);
 if(gate&&(!Number.isFinite(gate.created)||now-gate.created<10*60*1000))throw Error('PME is preparing an update. Try again after it relaunches. If an update was interrupted, retry in ten minutes.');
}
export async function updateSessions(manager,{processes=()=>[]}={}){
 const sessions=[],targets=[];let spotifyHelper=false,unsupported=false;
 for(const app of manager.catalog.apps){
  const state=await manager.runtime(app.id,{timeout:500});
  if(!state.running&&!state.helperRunning)continue;
  sessions.push(app.name);
  if(state.mode!=='everyday'){unsupported=true;continue;}
  if(app.id==='slack'){
   if(Number.isInteger(state.pid)&&state.pid>1)targets.push({pid:state.pid,bundleIdentifier:'com.tinyspeck.slackmacgap',name:'Slack'});
   else unsupported=true;
  }else if(app.id==='spotify')spotifyHelper=true;
  else unsupported=true;
 }
 // The library host deliberately outlives the Spotify widget. Its child PID,
 // rather than a process-name search, identifies the Spotify instance we own.
 if(manager.catalog.apps.some(a=>a.id==='spotify')&&manager.request&&manager.runtimeDir){
  const bridge=await manager.request(path.join(manager.runtimeDir('spotify'),'bridge.sock'),{op:'status'},{timeout:500}).catch(()=>null);
  if(bridge?.adapter==='spotify'&&bridge.mode==='pipe'){
   sessions.push('Spotify');
   if(Number.isInteger(bridge.spotifyPID)&&bridge.spotifyPID>1)targets.push({pid:bridge.spotifyPID,bundleIdentifier:'com.spotify.client',name:'Spotify'});
   else unsupported=true;
  }
 }
 const background=(await processes()).some(line=>(line.includes(manager.dataDir)||(manager.root&&line.includes(manager.root)))&&/\/Contents\/(?:Resources\/runtime\/scripts\/(?:spotify-host|dev)\.mjs|Resources\/runtime\/bin\/SlackTriage|Helpers\/SpotifyMenu\.app\/Contents\/MacOS\/SpotifyMenu)(?:\s|$)/.test(line));
 if(background&&!sessions.length)sessions.push('background mod sessions');
 return {sessions:[...new Set(sessions)],targets,spotifyHelper,canStop:!unsupported&&(targets.length>0||spotifyHelper)};
}
const blocked=state=>Error(`Close the remaining mod sessions (${state.sessions.join(', ')}) normally, then retry Install and Relaunch. PME will not force-quit an application. Settings and sign-ins are preserved.`);
export async function prepareUpdate(manager,options={}){
 await assertNoUpdate(manager.dataDir,options.now??Date.now());
 const state=await updateSessions(manager,options);
 if(state.sessions.length)return {ready:false,sessions:state.sessions,canStop:state.canStop};
 await writeJSON(gateFile(manager.dataDir),{created:options.now??Date.now(),build:manager.clientVersion.build,owner:process.pid});return {ready:true};
}
export async function stopForUpdate(manager,options={}){
 await assertNoUpdate(manager.dataDir,options.now??Date.now());
 const state=await updateSessions(manager,options);
 if(state.sessions.length&&!state.canStop)throw blocked(state);
 // Written under the shared launch lock before quitting anything. Shortcuts and
 // other manager instances cannot start a new session during native termination.
 await writeJSON(gateFile(manager.dataDir),{created:options.now??Date.now(),build:manager.clientVersion.build,owner:process.pid});
 try{
  // Stop Camera Pause before quitting its app, so shutdown cannot resume music.
  // This operation only stops the Spotify helper; never use Slack's forceful stop.
  if(state.spotifyHelper)await manager.request(path.join(manager.runtimeDir('spotify'),'control.sock'),{op:'stop'});
  return {targets:state.targets};
 }catch(error){await clearUpdate(manager);throw error;}
}
export async function waitForUpdate(manager,{sleep=ms=>new Promise(r=>setTimeout(r,ms)),attempts=40,...options}={}){
 const gate=await readJSON(gateFile(manager.dataDir),null);
 if(!gate||gate.owner!==process.pid)throw Error('Update preparation was cancelled. Retry the update.');
 try{
  let state;const deadline=Date.now()+12000;
  for(let i=0;i<attempts&&Date.now()<deadline;i++){
   state=await updateSessions(manager,options);
   if(!state.sessions.length)return {ready:true};
   await sleep(250);
  }
  throw blocked(state);
 }catch(error){await clearUpdate(manager);throw error;}
}
export async function clearUpdate(manager,finished=false){
 const gate=await readJSON(gateFile(manager.dataDir),null);
 if(gate&&(finished?manager.clientVersion.build>gate.build:gate.owner===process.pid))await fs.rm(gateFile(manager.dataDir),{force:true});
 return {ready:true};
}
