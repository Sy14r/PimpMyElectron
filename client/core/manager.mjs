import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawn,spawnSync} from 'node:child_process';
import {validateCatalog,resolveSelection,moduleSelection} from './catalog.mjs';
import {discoverApps} from './discovery.mjs';import {readJSON,writeJSON} from './state.mjs';import {control} from './control.mjs';
import {listProfiles,readProfile,createProfile,updateProfile,profileFile,assertShortcut,withLaunchLock,sameSelection} from './shortcuts.mjs';
import {inspectInstallation,developmentProfile,readProfileOwners} from '../../src/slack-installation.mjs';
export class ClientManager {
 constructor({root,dataDir=path.join(os.homedir(),'Library/Application Support/PimpMyElectron'),node=process.execPath,helper=path.join(root,'bin/SlackTriage'),scan=discoverApps,inspect=inspectInstallation,request=control,launch=spawn,running=()=>spawnSync('/usr/bin/pgrep',['-x','Slack']).status===0}={}){
  Object.assign(this,{root,dataDir,node,helper,scan,inspect,request,launch,running});this.installations=[];this.verified=new Map();this.busy=false;this.launching=false;
 }
 async init(){
  this.clientVersion=await readJSON(path.join(this.root,'client/version.json'));
  this.modules=(await readJSON(path.join(this.root,'mods/runtime.json'))).modules;
  this.catalog=validateCatalog(await readJSON(path.join(this.root,'client/catalog.json')),this.modules);
  this.config=await readJSON(path.join(this.dataDir,'client.json'),{version:1,apps:{},extraPaths:[]});
  if(this.config?.version!==1||!this.config.apps||!Array.isArray(this.config.extraPaths))throw Error('Invalid client settings; existing data has been preserved.');
  for(const app of this.catalog.apps){const saved=this.config.apps[app.id];this.config.apps[app.id]={path:typeof saved?.path==='string'?saved.path:null,selected:resolveSelection(app,saved?.selected??app.mods.filter(m=>m.defaultEnabled).map(m=>m.id))};}
  return this;
 }
 app(id){const app=this.catalog.apps.find(a=>a.id===id);if(!app)throw Error('Unsupported app');return app;}
 runtimeDir(id){this.app(id);return path.join(this.dataDir,'runtime',id);}
 async save(){await writeJSON(path.join(this.dataDir,'client.json'),this.config);}
 async rescan(extra){
  if(extra){if(typeof extra!=='string'||!path.isAbsolute(extra)||!extra.endsWith('.app'))throw Error('Choose an application bundle.');
   // Verify before persisting manually chosen applications.
   await this.inspect(extra);if(!this.config.extraPaths.includes(extra))this.config.extraPaths.push(extra);
  }
  this.installations=await this.scan(this.catalog,{extraPaths:[...this.config.extraPaths,...Object.values(this.config.apps).map(a=>a.path).filter(Boolean)]});
  this.verified.clear();
  for(const install of this.installations){try{const verified=await this.inspect(install.path);this.verified.set(install.path,verified);install.distribution=verified.distribution;install.verified=true;}catch(error){install.verified=false;install.error=error.message;}}
  for(const app of this.catalog.apps){const pref=this.config.apps[app.id],matches=this.installations.filter(i=>i.appId===app.id&&i.verified);if(!matches.some(i=>i.path===pref.path))pref.path=matches[0]?.path||null;}
  await this.save();return this.snapshot();
 }
 async runtime(id){
  try{const state=await this.request(path.join(this.runtimeDir(id),'control.sock'),{op:'status'});
   return {running:state.running===true,pid:state.pid,mode:state.controlMode,appPath:state.installation?.app,version:state.installation?.version,error:state.featureError,
    helperRunning:state.helperRunning,signedIn:state.pages?.some(p=>p.signedIn)===true,modules:state.feature?.mods?.pages?.[0]?.modules||{},customApiRequests:state.feature?.customApi?.requests||0};
  }catch{return {running:false};}
 }
 async snapshot(){
  const apps=[];for(const app of this.catalog.apps){const pref=this.config.apps[app.id],runtime=await this.runtime(app.id);const installed=this.installations.filter(i=>i.appId===app.id);
   let profileConflict=false;const verified=this.verified.get(pref.path);
   if(verified){try{profileConflict=!!(await fs.stat(verified.profile).catch(()=>null))&&!readProfileOwners(path.join(this.runtimeDir(app.id),'profile-owner.json')).some(p=>p.profile===verified.profile);}catch{profileConflict=true;}}
   const plan=moduleSelection(app,pref.selected,this.modules),applied=await readJSON(path.join(this.runtimeDir(app.id),'mods.json'),null);
   apps.push({...app,shortcuts:(await listProfiles(this.dataDir)).filter(p=>p.appId===app.id),installations:installed,selectedPath:pref.path,selectedMods:pref.selected,runtime,profileConflict,
    changesPending:runtime.running&&JSON.stringify([...plan.disabled].sort())!==JSON.stringify([...(applied?.disabled||[])].sort())});
  }
  return {clientVersion:this.clientVersion.version,clientBuild:this.clientVersion.build,catalogVersion:this.catalog.version,apps,launching:this.launching,dataDir:this.dataDir};
 }
 async select({appId,modIds,installationPath}){
  const app=this.app(appId),pref=this.config.apps[appId];
  const selected=modIds!==undefined?resolveSelection(app,modIds):pref.selected;
  if(installationPath!==undefined){if(!this.installations.some(i=>i.appId===appId&&i.path===installationPath&&i.verified))throw Error('Choose a verified installation.');}
  this.config.apps[appId]={...pref,selected,...(installationPath!==undefined?{path:installationPath}:{})};
  await this.save();return this.snapshot();
 }
 async start(appId,selection){return withLaunchLock(this.dataDir,()=>this.startLocked(appId,selection));}
 async startLocked(appId,selection){
  const app=this.app(appId),pref=selection?{path:selection.installationPath,selected:resolveSelection(app,selection.modIds)}:this.config.apps[appId];if(!pref.selected.length)throw Error('Enable at least one mod before launching.');
  if((await this.runtime(appId)).running)throw Error('This app is already running with PME. Stop it before changing mods.');
  if(this.running())throw Error('Slack is already open. Quit it normally, then launch it here. PME will not close another Slack session.');
  if(!pref.path)throw Error('Choose an installed Slack application first.');
  const installation=await this.inspect(pref.path);this.verified.set(pref.path,installation);
  const dir=this.runtimeDir(appId);const owners=readProfileOwners(path.join(dir,'profile-owner.json'));
  if(await fs.stat(installation.profile).catch(()=>null))if(!owners.some(p=>p.profile===installation.profile))throw Error('An existing PME test profile was found. Use “Import existing setup” to bring over its ownership record and settings.');
  await fs.access(this.helper);await fs.mkdir(dir,{recursive:true,mode:0o700});
  if(Buffer.byteLength(path.join(dir,'control.sock'))>=104)throw Error('Your home-folder path is too long for the local controller socket.');
  await writeJSON(path.join(dir,'mods.json'),moduleSelection(app,pref.selected,this.modules));
  const log=await fs.open(path.join(dir,'launcher.log'),'w',0o600);this.launching=true;
  try{
   const env=cleanEnvironment({...process.env,PME_SLACK_APP:installation.app,PME_DATA_DIR:dir,PME_HELPER_PATH:this.helper});
   const child=this.launch(this.node,[path.join(this.root,'scripts/dev.mjs')],{cwd:this.root,env,detached:true,stdio:['ignore',log.fd,log.fd]});
   let failure=null;child.once('error',()=>{failure='Could not start the bundled runtime.';});child.unref();
   for(let attempt=0;attempt<80;attempt++){
    await new Promise(resolve=>setTimeout(resolve,250));if(failure)throw Error(failure);
    const state=await this.runtime(appId);if(state.running){if(state.mode!=='everyday')throw Error('The launcher did not enter everyday mode.');await writeJSON(path.join(dir,'launch-selection.json'),{pid:state.pid,installationPath:installation.app,modIds:pref.selected});return this.snapshot();}
    if(child.exitCode!==null&&child.exitCode!==undefined)throw Error('Slack could not start. Check the launch log from About → Open data folder.');
   }
   throw Error('Slack is taking longer than expected to start. Status will keep updating; check the launch log if it remains closed.');
  }finally{this.launching=false;await log.close();}
 }
 async createShortcut(appId,destination){
  const app=this.app(appId),pref=this.config.apps[appId];if(!pref.path||!pref.selected.length)throw Error('Choose an installation and enable at least one mod.');
  await this.inspect(pref.path);const resources=path.resolve(this.root,'..'),template=path.resolve(resources,'../Helpers/SlackLauncher.app');await fs.access(template);
  await createProfile({dataDir:this.dataDir,template,appId,installationPath:pref.path,modIds:resolveSelection(app,pref.selected),destination,clientPath:path.resolve(resources,'../..')});return this.snapshot();
 }
 async updateShortcut(appId,id){const p=await readProfile(this.dataDir,id);if(p.appId!==appId)throw Error('Wrong app for shortcut');const pref=this.config.apps[appId];if(!pref.path||!pref.selected.length)throw Error('Choose an installation and enable at least one mod.');await this.inspect(pref.path);await updateProfile(this.dataDir,id,{installationPath:pref.path,modIds:resolveSelection(this.app(appId),pref.selected)});return this.snapshot();}
 async shortcutLocation(id,newPath){const p=await readProfile(this.dataDir,id);await assertShortcut(newPath,id);await updateProfile(this.dataDir,id,{shortcutPath:newPath,name:path.basename(newPath,'.app')});return this.snapshot();}
 async launchShortcut(id,shortcutPath){
  const p=await readProfile(this.dataDir,id);await assertShortcut(shortcutPath,id);
  if(p.shortcutPath!==shortcutPath)await this.shortcutLocation(id,shortcutPath);
  resolveSelection(this.app(p.appId),p.modIds);
  return withLaunchLock(this.dataDir,async()=>{
   const state=await this.runtime(p.appId);
   if(state.running){const active=await readJSON(path.join(this.runtimeDir(p.appId),'launch-selection.json'),null);
    if(state.mode!=='everyday'||active?.pid!==state.pid||!sameSelection(active,p))throw Error('Slack is already running with a different launch selection. Stop it from PME before using this shortcut.');
    const deadline=Date.now()+12000;while(true){try{await this.show(p.appId,'queue');return;}catch(error){if(Date.now()>=deadline)throw error;await new Promise(r=>setTimeout(r,250));}}
   }
   await this.startLocked(p.appId,p);
  });
 }
 async stop(appId){const dir=this.runtimeDir(appId),state=await this.runtime(appId);if(!state.running)return this.snapshot();if(state.mode!=='everyday')throw Error('This session was not started in everyday mode. Stop it from its original launcher.');await this.request(path.join(dir,'control.sock'),{op:'stop'});for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,150));if(!(await this.runtime(appId)).running)break;}return this.snapshot();}
 async show(appId,op){if(!['queue','preferences','stock'].includes(op))throw Error('Unsupported view');const state=await this.runtime(appId);if(!state.running||state.mode!=='everyday')throw Error('Launch the app with PME first.');await this.request(path.join(this.runtimeDir(appId),'shell.sock'),{op});return this.snapshot();}
 async importSetup(appId,source){
  this.app(appId);if((await this.runtime(appId)).running)throw Error('Stop the PME-managed app before importing settings.');
  if(!path.isAbsolute(source))throw Error('Choose your existing PME project folder.');
  const nested=path.join(source,'.lab/dev');if(await fs.stat(nested).catch(()=>null))source=nested;
  const owners=readProfileOwners(path.join(source,'profile-owner.json'));if(!owners.length)throw Error('That folder does not contain an existing PME setup.');
  const allowed=new Set(['direct-download','app-store'].map(d=>developmentProfile(d)));
  if(owners.some(o=>!allowed.has(o.profile)))throw Error('The ownership record belongs to a different Mac. Import on the Mac where the setup was created.');
  const dir=this.runtimeDir(appId);await fs.mkdir(dir,{recursive:true,mode:0o700});
  const imported=[];
  for(const name of ['triage-state.json','native-appearance.json']){
   const sourceFile=path.join(source,name),destination=path.join(dir,name);if(await fs.stat(destination).catch(()=>null))continue;
   const stat=await fs.lstat(sourceFile).catch(()=>null);if(!stat)continue;if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)throw Error('Invalid setup file.');
   imported.push([destination,await readJSON(sourceFile)]);
  }
  const ownerFile=path.join(dir,'profile-owner.json'),merged=new Map(readProfileOwners(ownerFile).map(o=>[o.profile,o]));for(const owner of owners)merged.set(owner.profile,owner);
  for(const [file,value] of imported)await writeJSON(file,value);
  await writeJSON(ownerFile,{schemaVersion:2,profiles:[...merged.values()]});
  return this.snapshot();
 }
 async dispatch(request){
  if(!request||typeof request!=='object'||Array.isArray(request))throw Error('Invalid request');
  if(request.op==='status')return this.snapshot();
  if(this.busy)throw Error('Please wait for the current action to finish.');this.busy=true;
  try{switch(request.op){case 'scan':return await this.rescan();case 'add-app':return await this.rescan(request.path);case 'shortcut-create':return await this.createShortcut(request.appId,request.path);case 'shortcut-update':return await this.updateShortcut(request.appId,request.profileId);case 'shortcut-location':return await this.shortcutLocation(request.profileId,request.path);case 'shortcut-forget':await fs.rm(profileFile(this.dataDir,request.profileId),{force:true});return this.snapshot();case 'select':return await this.select(request);case 'launch':return await this.start(request.appId);case 'stop':return await this.stop(request.appId);case 'show':return await this.show(request.appId,request.view);case 'import':return await this.importSetup(request.appId,request.path);default:throw Error('Unsupported client action');}}
  finally{this.busy=false;}
 }
}
export function cleanEnvironment(env){return Object.fromEntries(Object.entries(env).filter(([key])=>!key.startsWith('DYLD_')&&!['NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE'].includes(key)));}
