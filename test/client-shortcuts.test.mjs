import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {createProfile,assertShortcut,profileID,profileFile,readProfile,listProfiles,updateProfile,withLaunchLock,sameSelection,shortcutAttribute} from '../client/core/shortcuts.mjs';
import {writeJSON} from '../client/core/state.mjs';import {ClientManager} from '../client/core/manager.mjs';import {EventEmitter} from 'node:events';import {fileURLToPath} from 'node:url';
const id='12345678-1234-1234-1234-123456789abc',root=fileURLToPath(new URL('..',import.meta.url));
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-shortcuts-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('shortcut profiles validate identifiers, freeze selections and update independently',async t=>{
 const dir=await temp(t),original={schemaVersion:1,id,name:'Test',appId:'slack',installationPath:'/Applications/Slack.app',modIds:['slack-triage']};
 for(const bad of ['../a','../../client','',null])assert.throws(()=>profileID(bad));
 await writeJSON(profileFile(dir,id),original);const snapshot=await readProfile(dir,id);const selected=['slack-triage'];selected.length=0;assert.deepEqual(snapshot.modIds,['slack-triage']);
 await updateProfile(dir,id,{name:'Renamed'});assert.equal((await listProfiles(dir))[0].name,'Renamed');assert.deepEqual((await readProfile(dir,id)).modIds,original.modIds);
});
test('launch lock serializes separate managers and releases on failures',async t=>{
 const dir=await temp(t),order=[];
 await Promise.all([withLaunchLock(dir,async()=>{order.push('a');await new Promise(r=>setTimeout(r,50));order.push('b');}),withLaunchLock(dir,async()=>order.push('c'))]);assert.equal(order.length,3);assert.equal(order.indexOf('b'),order.indexOf('a')+1);
 await assert.rejects(withLaunchLock(dir,async()=>{throw Error('failure');}),/failure/);await withLaunchLock(dir,async()=>order.push('d'));assert.equal(order.at(-1),'d');
});
test('matching requires the same installation and mod set, not the same shortcut name',()=>{
 const a={installationPath:'/Applications/Slack.app',modIds:['a','b']};assert(sameSelection(a,{...a,modIds:['b','a']}));assert(!sameSelection(a,{...a,modIds:['a']}));assert(!sameSelection(a,{...a,installationPath:'/other/Slack.app'}));assert(!sameSelection(null,a));
});
test('shortcut launch uses its snapshot, coalesces duplicates, rejects a different session and does not change manager selection',{skip:process.platform!=='darwin'},async t=>{
 const dataDir=await temp(t),shortcut=path.join(dataDir,'Test.app');await fs.mkdir(shortcut);assert.equal(spawnSync('/usr/bin/xattr',['-w',shortcutAttribute,id,shortcut]).status,0);
 await writeJSON(profileFile(dataDir,id),{schemaVersion:1,id,name:'Test',appId:'slack',installationPath:'/Applications/Slack.app',modIds:['slack-triage'],shortcutPath:shortcut});
 let running=false,launches=0,shows=0;const setup={root,dataDir,helper:path.join(root,'package.json'),running:()=>false,inspect:async app=>({app,profile:path.join(dataDir,'profile')}),request:async(file,r)=>{if(!running)throw Error('offline');if(r.op==='queue'){shows++;return {};}return {running:true,pid:123,controlMode:'everyday',installation:{app:'/Applications/Slack.app'}};},launch:()=>{launches++;running=true;const e=new EventEmitter();e.exitCode=null;e.unref=()=>{};return e;}};
 const a=await new ClientManager(setup).init(),b=await new ClientManager(setup).init();await a.select({appId:'slack',modIds:[]});b.config.apps.slack.selected=[];
 await Promise.all([a.launchShortcut(id,shortcut),b.launchShortcut(id,shortcut)]);assert.equal(launches,1);assert.equal(shows,1);assert.deepEqual(a.config.apps.slack.selected,[]);
 await writeJSON(path.join(a.runtimeDir('slack'),'launch-selection.json'),{pid:124,installationPath:'/Applications/Slack.app',modIds:['slack-triage']});await assert.rejects(a.launchShortcut(id,shortcut),/different launch selection/);assert.equal(launches,1);
 await fs.rename(shortcut,path.join(dataDir,'Renamed.app'));running=false;await a.launchShortcut(id,path.join(dataDir,'Renamed.app'));assert.equal((await readProfile(dataDir,id)).name,'Renamed');assert.equal(launches,2);
});

test('creating a shortcut preserves its signature and writes the identity on the final bundle',{skip:process.platform!=='darwin'},async t=>{
 const dir=await temp(t),template=path.join(dir,'Template.app'),destination=path.join(dir,'Saved.app');
 await fs.mkdir(path.join(template,'Contents/MacOS'),{recursive:true});await fs.copyFile('/usr/bin/true',path.join(template,'Contents/MacOS/Stub'));
 await fs.writeFile(path.join(template,'Contents/Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>test.pme.shortcut</string><key>CFBundleExecutable</key><string>Stub</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
 assert.equal(spawnSync('/usr/bin/codesign',['--force','--sign','-',template]).status,0);
 const p=await createProfile({dataDir:dir,template,destination,appId:'slack',installationPath:'/Applications/Slack.app',modIds:['slack-triage'],clientPath:'/Applications/PimpMyElectron.app'});
 await assertShortcut(destination,p.id);assert.equal(spawnSync('/usr/bin/codesign',['--verify','--deep','--strict',destination]).status,0);
 await assert.rejects(createProfile({dataDir:dir,template,destination,appId:'slack',installationPath:'/Applications/Slack.app',modIds:['slack-triage']}),/already exists/);
 await fs.rename(destination,path.join(dir,'Renamed.app'));await assertShortcut(path.join(dir,'Renamed.app'),p.id);assert.equal((await listProfiles(dir)).length,1);
});
