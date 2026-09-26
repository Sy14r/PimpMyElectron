import fs from 'node:fs/promises';import path from 'node:path';
import {readJSON,writeJSON} from './state.mjs';
export const gateFile=dir=>path.join(dir,'update-pending.json');
export async function assertNoUpdate(dir,now=Date.now()){
 const gate=await readJSON(gateFile(dir),null);
 if(gate&&(!Number.isFinite(gate.created)||now-gate.created<10*60*1000))throw Error('PME is preparing an update. Try again after it relaunches. If an update was interrupted, retry in ten minutes.');
}
export async function prepareUpdate(manager,{processes=()=>[],now=Date.now()}={}){
 await assertNoUpdate(manager.dataDir,now);
 const active=[];
 for(const app of manager.catalog.apps){const state=await manager.runtime(app.id);if(state.running||state.helperRunning)active.push(app.name);}
 // A stopped widget can leave Spotify's inherited-pipe host alive.
 if((await processes()).some(line=>(line.includes(manager.dataDir)||(manager.root&&line.includes(manager.root)))&&/\/Contents\/(?:Resources\/runtime\/scripts\/(?:spotify-host|dev)\.mjs|Resources\/runtime\/bin\/SlackTriage|Helpers\/SpotifyMenu\.app\/Contents\/MacOS\/SpotifyMenu)(?:\s|$)/.test(line)))active.push('background mod sessions');
 if(active.length)throw Error(`Before installing, stop mods in PME and quit the managed Slack/Spotify applications normally (${[...new Set(active)].join(', ')}). Then try Install and Relaunch again. Your settings are preserved.`);
 await writeJSON(gateFile(manager.dataDir),{created:now,build:manager.clientVersion.build,owner:process.pid});return {ready:true};
}
export async function clearUpdate(manager,finished=false){
 const gate=await readJSON(gateFile(manager.dataDir),null);
 if(gate&&(finished?manager.clientVersion.build>gate.build:gate.owner===process.pid))await fs.rm(gateFile(manager.dataDir),{force:true});
 return {ready:true};
}
