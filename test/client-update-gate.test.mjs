import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {assertNoUpdate,prepareUpdate,stopForUpdate,waitForUpdate,clearUpdate,gateFile} from '../client/core/update-gate.mjs';
import {withLaunchLock} from '../client/core/shortcuts.mjs';
async function fixture(t){const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-update-'));t.after(()=>fs.rm(dataDir,{recursive:true,force:true}));return {dataDir,catalog:{apps:[{id:'spotify',name:'Spotify'}]},clientVersion:{build:8},runtime:async()=>({running:false})};}
test('update gate blocks launches until a newer client finishes the update',async t=>{
 const m=await fixture(t);await prepareUpdate(m);await assert.rejects(()=>assertNoUpdate(m.dataDir),/preparing an update/);
 await clearUpdate(m,true);await assert.rejects(()=>assertNoUpdate(m.dataDir));
 m.clientVersion.build=9;await clearUpdate(m,true);await assertNoUpdate(m.dataDir);
});
test('active mods and orphaned library hosts prevent installation without stopping playback',async t=>{
 const m=await fixture(t);m.runtime=async()=>({running:true});assert.deepEqual(await prepareUpdate(m),{ready:false,sessions:['Spotify'],canStop:false});
 m.runtime=async()=>({running:false});assert.deepEqual(await prepareUpdate(m,{processes:()=>['/Applications/PimpMyElectron.app/Contents/Resources/bin/node /Applications/PimpMyElectron.app/Contents/Resources/runtime/scripts/spotify-host.mjs --app /Applications/Spotify.app --data-dir '+m.dataDir]}),{ready:false,sessions:['background mod sessions'],canStop:false});
 await assertNoUpdate(m.dataDir);
});
test('process inspection failure does not prepare an update',async t=>{const m=await fixture(t);await assert.rejects(()=>prepareUpdate(m,{processes:()=>{throw Error('inspection failed');}}),/inspection failed/);await assertNoUpdate(m.dataDir);});
test('cancel releases only the owning service gate; interrupted updates expire',async t=>{
 const m=await fixture(t);await prepareUpdate(m,{now:1000});await assert.rejects(()=>assertNoUpdate(m.dataDir,1100));await clearUpdate(m);await assertNoUpdate(m.dataDir,1100);
 await fs.writeFile(gateFile(m.dataDir),JSON.stringify({created:1000,owner:99999,build:8}));await clearUpdate(m);await assert.rejects(()=>assertNoUpdate(m.dataDir,1100));await assertNoUpdate(m.dataDir,601001);
});
test('installation preparation and shortcut launches serialize on the same lock',async t=>{
 const m=await fixture(t);let release;const barrier=new Promise(r=>release=r);let started;const entered=new Promise(r=>started=r);
 const install=withLaunchLock(m.dataDir,async()=>{started();await barrier;await prepareUpdate(m);});await entered;
 const launch=withLaunchLock(m.dataDir,()=>assertNoUpdate(m.dataDir));release();await install;await assert.rejects(()=>launch,/preparing an update/);
});

async function managed(t){
 const m=await fixture(t);m.catalog.apps.unshift({id:'slack',name:'Slack'});m.runtimeDir=id=>path.join(m.dataDir,'runtime',id);
 let slack=true,helper=true,bridge=true;const calls=[];
 m.runtime=async id=>id==='slack'?{running:slack,pid:123,mode:'everyday'}:{running:helper,mode:'everyday'};
 m.request=async(file,req)=>{calls.push({file,req});if(file.endsWith('bridge.sock')){if(!bridge)throw Error('Not running');return {adapter:'spotify',mode:'pipe',spotifyPID:456};}assert.equal(file,path.join(m.runtimeDir('spotify'),'control.sock'));assert.equal(req.op,'stop');await assert.rejects(()=>assertNoUpdate(m.dataDir));helper=false;return true;};
 return {m,calls,close:()=>{slack=false;bridge=false;},widgetOnly:()=>{slack=false;bridge=false;},bridgeOnly:()=>{slack=false;helper=false;}};
}
test('consent is required before stopping; stop gates launches and returns only exact owned app PIDs',async t=>{
 const {m,calls,close}=await managed(t);
 assert.deepEqual(await prepareUpdate(m),{ready:false,sessions:['Slack','Spotify'],canStop:true});
 assert.equal(calls.some(c=>c.req.op==='stop'),false);await assertNoUpdate(m.dataDir);
 const result=await withLaunchLock(m.dataDir,()=>stopForUpdate(m));
 assert.deepEqual(result.targets,[{pid:123,bundleIdentifier:'com.tinyspeck.slackmacgap',name:'Slack'},{pid:456,bundleIdentifier:'com.spotify.client',name:'Spotify'}]);
 await assert.rejects(()=>assertNoUpdate(m.dataDir));close();assert.deepEqual(await waitForUpdate(m),{ready:true});await assert.rejects(()=>assertNoUpdate(m.dataDir));
});
test('Camera Pause alone stops its helper without asking ordinary Spotify to quit',async t=>{
 const {m,widgetOnly}=await managed(t);widgetOnly();assert.deepEqual(await stopForUpdate(m),{targets:[]});assert.deepEqual(await waitForUpdate(m),{ready:true});
});
test('a library host left behind by a stopped widget is still managed',async t=>{
 const {m,bridgeOnly,close}=await managed(t);bridgeOnly();assert.equal((await prepareUpdate(m)).canStop,true);assert.deepEqual((await stopForUpdate(m)).targets.map(t=>t.pid),[456]);close();assert.equal((await waitForUpdate(m)).ready,true);
});
test('refused quit and helper failure keep the update blocked and release the launch gate',async t=>{
 const {m}=await managed(t);await stopForUpdate(m);await assert.rejects(()=>waitForUpdate(m,{attempts:2,sleep:async()=>{}}),/remaining mod sessions/);await assertNoUpdate(m.dataDir);
 m.runtime=async()=>({running:true,mode:'everyday',pid:123});const request=m.request;m.request=async(file,req)=>{if(req.op==='stop')throw Error('Helper unavailable');return request(file,req);};await assert.rejects(()=>stopForUpdate(m),/Helper unavailable/);await assertNoUpdate(m.dataDir);
});
test('development and unowned background processes are never stopped automatically',async t=>{
 const m=await fixture(t);m.runtime=async()=>({running:true,mode:'development'});await assert.rejects(()=>stopForUpdate(m),/remaining mod sessions/);await assertNoUpdate(m.dataDir);
 m.runtime=async()=>({running:false});await assert.rejects(()=>stopForUpdate(m,{processes:()=>[m.dataDir+'/Contents/Resources/runtime/scripts/dev.mjs']}),/background mod sessions/);await assertNoUpdate(m.dataDir);
});
test('verification requires the owned gate and catches processes surviving socket shutdown',async t=>{
 const {m,close}=await managed(t);await assert.rejects(()=>waitForUpdate(m),/cancelled/);await stopForUpdate(m);close();await assert.rejects(()=>waitForUpdate(m,{attempts:1,sleep:async()=>{},processes:()=>[m.dataDir+'/Contents/Resources/runtime/scripts/dev.mjs']}),/background mod sessions/);await assertNoUpdate(m.dataDir);
});

test('a remaining external helper supervisor blocks replacement of its bundled runtime',async t=>{
 const m=await fixture(t);m.root='/Applications/PimpMyElectron.app/Contents/Resources/runtime';
 const result=await prepareUpdate(m,{processes:()=>[m.root+'/src/external-helper-host.mjs']});assert.equal(result.ready,false);assert.deepEqual(result.sessions,['background mod sessions']);
});
