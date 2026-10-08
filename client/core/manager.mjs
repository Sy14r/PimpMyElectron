import {ModSources} from './mod-sources.mjs';
import {submitFeedback} from './feedback.mjs';
import {releaseHistory} from './releases.mjs';
import {assertNoUpdate,prepareUpdate,stopForUpdate,waitForUpdate,clearUpdate} from './update-gate.mjs';
import {inspectSpotify,waitForSpotifyHelper} from './spotify.mjs';
import {supportedApps} from './app-support.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawn,spawnSync} from 'node:child_process';
import {validateCatalog,resolveSelection,moduleSelection,hostPlatform,modCompatibility} from './catalog.mjs';
import {discoverApps} from './discovery.mjs';import {readJSON,writeJSON} from './state.mjs';import {control} from './control.mjs';
import {listProfiles,readProfile,createProfile,updateProfile,profileFile,assertShortcut,withLaunchLock,sameSelection} from './shortcuts.mjs';
import {inspectInstallation,developmentProfile,readProfileOwners} from '../../src/slack-installation.mjs';
import {CONFIGURABLE_MOD_IDS,ModSettings,defaultModSettings,validateModSettings} from '../../src/mod-settings.mjs';
const legacySidebarMod='slack-sidebar-peek',sidebarProductivityMod='slack-sidebar-productivity';
function migrateSidebarSelection(ids,{layoutImpliesSidebar=false}={}){const input=Array.isArray(ids)?ids:[],next=input.filter(id=>id!==legacySidebarMod);if((input.includes(legacySidebarMod)||(layoutImpliesSidebar&&input.includes('slack-layout')))&&!next.includes(sidebarProductivityMod))next.push(sidebarProductivityMod);return next;}
export class ClientManager {
 constructor({root,dataDir=path.join(os.homedir(),'Library/Application Support/PimpMyElectron'),node=process.execPath,helper=path.join(root,'bin/SlackTriage'),scan=discoverApps,inspect=inspectInstallation,spotifyInspect=inspectSpotify,spotifyHelper=path.resolve(root,'../../Helpers/SpotifyMenu.app/Contents/MacOS/SpotifyMenu'),request=control,launch=spawn,spotifyRunning=()=>spawnSync('/usr/bin/pgrep',['-x','Spotify']).status===0,running=()=>spawnSync('/usr/bin/pgrep',['-x','Slack']).status===0}={}){
  Object.assign(this,{root,dataDir,node,helper,scan,inspect,spotifyInspect,spotifyHelper,request,launch,running,spotifyRunning});this.installations=[];this.verified=new Map();this.busy=false;this.launching=false;
 }
 async init(){
  this.clientVersion=await readJSON(path.join(this.root,'client/version.json'));
  this.modules=(await readJSON(path.join(this.root,'mods/runtime.json'))).modules;
  this.bundledCatalog=validateCatalog(await readJSON(path.join(this.root,'client/catalog.json')),this.modules);
  this.sources=await new ModSources(this.dataDir).load();await this.sources.refresh();
  await this.reloadCatalog();
  this.config=await readJSON(path.join(this.dataDir,'client.json'),{version:1,apps:{},extraPaths:[]});
  if(this.config?.version!==1||!this.config.apps||!Array.isArray(this.config.extraPaths))throw Error('Invalid client settings; existing data has been preserved.');
  const migrateSidebar=this.config.sidebarProductivityMigrated!==true;let legacySlack=null;
  for(const app of this.catalog.apps){const saved=this.config.apps[app.id],original=saved?.selected??app.mods.filter(m=>m.defaultEnabled).map(m=>m.id),requested=app.id==='slack'?migrateSidebarSelection(original,{layoutImpliesSidebar:migrateSidebar}):original;if(app.id==='slack')legacySlack={hadLayout:original.includes('slack-layout'),hadPeek:original.includes(legacySidebarMod)};const known=requested.filter(id=>app.mods.some(m=>m.id===id));this.config.apps[app.id]={path:typeof saved?.path==='string'?saved.path:null,selected:resolveSelection(app,known.filter(id=>modCompatibility(app,id).compatible)),...(app.id==='slack'?{companion:saved?.companion!==false}:{})};}
  if(migrateSidebar){const store=await new ModSettings(path.join(this.runtimeDir('slack'),'mod-settings.json')).load();if((legacySlack?.hadLayout||legacySlack?.hadPeek)&&!store.mods[sidebarProductivityMod])await store.configure(sidebarProductivityMod,{organizerEnabled:legacySlack.hadLayout,peekEnabled:legacySlack.hadPeek,openAction:true,replyAction:true});for(const profile of await listProfiles(this.dataDir)){if(profile.appId!=='slack')continue;const modIds=migrateSidebarSelection(profile.modIds,{layoutImpliesSidebar:true});if(JSON.stringify(modIds)!==JSON.stringify(profile.modIds))await updateProfile(this.dataDir,profile.id,{modIds});}this.config.sidebarProductivityMigrated=true;await this.save();}
  return this;
 }
 async reloadCatalog(){
  this.catalog=structuredClone(this.bundledCatalog);for(const mod of await this.sources.mods())this.catalog.apps.find(a=>a.id===mod.appId)?.mods.push(mod);
  if(this.config)for(const app of this.catalog.apps){const saved=this.config.apps[app.id];if(saved)saved.selected=resolveSelection(app,saved.selected.filter(id=>modCompatibility(app,id).compatible));}
 }
 async sourceAction(request){return withLaunchLock(this.dataDir,async()=>{
  await assertNoUpdate(this.dataDir);await this.sources.load();
  if(request.op==='source-add')await this.sources.add(request.path);
  else if(request.op==='source-refresh')await this.sources.refresh();
  else if(request.op==='source-install')await this.sources.install(request.sourceId,request.digest);
  else if(request.op==='source-rollback')await this.sources.rollback(request.sourceId);
  else if(request.op==='source-remove')await this.sources.remove(request.sourceId);
  await this.reloadCatalog();await this.save();return this.snapshot();
 });}
 app(id){const app=this.catalog.apps.find(a=>a.id===id);if(!app)throw Error('Unsupported app');return app;}
 runtimeDir(id){this.app(id);return path.join(this.dataDir,'runtime',id);}
 async modSettings(id){const store=await new ModSettings(path.join(this.runtimeDir(id),'mod-settings.json')).load();return {values:Object.fromEntries(this.app(id).mods.map(mod=>[mod.id,store.get(mod.id)])),error:store.error};}
 async save(){await writeJSON(path.join(this.dataDir,'client.json'),this.config);}
 async inspectApp(candidate,appId){
  if(appId==='spotify')return this.spotifyInspect(candidate);
  if(appId==='slack')return this.inspect(candidate);
  const found=await this.scan(this.catalog,{roots:[],extraPaths:[candidate],metadataSearch:false});
  const app=found.find(a=>a.path===candidate);if(!app)throw Error('Choose a supported official application.');return this.inspectApp(candidate,app.appId);
 }
 async rescan(extra){
  if(extra){if(typeof extra!=='string'||!path.isAbsolute(extra)||!extra.endsWith('.app'))throw Error('Choose an application bundle.');
   // Verify before persisting manually chosen applications.
   await this.inspectApp(extra);if(!this.config.extraPaths.includes(extra))this.config.extraPaths.push(extra);
  }
  this.installations=await this.scan(this.catalog,{extraPaths:[...this.config.extraPaths,...Object.values(this.config.apps).map(a=>a.path).filter(Boolean)]});
  this.verified.clear();
  for(const install of this.installations){try{const verified=await this.inspectApp(install.path,install.appId);this.verified.set(install.path,verified);install.distribution=verified.distribution;install.verified=true;}catch(error){install.verified=false;install.error=error.message;}}
  for(const app of this.catalog.apps){const pref=this.config.apps[app.id],matches=this.installations.filter(i=>i.appId===app.id&&i.verified);if(!matches.some(i=>i.path===pref.path))pref.path=matches[0]?.path||null;}
  await this.save();return this.snapshot();
 }
 async runtime(id,options){
  try{const state=await this.request(path.join(this.runtimeDir(id),'control.sock'),{op:'status'},options);
   if(id==='spotify')return state.adapter==='spotify'?{running:true,pid:state.pid,mode:'everyday',helperRunning:true,mods:state.mods??['spotify-menu'],cameraStatus:state.cameraStatus,cameraOwnsPause:state.cameraOwnsPause,appRunning:state.appRunning,signedIn:true,error:state.error,appPath:state.appPath}: {running:false};
   return {running:state.running===true,pid:state.pid,mode:state.controlMode,appPath:state.installation?.app,version:state.installation?.version,error:state.featureError,
    externalHelpers:state.feature?.mods?.helpers||[],helperRunning:state.helperRunning,triageEnabled:state.feature?.liveUI!==false,companionAvailable:state.feature?.companion===true,companionEnabled:state.helperRunning===true&&state.feature?.companion===true,signedIn:state.pages?.some(p=>p.signedIn)===true,modules:state.feature?.mods?.pages?.[0]?.modules||{},customApiRequests:state.feature?.customApi?.requests||0};
  }catch{return {running:false};}
 }
 async snapshot(){
  const apps=[],shortcuts=await listProfiles(this.dataDir);for(const app of this.catalog.apps){const pref=this.config.apps[app.id],runtime=await this.runtime(app.id);const installed=this.installations.filter(i=>i.appId===app.id);
   let profileConflict=false;const verified=this.verified.get(pref.path);
   if(verified?.profile){try{profileConflict=!!(await fs.stat(verified.profile).catch(()=>null))&&!readProfileOwners(path.join(this.runtimeDir(app.id),'profile-owner.json')).some(p=>p.profile===verified.profile);}catch{profileConflict=true;}}
   const plan=moduleSelection(app,pref.selected,this.modules),applied=await readJSON(path.join(this.runtimeDir(app.id),'mods.json'),null);
   const external=await readJSON(path.join(this.runtimeDir(app.id),'external-mods.json'),{packages:[]});
   const planned=app.mods.filter(m=>m.source&&pref.selected.includes(m.id)).map(m=>m.id+':'+m.source.digest).sort();
   const appliedExternal=external.packages.map(m=>m.id+':'+m.digest).sort();
   const modSettings=app.id==='slack'?await this.modSettings(app.id):{values:{},error:null};
   apps.push({...app,mods:app.mods.map(m=>{const {manifest,packageRoot,packagePath,...display}=m;return {...display,...modCompatibility(app,m.id)};}),shortcuts:shortcuts.filter(p=>p.appId===app.id),installations:installed,selectedPath:pref.path,selectedMods:pref.selected,...(app.id==='slack'?{companionEnabled:pref.companion!==false,settingsUndoAvailable:!!await fs.stat(path.join(this.runtimeDir('slack'),'mod-settings-import-backup.json')).catch(()=>null)}:{}),modSettings:modSettings.values,modSettingsError:modSettings.error,runtime,profileConflict,
    changesPending:runtime.running&&(JSON.stringify(planned)!==JSON.stringify(appliedExternal)|| (app.id==='spotify'?JSON.stringify([...pref.selected].sort())!==JSON.stringify([...(runtime.mods||[])].sort()):JSON.stringify([...plan.disabled].sort())!==JSON.stringify([...(applied?.disabled||[])].sort())))});
  }
  return {platform:hostPlatform(),clientVersion:this.clientVersion.version,clientBuild:this.clientVersion.build,catalogVersion:this.catalog.version,sources:await this.sources.snapshot(),apps,launching:this.launching,dataDir:this.dataDir};
 }
 async select({appId,modIds,installationPath}){
  const app=this.app(appId),pref=this.config.apps[appId];
  const selected=modIds!==undefined?resolveSelection(app,modIds):pref.selected;
  if(installationPath!==undefined){if(!this.installations.some(i=>i.appId===appId&&i.path===installationPath&&i.verified))throw Error('Choose a verified installation.');}
  this.config.apps[appId]={...pref,selected,...(installationPath!==undefined?{path:installationPath}:{})};
  await this.save();return this.snapshot();
 }
 async configureMod({appId,modId,patch}){
  if(appId!=='slack'||!this.app(appId).mods.some(mod=>mod.id===modId&&Array.isArray(mod.settings)))throw Error('This mod has no configurable settings');
  const state=await this.runtime(appId);
  if(state.running)await this.request(path.join(this.runtimeDir(appId),'control.sock'),{op:'mod-settings',modId,patch});
  else {const store=await new ModSettings(path.join(this.runtimeDir(appId),'mod-settings.json')).load();await store.configure(modId,patch);}
  return this.snapshot();
 }
 settingsTransfer(values,enabledMods=this.config.apps.slack.selected){return {format:'pme-slack-mod-settings',version:1,appId:'slack',enabledMods:CONFIGURABLE_MOD_IDS.filter(id=>enabledMods.includes(id)),settings:Object.fromEntries(CONFIGURABLE_MOD_IDS.map(id=>[id,values[id]||defaultModSettings(id)]))};}
 parseSettingsTransfer(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>30000)throw Error('Settings import must be a JSON document no larger than 30 KB.');
  let raw;try{raw=JSON.parse(text);}catch{throw Error('Settings import is not valid JSON.');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.format!=='pme-slack-mod-settings'||raw.version!==1||raw.appId!=='slack'||!Array.isArray(raw.enabledMods)||!raw.settings||typeof raw.settings!=='object'||Array.isArray(raw.settings))throw Error('This is not a supported PME Slack settings export.');
  if(Object.keys(raw).some(key=>!['format','version','appId','enabledMods','settings'].includes(key)))throw Error('Settings import contains unsupported top-level data.');
  if(raw.enabledMods.length>CONFIGURABLE_MOD_IDS.length||raw.enabledMods.some(id=>typeof id!=='string'||!CONFIGURABLE_MOD_IDS.includes(id))||new Set(raw.enabledMods).size!==raw.enabledMods.length)throw Error('Settings import contains an invalid enabled-mod selection.');
  const unknown=Object.keys(raw.settings).filter(id=>!CONFIGURABLE_MOD_IDS.includes(id));if(unknown.length)throw Error(`Settings import contains unknown mod settings: ${unknown.join(', ')}`);
  const settings={};for(const id of CONFIGURABLE_MOD_IDS){const value=raw.settings[id]??{},allowed=new Set(Object.keys(defaultModSettings(id)));if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.has(key)))throw Error(`Settings import contains unsupported fields for ${id}.`);settings[id]=validateModSettings(id,value);}
  return {settings,enabledMods:resolveSelection(this.app('slack'),raw.enabledMods)};
 }
 async settingsExport(){const current=await this.modSettings('slack');if(current.error)throw Error(current.error);return {text:JSON.stringify(this.settingsTransfer(current.values),null,2)};}
 async settingsDiff(next){const loaded=await this.modSettings('slack');if(loaded.error)throw Error(loaded.error);const changes=[];for(const id of CONFIGURABLE_MOD_IDS){if(next.enabledMods.includes(id)!==this.config.apps.slack.selected.includes(id))changes.push({modId:id,key:'enabled'});for(const key of Object.keys(next.settings[id]))if(JSON.stringify(next.settings[id][key])!==JSON.stringify(loaded.values[id]?.[key]))changes.push({modId:id,key});}return {changes,total:changes.length};}
 async settingsPreview(text){return this.settingsDiff(this.parseSettingsTransfer(text));}
 async applySettingsTransfer(next,{backup=true}={}){
  const file=path.join(this.runtimeDir('slack'),'mod-settings.json'),store=await new ModSettings(file).load();if(store.error)throw Error(store.error);const previous={settings:Object.fromEntries(CONFIGURABLE_MOD_IDS.map(id=>[id,store.get(id)])),enabledMods:[...this.config.apps.slack.selected]};
  if(backup)await writeJSON(path.join(this.runtimeDir('slack'),'mod-settings-import-backup.json'),this.settingsTransfer(previous.settings,previous.enabledMods));
  store.mods=structuredClone(next.settings);const preserved=this.config.apps.slack.selected.filter(id=>!CONFIGURABLE_MOD_IDS.includes(id));this.config.apps.slack.selected=resolveSelection(this.app('slack'),[...preserved,...next.enabledMods]);await store.save();await this.save();const state=await this.runtime('slack');
  if(state.running)try{for(const id of CONFIGURABLE_MOD_IDS)await this.request(path.join(this.runtimeDir('slack'),'control.sock'),{op:'mod-settings',modId:id,patch:next.settings[id]});}catch(error){store.mods=structuredClone(previous.settings);this.config.apps.slack.selected=previous.enabledMods;await store.save();await this.save();for(const id of CONFIGURABLE_MOD_IDS)await this.request(path.join(this.runtimeDir('slack'),'control.sock'),{op:'mod-settings',modId:id,patch:previous.settings[id]}).catch(()=>{});throw Error(`Settings were restored because live apply failed: ${error.message}`);}
  return this.snapshot();
 }
 async settingsImport(text){return this.applySettingsTransfer(this.parseSettingsTransfer(text));}
 async settingsUndo(){const file=path.join(this.runtimeDir('slack'),'mod-settings-import-backup.json'),backup=await fs.readFile(file,'utf8').catch(()=>null);if(!backup)throw Error('There is no settings import to undo.');await this.applySettingsTransfer(this.parseSettingsTransfer(backup),{backup:false});await fs.rm(file,{force:true});return this.snapshot();}
 async configureCompanion({appId,enabled}){
  if(appId!=='slack'||typeof enabled!=='boolean')throw Error('Invalid Slack Companion setting');
  const pref=this.config.apps.slack;pref.companion=enabled;await this.save();
  const dir=this.runtimeDir('slack');await fs.mkdir(dir,{recursive:true,mode:0o700});await writeJSON(path.join(dir,'companion.json'),{enabled});
  const state=await this.runtime('slack');if(state.running)await this.request(path.join(dir,'control.sock'),{op:'companion',enabled});
  return this.snapshot();
 }
 async start(appId,selection){return withLaunchLock(this.dataDir,()=>this.startLocked(appId,selection));}
 async startLocked(appId,selection){
  await assertNoUpdate(this.dataDir);
  const app=this.app(appId),pref=selection?{path:selection.installationPath,selected:resolveSelection(app,appId==='slack'?migrateSidebarSelection(selection.modIds):selection.modIds)}:this.config.apps[appId];resolveSelection(app,pref.selected);if(!pref.selected.length)throw Error('Enable at least one mod before launching.');
  if((await this.runtime(appId)).running)throw Error('This app is already running with PME. Stop it before changing mods.');
  if(appId==='spotify')return this.startSpotify(pref);
  if(this.running())throw Error('Slack is already open. Quit it normally, then launch it here. PME will not close another Slack session.');
  if(!pref.path)throw Error('Choose an installed Slack application first.');
  const installation=await this.inspect(pref.path);this.verified.set(pref.path,installation);
  const dir=this.runtimeDir(appId);const owners=readProfileOwners(path.join(dir,'profile-owner.json'));
  if(await fs.stat(installation.profile).catch(()=>null))if(!owners.some(p=>p.profile===installation.profile))throw Error('An existing PME test profile was found. Use “Import existing setup” to bring over its ownership record and settings.');
  const externalPlan=await this.sources.launchPlan(app,pref.selected);
  await fs.access(this.helper);await fs.mkdir(dir,{recursive:true,mode:0o700});
  if(Buffer.byteLength(path.join(dir,'control.sock'))>=104)throw Error('Your home-folder path is too long for the local controller socket.');
  await writeJSON(path.join(dir,'external-mods.json'),externalPlan);
  await writeJSON(path.join(dir,'companion.json'),{enabled:this.config.apps.slack.companion!==false});
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
 async startSpotify(pref){
  if(!pref.path)throw Error('Choose an installed Spotify application first.');
  const installation=await this.inspectApp(pref.path,'spotify'),dir=this.runtimeDir('spotify');
  const binary=this.spotifyHelper;await fs.access(binary);
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  if(Buffer.byteLength(path.join(dir,'control.sock'))>=104)throw Error('Your home-folder path is too long for the local controller socket.');
  const log=await fs.open(path.join(dir,'launcher.log'),'a',0o600);this.launching=true;
  const launchLog=message=>log.write(`[${new Date().toISOString()}] ${message}\n`);
  try{
   await launchLog('Starting Spotify Menu Player.');
   // Reuse the private inherited-pipe host when only the widget was stopped.
   const bridgePath=path.join(dir,'bridge.sock');
   if(pref.selected.includes('spotify-menu')){
   let bridge=await this.request(bridgePath,{op:'status'}).catch(()=>null);
   if(bridge?.adapter!=='spotify'||bridge?.mode!=='pipe'){
    if(this.spotifyRunning())throw Error('Quit Spotify normally, then launch it from PME to enable Mini Library.');
    const host=this.launch(this.node,[path.join(this.root,'scripts/spotify-host.mjs'),'--app',installation.app,'--data-dir',dir],{cwd:this.root,env:cleanEnvironment(process.env),detached:true,stdio:['ignore',log.fd,log.fd]});
    let hostError=false;host.once('error',()=>{hostError=true;});host.unref();
    for(let i=0;i<100;i++){
     await new Promise(r=>setTimeout(r,200));
     if(hostError||host.exitCode!=null)throw Error('The Spotify library bridge could not start. Check its launch log in the PME data folder.');
     bridge=await this.request(bridgePath,{op:'status'}).catch(()=>null);
     if(bridge?.adapter==='spotify'&&bridge.mode==='pipe'&&bridge.ready)break;
    }
   }
   if(!bridge?.ready)throw Error('Spotify is still starting or needs sign-in. Wait for its Home view, then launch again from PME.');
   }
   // Camera Pause alone uses Automation and can attach to an ordinary Spotify session.
   // Launch as an application; macOS attributes nested-helper consent to PME.
   await launchLog('Requesting menu helper launch through macOS; waiting up to 60 seconds for its control endpoint.');
   const child=this.launch('/usr/bin/open',['-g','-n','-a',path.resolve(binary,'../../..'),'--args','--data-dir',dir,'--spotify-app',installation.app,'--mods',pref.selected.join(',')],{cwd:this.root,env:cleanEnvironment(process.env),detached:true,stdio:['ignore',log.fd,log.fd]});
   let failure=null;child.once('error',error=>{failure=error.code||error.message;});child.unref();
   const state=await waitForSpotifyHelper({status:()=>this.runtime('spotify'),launchFailure:()=>failure||(child.exitCode!=null&&child.exitCode!==0?`macOS open exited with status ${child.exitCode}`:child.signalCode?`macOS open ended with signal ${child.signalCode}`:null)});
   await launchLog(`Menu helper ready (pid ${state.pid}).`);
   await writeJSON(path.join(dir,'launch-selection.json'),{pid:state.pid,installationPath:installation.app,modIds:pref.selected});return this.snapshot();
  }catch(error){await launchLog(`Launch failed: ${error.message}`);throw error;
  }finally{this.launching=false;await log.close();}
 }
 async createShortcut(appId,destination){
  const app=this.app(appId),pref=this.config.apps[appId];if(!pref.path||!pref.selected.length)throw Error('Choose an installation and enable at least one mod.');
  await this.inspectApp(pref.path,appId);const resources=path.resolve(this.root,'..'),template=path.resolve(resources,'../Helpers',supportedApps[appId].template);await fs.access(template);
  await createProfile({dataDir:this.dataDir,template,appId,installationPath:pref.path,modIds:resolveSelection(app,pref.selected),destination,clientPath:path.resolve(resources,'../..')});return this.snapshot();
 }
 async updateShortcut(appId,id){const p=await readProfile(this.dataDir,id);if(p.appId!==appId)throw Error('Wrong app for shortcut');const pref=this.config.apps[appId];if(!pref.path||!pref.selected.length)throw Error('Choose an installation and enable at least one mod.');await this.inspectApp(pref.path,appId);await updateProfile(this.dataDir,id,{installationPath:pref.path,modIds:resolveSelection(this.app(appId),pref.selected)});return this.snapshot();}
 async shortcutLocation(id,newPath){const p=await readProfile(this.dataDir,id);await assertShortcut(newPath,id);await updateProfile(this.dataDir,id,{shortcutPath:newPath,name:path.basename(newPath,'.app')});return this.snapshot();}
 async launchShortcut(id,shortcutPath){
  const p=await readProfile(this.dataDir,id);await assertShortcut(shortcutPath,id);
  if(p.shortcutPath!==shortcutPath)await this.shortcutLocation(id,shortcutPath);
  resolveSelection(this.app(p.appId),p.appId==='slack'?migrateSidebarSelection(p.modIds):p.modIds);
  return withLaunchLock(this.dataDir,async()=>{
   await assertNoUpdate(this.dataDir);
   const state=await this.runtime(p.appId);
   if(state.running){const active=await readJSON(path.join(this.runtimeDir(p.appId),'launch-selection.json'),null);
    if(state.mode!=='everyday'||active?.pid!==state.pid||!sameSelection(active,p))throw Error('This app is already running with a different launch selection. Stop its mod from PME before using this shortcut.');
    const deadline=Date.now()+12000;while(true){try{await this.show(p.appId,'queue');return;}catch(error){if(Date.now()>=deadline)throw error;await new Promise(r=>setTimeout(r,250));}}
   }
   await this.startLocked(p.appId,p);
  });
 }
 async stop(appId){const dir=this.runtimeDir(appId),state=await this.runtime(appId);if(!state.running)return this.snapshot();if(state.mode!=='everyday')throw Error('This session was not started in everyday mode. Stop it from its original launcher.');await this.request(path.join(dir,'control.sock'),{op:'stop'});for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,150));if(!(await this.runtime(appId)).running)break;}return this.snapshot();}
 async show(appId,op,section){if(!['queue','preferences','stock','camera-settings'].includes(op))throw Error('Unsupported view');const state=await this.runtime(appId);if(!state.running||state.mode!=='everyday')throw Error('Launch the app with PME first.');if(appId==='slack'&&op==='preferences'&&!state.companionEnabled)throw Error('The enabled Slack mods have no settings window.');if(appId==='slack'&&state.triageEnabled===false&&op!=='preferences')await this.request(path.join(this.runtimeDir(appId),'control.sock'),{op:'show'});
  else await this.request(path.join(this.runtimeDir(appId),appId==='spotify'?'control.sock':'shell.sock'),{op:appId==='spotify'?(op==='camera-settings'?'camera-settings':'show'):op,...(typeof section==='string'?{section}:{})});return this.snapshot();}
 async importSetup(appId,source){
  this.app(appId);if(appId!=='slack')throw Error('Import is only supported for Slack.');if((await this.runtime(appId)).running)throw Error('Stop the PME-managed app before importing settings.');
  if(!path.isAbsolute(source))throw Error('Choose your existing PME project folder.');
  const nested=path.join(source,'.lab/dev');if(await fs.stat(nested).catch(()=>null))source=nested;
  const owners=readProfileOwners(path.join(source,'profile-owner.json'));if(!owners.length)throw Error('That folder does not contain an existing PME setup.');
  const allowed=new Set(['direct-download','app-store'].map(d=>developmentProfile(d)));
  if(owners.some(o=>!allowed.has(o.profile)))throw Error('The ownership record belongs to a different Mac. Import on the Mac where the setup was created.');
  const dir=this.runtimeDir(appId);await fs.mkdir(dir,{recursive:true,mode:0o700});
  const imported=[];
  for(const name of ['triage-state.json','mod-settings.json','native-appearance.json']){
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
  if(request.op==='feedback-submit')return submitFeedback(this.root,{title:request.title,body:request.body,requestId:request.requestId});
  if(request.op==='status')return this.snapshot();
  if(request.op==='release-history')return releaseHistory(this.root,this.clientVersion.version);
  if(request.op==='update-cancel')return withLaunchLock(this.dataDir,()=>clearUpdate(this));
  if(this.busy)throw Error('Please wait for the current action to finish.');this.busy=true;
  try{if(['source-add','source-refresh','source-install','source-rollback','source-remove'].includes(request.op))return await this.sourceAction(request);switch(request.op){case 'update-prepare':case 'update-stop':case 'update-wait':return await withLaunchLock(this.dataDir,()=>({'update-prepare':prepareUpdate,'update-stop':stopForUpdate,'update-wait':waitForUpdate}[request.op])(this,{processes:()=>{const p=spawnSync('/bin/ps',['-axo','command='],{encoding:'utf8'});if(p.status!==0)throw Error('Could not verify running mod sessions. Retry the update.');return p.stdout.split('\n');}}));case 'update-finish':return await withLaunchLock(this.dataDir,()=>clearUpdate(this,true));case 'scan':return await this.rescan();case 'add-app':return await this.rescan(request.path);case 'shortcut-create':return await this.createShortcut(request.appId,request.path);case 'shortcut-update':return await this.updateShortcut(request.appId,request.profileId);case 'shortcut-location':return await this.shortcutLocation(request.profileId,request.path);case 'shortcut-forget':await fs.rm(profileFile(this.dataDir,request.profileId),{force:true});return this.snapshot();case 'select':return await this.select(request);case 'mod-settings':return await this.configureMod(request);case 'settings-export':return await this.settingsExport();case 'settings-preview':return await this.settingsPreview(request.text);case 'settings-import':return await this.settingsImport(request.text);case 'settings-undo':return await this.settingsUndo();case 'companion':return await this.configureCompanion(request);case 'launch':return await this.start(request.appId);case 'stop':return await this.stop(request.appId);case 'show':return await this.show(request.appId,request.view,request.section);case 'import':return await this.importSetup(request.appId,request.path);default:throw Error('Unsupported client action');}}
  finally{this.busy=false;}
 }
}
export function cleanEnvironment(env){return Object.fromEntries(Object.entries(env).filter(([key])=>!key.startsWith('DYLD_')&&!['NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE'].includes(key)));}
