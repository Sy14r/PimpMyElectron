// Validate the built runtime without reading live Slack state or starting Slack.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const app=path.resolve(process.argv[2]||'dist/PimpMyElectron.app'),resources=path.join(app,'Contents/Resources'),runtime=path.join(resources,'runtime');
const expectedLicense=await fs.readFile(new URL('../LICENSE',import.meta.url),'utf8');
const clientVersion=JSON.parse(await fs.readFile(path.join(runtime,'client/version.json'),'utf8'));
for(const bundle of [app,...['SlackLauncher.app','SpotifyLauncher.app','SpotifyMenu.app'].map(name=>path.join(app,'Contents/Helpers',name))]){
 const notices=path.join(bundle,'Contents/Resources');
 assert.equal(await fs.readFile(path.join(notices,'LICENSE.txt'),'utf8'),expectedLicense,'Every distributable app must retain the complete PME license');
 assert.match(await fs.readFile(path.join(notices,'COPYING.txt'),'utf8'),/This Source Code Form is subject to the terms of the Mozilla Public/);
 assert.ok((await fs.readFile(path.join(notices,'SOURCE.txt'),'utf8')).includes(`https://github.com/Sy14r/PimpMyElectron/tree/client-v${clientVersion.version}`),'Source notice must identify the built release');
}
const {ClientManager}=await import(pathToFileURL(path.join(runtime,'client/core/manager.mjs')));
const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-bundle-smoke-'));
try{
 const manager=await new ClientManager({root:runtime,dataDir,scan:async()=>[]}).init();const snapshot=await manager.rescan();assert.equal(snapshot.apps[0].id,'slack');assert.deepEqual(snapshot.apps[0].selectedMods,['slack-triage']);
 for(const file of ['src/live-runtime.mjs','src/mod-loader.mjs'])await import(pathToFileURL(path.join(runtime,file)));
 const modules=JSON.parse(await fs.readFile(path.join(runtime,'mods/runtime.json'),'utf8'));for(const mod of modules.modules){if(mod.entry)await fs.access(path.join(runtime,mod.entry));}
 const {createProfile,assertShortcut}=await import(pathToFileURL(path.join(runtime,'client/core/shortcuts.mjs')));
 for(const [id,template] of [['slack','SlackLauncher.app'],['spotify','SpotifyLauncher.app']]){
  const templatePath=path.resolve(resources,'../Helpers',template);
  assert.notDeepEqual(await fs.readFile(path.join(resources,'AppIcon.icns')),await fs.readFile(path.join(templatePath,'Contents/Resources/AppIcon.icns')),id+' shortcut must carry its app-specific icon');
  const shortcut=await createProfile({dataDir,template:templatePath,destination:path.join(dataDir,id+'-Smoke.app'),appId:id,installationPath:id==='slack'?'/Applications/Slack.app':'/Applications/Spotify.app',modIds:[id==='slack'?'slack-triage':'spotify-menu'],clientPath:app});await assertShortcut(shortcut.shortcutPath,shortcut.id);
 }
 const spotifyBinary=path.resolve(resources,'../Helpers/SpotifyMenu.app/Contents/MacOS/SpotifyMenu');await fs.access(spotifyBinary);
 const permissionCheck=spawnSync(spotifyBinary,['--check-signature'],{encoding:'utf8',timeout:5000});assert.equal(permissionCheck.status,0,permissionCheck.stderr);assert.equal(permissionCheck.stdout.trim(),'automation-entitled');
 const output=await new Promise((resolve,reject)=>{
  const child=spawn(path.join(resources,'bin/node'),[path.join(runtime,'client/service.mjs')],{env:{...process.env,PME_CLIENT_DATA_DIR:path.join(dataDir,'service')},stdio:['pipe','pipe','pipe']});let text='',errors='';
  const timeout=setTimeout(()=>{child.kill();reject(Error('Bundled service timed out'));},10000);
  child.stdout.on('data',chunk=>text+=chunk);child.stderr.on('data',chunk=>errors+=chunk);child.on('error',reject);child.on('close',code=>{clearTimeout(timeout);code===0?resolve(text):reject(Error(errors||'Service failed'));});child.stdin.end(JSON.stringify({id:1,op:'status'})+'\n');
 });const response=JSON.parse(output);assert.equal(response.ok,true);assert.equal(response.result.clientVersion,snapshot.clientVersion);
 // Exercise V8 optimized code and executable WebAssembly under the signed runtime.
 assert.equal(new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]))).exports.constructor,undefined);
 console.log(`Bundled client ${snapshot.clientVersion}: catalog, runtime imports, stdio service, signed shortcut copy, and V8 smoke passed.`);
}finally{await fs.rm(dataDir,{recursive:true,force:true});}
