import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {EventEmitter} from 'node:events';import {fileURLToPath} from 'node:url';
import {ClientManager} from '../client/core/manager.mjs';import {validateCatalog} from '../client/core/catalog.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('Spotify is an allowlisted native adapter and cannot enable Slack injected modules',()=>{
 const app={id:'spotify',adapter:'spotify',bundleId:'com.spotify.client',mods:[{id:'menu',platforms:['global'],modules:[],requires:[]}]};
 validateCatalog({schemaVersion:1,apps:[app]},[{id:'state-observer'}]);assert.throws(()=>validateCatalog({schemaVersion:1,apps:[{id:'constructor',adapter:'constructor',mods:[]}]},[]));
 assert.throws(()=>validateCatalog({schemaVersion:1,apps:[{...app,bundleId:'com.other.app'}]},[]));
 assert.throws(()=>validateCatalog({schemaVersion:1,apps:[{...app,adapter:'slack'}]},[]));
 app.mods[0].modules=['state-observer'];assert.throws(()=>validateCatalog({schemaVersion:1,apps:[app]},[{id:'state-observer'}]));
});
test('Spotify launches a separate helper, attaches alongside running Slack, and stops only the widget',async t=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-spotify-'));t.after(()=>fs.rm(dataDir,{recursive:true,force:true}));
 let active=false,bridge=false;const calls=[],installation={app:'/Applications/Spotify.app',version:'1.3.1',distribution:'direct-download'};
 const m=await new ClientManager({root,dataDir,spotifyHelper:path.join(root,'package.json'),running:()=>true,spotifyRunning:()=>false,
 scan:async()=>[{appId:'spotify',path:installation.app,version:installation.version}],inspect:()=>{throw Error('Slack inspection must not run');},spotifyInspect:async p=>{assert.equal(p,installation.app);return installation;},
 request:async(file,req)=>{calls.push({file,req});if(file.endsWith('/bridge.sock')){if(!bridge)throw Error('No bridge');return {adapter:'spotify',mode:'pipe',ready:true};}if(!file.includes('/spotify/')||!active)throw Error('Not running');if(req.op==='stop'){active=false;return true;}return {adapter:'spotify',pid:123,running:true,appRunning:true,appPath:installation.app};},
 launch:(binary,args,options)=>{calls.push({binary,args,options});if(binary==='/usr/bin/open')active=true;else bridge=true;const child=new EventEmitter();child.exitCode=null;child.unref=()=>{};return child;}}).init();
 const scanned=await m.rescan();assert.equal(scanned.apps.find(a=>a.id==='spotify').profileConflict,false);
 await m.start('spotify');const host=calls.find(c=>c.args?.includes(path.join(root,'scripts/spotify-host.mjs')));assert.ok(host);assert.equal(host.options.env.NODE_OPTIONS,undefined);const launch=calls.find(c=>c.binary==='/usr/bin/open');assert.equal(launch.binary,'/usr/bin/open');assert.deepEqual(launch.args,['-g','-n','-a',path.resolve(root,'package.json','../../..'),'--args','--data-dir',m.runtimeDir('spotify'),'--spotify-app',installation.app,'--mods','spotify-menu']);assert.equal(launch.options.env.NODE_OPTIONS,undefined);assert.equal(launch.args.some(a=>a.includes('debug')),false);
 assert.equal((await m.runtime('spotify')).running,true);await m.show('spotify','queue');assert.equal(calls.some(c=>c.req?.op==='show'&&c.file===path.join(m.runtimeDir('spotify'),'control.sock')),true);
 await assert.rejects(m.importSetup('spotify','/test'),/only supported for Slack/);await assert.rejects(m.show('spotify','playpause'),/Unsupported/);
 await m.stop('spotify');assert.equal(active,false);assert.equal(bridge,true);await m.start('spotify');assert.equal(calls.filter(c=>c.args?.includes(path.join(root,'scripts/spotify-host.mjs'))).length,1);assert.equal(calls.filter(c=>c.req?.op==='stop').length,1);assert.equal(calls.find(c=>c.req?.op==='stop').file,path.join(m.runtimeDir('spotify'),'control.sock'));
});

test('Spotify normal sessions are preserved and require a normal quit before Mini Library launch',async t=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-spotify-'));t.after(()=>fs.rm(dataDir,{recursive:true,force:true}));
 const m=await new ClientManager({root,dataDir,spotifyHelper:path.join(root,'package.json'),spotifyRunning:()=>true,spotifyInspect:async()=>({app:'/Applications/Spotify.app'}),request:async()=>{throw Error('No host');},launch:()=>{throw Error('Must not launch or stop an ordinary Spotify session');}}).init();
 await assert.rejects(m.startSpotify({path:'/Applications/Spotify.app',selected:['spotify-menu']}),/Quit Spotify normally/);
});

test('first-open helper readiness can exceed the former 12-second cutoff',async()=>{
 const {waitForSpotifyHelper}=await import('../client/core/spotify.mjs');let elapsed=0,checks=0;
 const state=await waitForSpotifyHelper({now:()=>elapsed,sleep:async ms=>{elapsed+=ms;},launchFailure:()=>null,status:async()=>{checks++;return {running:elapsed>=18000,pid:42};}});
 assert.equal(state.pid,42);assert.equal(elapsed,18000);assert.ok(checks>60);
});
test('helper startup distinguishes OS launch failure from slow readiness',async()=>{
 const {waitForSpotifyHelper}=await import('../client/core/spotify.mjs');let elapsed=0;
 await assert.rejects(waitForSpotifyHelper({status:async()=>({running:false}),launchFailure:()=> 'macOS open exited with status 1'}),/macOS open exited with status 1/);
 await assert.rejects(waitForSpotifyHelper({now:()=>elapsed,sleep:async ms=>{elapsed+=ms;},status:async()=>({running:false}),launchFailure:()=>null}),/existing launch has been left running/);
 assert.equal(elapsed,60000);
});

test('Camera Pause is independent and attaches to ordinary Spotify without the library bridge',async t=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-camera-'));t.after(()=>fs.rm(dataDir,{recursive:true,force:true}));let active=false;const calls=[];
 const manager=await new ClientManager({root,dataDir,spotifyHelper:path.join(root,'package.json'),spotifyRunning:()=>true,spotifyInspect:async app=>({app}),request:async(file,r)=>{calls.push({file,r});if(!active)throw Error('offline');return {adapter:'spotify',running:true,pid:321,mods:['spotify-camera-pause']};},launch:(binary,args)=>{calls.push({binary,args});assert.equal(binary,'/usr/bin/open');active=true;const child=new EventEmitter();child.unref=()=>{};child.exitCode=null;return child;}}).init();
 manager.config.apps.spotify={path:'/Applications/Spotify.app',selected:['spotify-camera-pause']};
 await manager.start('spotify');assert.equal(calls.some(c=>c.file?.endsWith('bridge.sock')),false);
 assert.equal(calls.find(c=>c.args)?.args.at(-1),'spotify-camera-pause');
 const snapshot=await manager.snapshot();assert.equal(snapshot.apps.find(a=>a.id==='spotify').changesPending,false);
 await manager.show('spotify','camera-settings');assert(calls.some(c=>c.r?.op==='camera-settings'));
 await manager.select({appId:'spotify',modIds:['spotify-menu','spotify-camera-pause']});assert.equal((await manager.snapshot()).apps.find(a=>a.id==='spotify').changesPending,true);
});
