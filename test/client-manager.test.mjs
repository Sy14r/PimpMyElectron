import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';import {ClientManager,cleanEnvironment} from '../client/core/manager.mjs';import {validateCatalog,resolveSelection,moduleSelection} from '../client/core/catalog.mjs';import {developmentProfile} from '../src/slack-installation.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
async function fixture(t){
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-client-'));t.after(()=>fs.rm(dataDir,{recursive:true,force:true}));
 const calls=[],installation={app:'/Applications/Slack.app',profile:path.join(dataDir,'profile'),version:'4.52.162',distribution:'direct-download'};
 let isRunning=false,external=false,exit=null;
 const m=await new ClientManager({root,dataDir,helper:path.join(root,'package.json'),node:'/bundled/node',scan:async()=>[{appId:'slack',path:installation.app,version:installation.version}],inspect:async candidate=>{assert.equal(candidate,installation.app);return installation;},running:()=>external,
 request:async(file,request)=>{calls.push({file,request});if(request.op==='stop'){isRunning=false;return 'Stopping';}if(!isRunning)throw Error('Not running');return {running:true,controlMode:'everyday',installation:{app:installation.app,version:installation.version},pages:[{signedIn:true}]};},
 launch:(node,args,options)=>{calls.push({node,args,options});isRunning=true;const child=new EventEmitter();child.exitCode=exit;child.unref=()=>{};return child;}}).init();
 await m.rescan();return {m,calls,dataDir,installation,set external(v){external=v;},set active(v){isRunning=v;}};
}
test('mod catalog resolves dependencies once and blocks unknown IDs, cycles and arbitrary sources',()=>{
 const app={mods:[{id:'base',modules:['observer'],requires:[]},{id:'view',modules:['view'],requires:['base']}]};
 assert.deepEqual(resolveSelection(app,['view','base']),['base','view']);assert.deepEqual(moduleSelection(app,['view'],[{id:'observer'},{id:'view'},{id:'api'}]),{disabled:['api']});
 assert.throws(()=>resolveSelection(app,['other']));app.mods[0].requires=['view'];assert.throws(()=>resolveSelection(app,['view']),/Circular/);
 const bad={schemaVersion:1,apps:[{id:'../slack',adapter:'slack',bundleId:'com.tinyspeck.slackmacgap',mods:[]}]};assert.throws(()=>validateCatalog(bad,[]));
});
test('first client selection enables the triage suite and disables API adapters; choices persist',async t=>{
 const f=await fixture(t),app=(await f.m.snapshot()).apps[0];assert.deepEqual(app.selectedMods,['slack-triage']);
 assert.deepEqual(moduleSelection(app,app.selectedMods,f.m.modules).disabled,['history-reader','mark-read']);
 await f.m.select({appId:'slack',modIds:[]});assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.dataDir,'client.json'),'utf8')).apps.slack.selected,[]);
 await assert.rejects(f.m.start('slack'),/Enable at least one/);
 await assert.rejects(f.m.select({appId:'slack',modIds:['slack-triage'],installationPath:'/unverified/Slack.app'}),/verified/);assert.deepEqual(f.m.config.apps.slack.selected,[]);
});
test('launch uses the bundled runtime with no developer flag, selected modules, and separate writable state',async t=>{
 const f=await fixture(t);await f.m.start('slack');const call=f.calls.find(c=>c.node);
 assert.equal(call.node,'/bundled/node');assert.deepEqual(call.args,[path.join(root,'scripts/dev.mjs')]);assert.equal(call.options.detached,true);assert.equal(call.options.env.PME_SLACK_APP,f.installation.app);assert.equal(call.options.env.PME_DATA_DIR,f.m.runtimeDir('slack'));
 const config=JSON.parse(await fs.readFile(path.join(f.m.runtimeDir('slack'),'mods.json'),'utf8'));assert.deepEqual(config.disabled,['history-reader','mark-read']);assert.equal((await fs.stat(path.join(f.m.runtimeDir('slack'),'mods.json'))).mode&0o777,0o600);
 await f.m.stop('slack');assert.equal((await f.m.runtime('slack')).running,false);
});
test('external Slack and unowned existing profiles are never stopped, adopted or overwritten',async t=>{
 const f=await fixture(t);f.external=true;await assert.rejects(f.m.start('slack'),/already open/);assert.equal(f.calls.some(c=>c.request?.op==='stop'),false);assert.equal(f.calls.some(c=>c.node),false);
 f.external=false;await fs.mkdir(f.installation.profile);await fs.writeFile(path.join(f.installation.profile,'sentinel'),'keep');await assert.rejects(f.m.start('slack'),/ownership record/);
 assert.equal(await fs.readFile(path.join(f.installation.profile,'sentinel'),'utf8'),'keep');assert.equal(f.calls.some(c=>c.node),false);
});
test('import copies only settings and ownership, preserves existing destination state and never copies sign-in files',async t=>{
 const f=await fixture(t),old=path.join(f.dataDir,'old/.lab/dev');await fs.mkdir(old,{recursive:true});
 await fs.writeFile(path.join(old,'profile-owner.json'),JSON.stringify({profile:developmentProfile('direct-download')}));await fs.writeFile(path.join(old,'triage-state.json'),JSON.stringify({version:1,settings:{inboxOpacity:35}}));await fs.writeFile(path.join(old,'credentials'),'not for import');
 await f.m.importSetup('slack',path.join(f.dataDir,'old'));const dir=f.m.runtimeDir('slack');assert.equal((await fs.readdir(dir)).includes('credentials'),false);
 await fs.writeFile(path.join(old,'triage-state.json'),'bad');await f.m.importSetup('slack',path.join(f.dataDir,'old'));assert.equal(JSON.parse(await fs.readFile(path.join(dir,'triage-state.json'),'utf8')).settings.inboxOpacity,35);
 await fs.writeFile(path.join(old,'profile-owner.json'),JSON.stringify({profile:'/someone/elses/profile'}));await assert.rejects(f.m.importSetup('slack',old),/different Mac/);
});
test('client control refuses arbitrary evaluation and launch serialization prevents concurrent mutations',async t=>{
 const f=await fixture(t);await assert.rejects(f.m.dispatch({op:'inspect',expression:'code'}),/Unsupported/);await assert.rejects(f.m.show('slack','inspect'),/Unsupported/);
 f.m.busy=true;await assert.rejects(f.m.dispatch({op:'launch',appId:'slack'}),/wait/);assert.equal((await f.m.dispatch({op:'status'})).apps.length,1);
 const env=cleanEnvironment({PATH:'/bin',NODE_OPTIONS:'--inspect',NODE_PATH:'/bad',DYLD_INSERT_LIBRARIES:'/bad',ELECTRON_RUN_AS_NODE:'1',PME_DATA_DIR:'/data'});assert.deepEqual(env,{PATH:'/bin',PME_DATA_DIR:'/data'});
});
