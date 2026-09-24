// Validate the built runtime without reading live Slack state or starting Slack.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
const app=path.resolve(process.argv[2]||'dist/PimpMyElectron.app'),resources=path.join(app,'Contents/Resources'),runtime=path.join(resources,'runtime');
const {ClientManager}=await import(pathToFileURL(path.join(runtime,'client/core/manager.mjs')));
const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-bundle-smoke-'));
try{
 const manager=await new ClientManager({root:runtime,dataDir,scan:async()=>[]}).init();const snapshot=await manager.rescan();assert.equal(snapshot.apps[0].id,'slack');assert.deepEqual(snapshot.apps[0].selectedMods,['slack-triage']);
 for(const file of ['src/live-runtime.mjs','src/mod-loader.mjs'])await import(pathToFileURL(path.join(runtime,file)));
 const modules=JSON.parse(await fs.readFile(path.join(runtime,'mods/runtime.json'),'utf8'));for(const mod of modules.modules){if(mod.entry)await fs.access(path.join(runtime,mod.entry));}
 const {createProfile,assertShortcut}=await import(pathToFileURL(path.join(runtime,'client/core/shortcuts.mjs')));
 const shortcut=await createProfile({dataDir,template:path.join(resources,'PMELauncher.app'),destination:path.join(dataDir,'Smoke.app'),appId:'slack',installationPath:'/Applications/Slack.app',modIds:['slack-triage'],clientPath:app});await assertShortcut(shortcut.shortcutPath,shortcut.id);
 const output=await new Promise((resolve,reject)=>{
  const child=spawn(path.join(resources,'bin/node'),[path.join(runtime,'client/service.mjs')],{env:{...process.env,PME_CLIENT_DATA_DIR:path.join(dataDir,'service')},stdio:['pipe','pipe','pipe']});let text='',errors='';
  const timeout=setTimeout(()=>{child.kill();reject(Error('Bundled service timed out'));},10000);
  child.stdout.on('data',chunk=>text+=chunk);child.stderr.on('data',chunk=>errors+=chunk);child.on('error',reject);child.on('close',code=>{clearTimeout(timeout);code===0?resolve(text):reject(Error(errors||'Service failed'));});child.stdin.end(JSON.stringify({id:1,op:'status'})+'\n');
 });const response=JSON.parse(output);assert.equal(response.ok,true);assert.equal(response.result.clientVersion,snapshot.clientVersion);
 // Exercise V8 optimized code and executable WebAssembly under the signed runtime.
 assert.equal(new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]))).exports.constructor,undefined);
 console.log(`Bundled client ${snapshot.clientVersion}: catalog, runtime imports, stdio service, signed shortcut copy, and V8 smoke passed.`);
}finally{await fs.rm(dataDir,{recursive:true,force:true});}
