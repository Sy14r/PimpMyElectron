import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {assertNoUpdate,prepareUpdate,clearUpdate,gateFile} from '../client/core/update-gate.mjs';
import {withLaunchLock} from '../client/core/shortcuts.mjs';
async function fixture(t){const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-update-'));t.after(()=>fs.rm(dataDir,{recursive:true,force:true}));return {dataDir,catalog:{apps:[{id:'spotify',name:'Spotify'}]},clientVersion:{build:8},runtime:async()=>({running:false})};}
test('update gate blocks launches until a newer client finishes the update',async t=>{
 const m=await fixture(t);await prepareUpdate(m);await assert.rejects(()=>assertNoUpdate(m.dataDir),/preparing an update/);
 await clearUpdate(m,true);await assert.rejects(()=>assertNoUpdate(m.dataDir));
 m.clientVersion.build=9;await clearUpdate(m,true);await assertNoUpdate(m.dataDir);
});
test('active mods and orphaned library hosts prevent installation without stopping playback',async t=>{
 const m=await fixture(t);m.runtime=async()=>({running:true});await assert.rejects(()=>prepareUpdate(m),/Stop|stop mods/);
 m.runtime=async()=>({running:false});await assert.rejects(()=>prepareUpdate(m,{processes:()=>['/Applications/PimpMyElectron.app/Contents/Resources/bin/node /Applications/PimpMyElectron.app/Contents/Resources/runtime/scripts/spotify-host.mjs --app /Applications/Spotify.app --data-dir '+m.dataDir]}),/background mod sessions/);
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
