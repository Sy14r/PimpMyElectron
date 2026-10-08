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
 const app={mods:[{id:'base',platforms:['global'],modules:['observer'],requires:[]},{id:'view',platforms:['global'],modules:['view'],requires:['base']}]};
 assert.deepEqual(resolveSelection(app,['view','base']),['base','view']);assert.deepEqual(moduleSelection(app,['view'],[{id:'observer'},{id:'view'},{id:'api'}]),{disabled:['api']});
 assert.throws(()=>resolveSelection(app,['other']));app.mods[0].requires=['view'];assert.throws(()=>resolveSelection(app,['view']),/Circular/);
 const bad={schemaVersion:1,apps:[{id:'../slack',adapter:'slack',bundleId:'com.tinyspeck.slackmacgap',mods:[]}]};assert.throws(()=>validateCatalog(bad,[]));
});
test('first client selection enables the triage suite and disables API adapters; choices persist',async t=>{
 const f=await fixture(t),app=(await f.m.snapshot()).apps[0];assert.deepEqual(app.selectedMods,['slack-triage']);
 assert.equal(app.companionEnabled,true);
 assert.deepEqual(moduleSelection(app,app.selectedMods,f.m.modules).disabled,['history-reader','mark-read','quote-reply','message-polish','slack-appearance','custom-css','personal-emoji','sidebar-productivity','slack-layout']);
 await f.m.select({appId:'slack',modIds:[]});assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.dataDir,'client.json'),'utf8')).apps.slack.selected,[]);
 await assert.rejects(f.m.start('slack'),/Enable at least one/);
 await assert.rejects(f.m.select({appId:'slack',modIds:['slack-triage'],installationPath:'/unverified/Slack.app'}),/verified/);assert.deepEqual(f.m.config.apps.slack.selected,[]);
});
test('Slack Companion is an independent persisted integration and can change while Slack runs',async t=>{
 const f=await fixture(t);let result=await f.m.dispatch({op:'companion',appId:'slack',enabled:false}),app=result.apps.find(item=>item.id==='slack');assert.equal(app.companionEnabled,false);
 assert.equal(JSON.parse(await fs.readFile(path.join(f.dataDir,'client.json'),'utf8')).apps.slack.companion,false);assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.m.runtimeDir('slack'),'companion.json'),'utf8')),{enabled:false});
 f.active=true;f.calls.length=0;result=await f.m.dispatch({op:'companion',appId:'slack',enabled:true});app=result.apps.find(item=>item.id==='slack');assert.equal(app.companionEnabled,true);
 assert.ok(f.calls.some(call=>call.request?.op==='companion'&&call.request.enabled===true));
 await assert.rejects(f.m.dispatch({op:'companion',appId:'spotify',enabled:true}),/Invalid Slack Companion/);
});
test('legacy Layout and Sidebar Peek selections migrate without enabling unwanted previews',async t=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-client-sidebar-migration-'));t.after(()=>fs.rm(dataDir,{recursive:true,force:true}));await fs.mkdir(dataDir,{recursive:true});await fs.writeFile(path.join(dataDir,'client.json'),JSON.stringify({version:1,apps:{slack:{path:null,selected:['slack-layout']}},extraPaths:[]}));
 const manager=await new ClientManager({root,dataDir,scan:async()=>[],request:async()=>{throw Error('not running');}}).init();assert.deepEqual(manager.config.apps.slack.selected,['slack-layout','slack-sidebar-productivity']);const sidebar=(await manager.modSettings('slack')).values['slack-sidebar-productivity'];assert.equal(sidebar.organizerEnabled,true);assert.equal(sidebar.peekEnabled,false);assert.equal(manager.config.sidebarProductivityMigrated,true);
 const again=await new ClientManager({root,dataDir,scan:async()=>[],request:async()=>{throw Error('not running');}}).init();again.config.apps.slack.selected=again.config.apps.slack.selected.filter(id=>id!=='slack-sidebar-productivity');await again.save();const final=await new ClientManager({root,dataDir,scan:async()=>[],request:async()=>{throw Error('not running');}}).init();assert.deepEqual(final.config.apps.slack.selected,['slack-layout']);
});
test('launch uses the bundled runtime with no developer flag, selected modules, and separate writable state',async t=>{
 const f=await fixture(t);await f.m.start('slack');const call=f.calls.find(c=>c.node);
 assert.equal(call.node,'/bundled/node');assert.deepEqual(call.args,[path.join(root,'scripts/dev.mjs')]);assert.equal(call.options.detached,true);assert.equal(call.options.env.PME_SLACK_APP,f.installation.app);assert.equal(call.options.env.PME_DATA_DIR,f.m.runtimeDir('slack'));
 const config=JSON.parse(await fs.readFile(path.join(f.m.runtimeDir('slack'),'mods.json'),'utf8'));assert.deepEqual(config.disabled,['history-reader','mark-read','quote-reply','message-polish','slack-appearance','custom-css','personal-emoji','sidebar-productivity','slack-layout']);assert.equal((await fs.stat(path.join(f.m.runtimeDir('slack'),'mods.json'))).mode&0o777,0o600);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.m.runtimeDir('slack'),'companion.json'),'utf8')),{enabled:true});
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
 f.m.busy=true;await assert.rejects(f.m.dispatch({op:'launch',appId:'slack'}),/wait/);assert.deepEqual((await f.m.dispatch({op:'status'})).apps.map(a=>a.id),['slack','spotify']);
 const env=cleanEnvironment({PATH:'/bin',NODE_OPTIONS:'--inspect',NODE_PATH:'/bad',DYLD_INSERT_LIBRARIES:'/bad',ELECTRON_RUN_AS_NODE:'1',PME_DATA_DIR:'/data'});assert.deepEqual(env,{PATH:'/bin',PME_DATA_DIR:'/data'});
});

test('backend rejects an incompatible selection and launch even if UI controls are bypassed',async t=>{
 const f=await fixture(t);f.m.app('slack').mods[0].platforms=['windows'];
 await assert.rejects(f.m.select({appId:'slack',modIds:['slack-triage']}),/cannot run on macOS/);
 await assert.rejects(f.m.start('slack'),/cannot run on macOS/);
 const app=(await f.m.select({appId:'slack',modIds:[]})).apps.find(a=>a.id==='slack');assert.equal(app.mods[0].compatible,false);assert.equal(f.calls.some(c=>c.node),false);
});

test('a standalone renderer mod opens normal Slack without calling triage controls',async t=>{
 const f=await fixture(t);f.m.runtime=async()=>({running:true,mode:'everyday',triageEnabled:false});
 const calls=[];f.m.request=async(file,request)=>{calls.push({file,request});return {shown:true};};
 await f.m.show('slack','queue');assert.deepEqual(calls,[{file:path.join(f.m.runtimeDir('slack'),'control.sock'),request:{op:'show'}}]);
 await assert.rejects(f.m.show('slack','preferences'),/no settings window/);assert.equal(calls.length,1);
});
test('Slack Companion opens namespaced live settings for a layout-only session',async t=>{
 const f=await fixture(t);f.m.runtime=async()=>({running:true,mode:'everyday',triageEnabled:false,companionEnabled:true});const calls=[];f.m.request=async(file,request)=>{calls.push({file,request});return {settingsRequested:true};};
 await f.m.show('slack','preferences','slack-layout');assert.deepEqual(calls,[{file:path.join(f.m.runtimeDir('slack'),'shell.sock'),request:{op:'preferences',section:'slack-layout'}}]);
});
test('validated mod settings persist while stopped and use the runtime channel while running',async t=>{
 const f=await fixture(t);let result=await f.m.configureMod({appId:'slack',modId:'slack-layout',patch:{railHome:true}});let app=result.apps.find(item=>item.id==='slack');assert.equal(app.modSettings['slack-layout'].railHome,true);await f.m.configureMod({appId:'slack',modId:'slack-sidebar-productivity',patch:{sidebarMode:'auto-hide',sidebarThreshold:880}});app=(await f.m.snapshot()).apps.find(item=>item.id==='slack');assert.equal(app.modSettings['slack-sidebar-productivity'].sidebarMode,'auto-hide');
 await f.m.configureMod({appId:'slack',modId:'slack-sidebar-productivity',patch:{autoHideWidth:20}});app=(await f.m.snapshot()).apps.find(item=>item.id==='slack');assert.equal(app.modSettings['slack-sidebar-productivity'].autoHideWidth,880);assert.equal(app.modSettings['slack-sidebar-productivity'].conversationWidth,880);
 f.active=true;const liveMods=[];f.m.request=async(file,request)=>{if(request.op==='status')return {running:true,controlMode:'everyday',installation:{app:f.installation.app,version:f.installation.version},pages:[]};assert.equal(file,path.join(f.m.runtimeDir('slack'),'control.sock'));assert.equal(request.op,'mod-settings');liveMods.push(request.modId);return {settings:{}};};
 await f.m.configureMod({appId:'slack',modId:'slack-layout',patch:{minimalTopBar:true}});await f.m.configureMod({appId:'slack',modId:'slack-message-polish',patch:{tintIntensity:50}});
 assert.deepEqual(liveMods,['slack-layout','slack-message-polish']);
});
test('Slack settings export, preview, import and exact undo exclude non-settings state',async t=>{
 const f=await fixture(t);await f.m.configureMod({appId:'slack',modId:'slack-layout',patch:{minimalTopBar:true}});const exported=await f.m.dispatch({op:'settings-export'}),document=JSON.parse(exported.text);
 assert.deepEqual(Object.keys(document),['format','version','appId','enabledMods','settings']);assert.equal(document.format,'pme-slack-mod-settings');assert.deepEqual(document.enabledMods,['slack-triage']);assert.equal(document.settings['slack-layout'].minimalTopBar,true);assert.equal(exported.text.includes(f.dataDir),false);
 document.enabledMods=['slack-layout','slack-message-polish'];document.settings['slack-layout'].railMode='full';document.settings['slack-layout'].minimalTopBar=false;document.settings['slack-message-polish'].compactSpacing=true;const text=JSON.stringify(document),preview=await f.m.dispatch({op:'settings-preview',text});assert.equal(preview.total,6);assert.ok(preview.changes.some(change=>change.key==='compactSpacing'));assert.ok(preview.changes.some(change=>change.key==='enabled'));
 let result=await f.m.dispatch({op:'settings-import',text}),app=result.apps.find(item=>item.id==='slack');assert.deepEqual(app.selectedMods,['slack-layout','slack-message-polish']);assert.equal(app.modSettings['slack-layout'].minimalTopBar,false);assert.equal(app.modSettings['slack-message-polish'].compactSpacing,true);assert.equal(app.settingsUndoAvailable,true);
 result=await f.m.dispatch({op:'settings-undo'});app=result.apps.find(item=>item.id==='slack');assert.deepEqual(app.selectedMods,['slack-triage']);assert.equal(app.modSettings['slack-layout'].minimalTopBar,true);assert.equal(app.modSettings['slack-message-polish'].compactSpacing,false);assert.equal(app.settingsUndoAvailable,false);
 document.profile='/private/profile';await assert.rejects(f.m.dispatch({op:'settings-preview',text:JSON.stringify(document)}),/unsupported top-level/);delete document.profile;document.settings.unknown={};await assert.rejects(f.m.dispatch({op:'settings-preview',text:JSON.stringify(document)}),/unknown mod/);
});
