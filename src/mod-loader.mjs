import {loadExternalMods} from './external-mods.mjs';
import {startExternalHelpers} from './external-helpers.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
export function validateManifest(raw){
 if(raw?.schemaVersion!==1||!Array.isArray(raw.modules))throw Error('Invalid mod manifest');
 const ids=new Set();for(const m of raw.modules){
  if(!/^[a-z][a-z0-9-]+$/.test(m.id)||ids.has(m.id)||!/^src\/renderer\/[a-z0-9-]+\.js$/.test(m.source)||!/^__PME_[A-Z_]+__$/.test(m.global)||typeof m.version!=='string'||!Array.isArray(m.requires)||m.requires.some(k=>!['slackPage','dom','sessionConfig','windowBridge'].includes(k)))throw Error('Invalid mod entry');ids.add(m.id);
 }return raw;
}
export async function createModLoader({cdp,contextGuard=null,root,runtimeDir,slackVersion,slackPID=0,appPath=process.env.PME_SLACK_APP||'',moduleSettings=()=>({}),startHelpers=startExternalHelpers}){
 const manifest=validateManifest(JSON.parse(await fs.readFile(path.join(root,'mods/runtime.json'),'utf8')));
 const external=await loadExternalMods(runtimeDir);manifest.modules.push(...external.modules);
 const sources=new Map();for(const m of manifest.modules)sources.set(m.id,m.code??await fs.readFile(path.join(root,m.source),'utf8'));
 if(!slackVersion)slackVersion=spawnSync('/usr/bin/plutil',['-extract','CFBundleShortVersionString','raw','-o','-','/Applications/Slack.app/Contents/Info.plist'],{encoding:'utf8'}).stdout?.trim()||'unknown';
 const helperSession=await startHelpers({helpers:external.helpers,runtimeDir,appPath,targetPID:slackPID});
 const serviceModules=new Map(manifest.modules.filter(module=>module.service).map(module=>[module.service.binding,module]));if(serviceModules.size&&!contextGuard)throw Error('External helper services require a trusted context guard');
 let disabled=new Set(),configError=null,lastLedger='',disposed=false;const pages=new Map();
 async function config(){try{const raw=JSON.parse(await fs.readFile(path.join(runtimeDir,'mods.json'),'utf8'));if(!Array.isArray(raw.disabled)||raw.disabled.some(id=>!sources.has(id)))throw Error();disabled=new Set(raw.disabled);configError=null;}catch(e){if(e.code!=='ENOENT')configError='Invalid module configuration; retaining last working selection.';}}
 const probe=`(()=>({slackPage:location.origin==='https://app.slack.com'&&/^\\/client\\/[TE][A-Z0-9]+(?:\\/|$)/.test(location.pathname),dom:!!document.body,
 windowBridge:typeof window.desktop?.window?.callBrowserWindowMethod==='function',sessionConfig:(()=>{try{const id=location.pathname.split('/')[2];return typeof JSON.parse(localStorage.getItem('localConfig_v2')||'{}').teams?.[id]?.token==='string';}catch{return false;}})(),
 documentToken:performance.timeOrigin,assets:[...document.scripts].map(s=>{try{return new URL(s.src).pathname;}catch{return '';}}).filter(Boolean).sort().slice(0,100)}))()`;
 async function remove(entry,module,record){
  await cdp.evaluate(`window[${JSON.stringify(module.global)}]?.dispose?.()`,entry.sessionId).catch(()=>{});
  if(record.script)await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:record.script},entry.sessionId).catch(()=>{});
  record.script=null;record.settings=null;
 }
 async function bindServices(entry,page){const context=contextGuard?.current(entry);if(!context||!serviceModules.size)return;const identity=context.uniqueId||context.id;if(page.serviceContext===identity)return;for(const module of serviceModules.values()){if(contextGuard.current(entry)!==context)return;await cdp.send('Runtime.addBinding',{name:module.service.binding,executionContextId:context.id},entry.sessionId);}if(contextGuard.current(entry)===context)page.serviceContext=identity;}
 function serviceEvent(message){
  if(disposed||message.method!=='Runtime.bindingCalled')return;const module=serviceModules.get(message.params?.name);if(!module)return;const page=pages.get(message.sessionId),entry=page?.entry,context=entry&&contextGuard.current(entry);if(!entry||!context||!contextGuard.allows(message,entry)||page.serviceContext!==(context.uniqueId||context.id)||disabled.has(module.id))return;const raw=message.params.payload;if(typeof raw!=='string'||Buffer.byteLength(raw)>64*1024)return;let request;try{request=JSON.parse(raw);}catch{return;}if(!request||Object.keys(request).some(key=>!['id','operation','payload'].includes(key))||typeof request.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(request.id)||!module.service.operations.includes(request.operation))return;const identity=context.uniqueId||context.id;
  void Promise.resolve().then(()=>helperSession.request(module.id,request.operation,request.payload)).then(result=>({id:request.id,ok:true,result}),error=>({id:request.id,ok:false,error:String(error?.message||'Private service request failed').slice(0,200)})).then(envelope=>{const current=contextGuard.current(entry);if(disposed||!current||(current.uniqueId||current.id)!==identity)return;const serialized=JSON.stringify(envelope);return cdp.evaluate(`window[${JSON.stringify(module.global)}]?.[${JSON.stringify(module.service.responseMethod)}]?.(${JSON.stringify(serialized)})`,entry.sessionId);}).catch(()=>{});
 }
 if(serviceModules.size)cdp.on('event',serviceEvent);
 async function ledger(){const report={slackVersion,previouslyTested:manifest.testedSlackVersions?.includes(slackVersion)===true,qualification:'capability probes; behavioral tests are separate',configError,
  pages:[...pages.values()].map(p=>({fingerprint:p.fingerprint,capabilities:p.capabilities,modules:Object.fromEntries([...p.modules].map(([id,r])=>[id,{version:r.version,state:r.state,reason:r.reason}]))}))};
  const serialized=JSON.stringify(report);if(serialized===lastLedger)return;lastLedger=serialized;
  await fs.writeFile(path.join(runtimeDir,'compatibility.json'),JSON.stringify({...report,checkedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600}).catch(()=>{});
 }
 async function reconcile(entry){
  if(disposed)return;await config();
  let page=pages.get(entry.sessionId);if(!page){page={modules:new Map(),entry};pages.set(entry.sessionId,page);}else page.entry=entry;
  let caps;try{caps=await cdp.evaluate(probe,entry.sessionId);}catch{return;}
  if(!caps)return;
  if(page.documentToken!==caps.documentToken){page.documentToken=caps.documentToken;page.serviceContext=null;for(const record of page.modules.values())record.settings=null;}
  await bindServices(entry,page);
  page.capabilities=Object.fromEntries(['slackPage','dom','sessionConfig','windowBridge'].map(k=>[k,caps[k]===true]));
  page.fingerprint=createHash('sha256').update(JSON.stringify(caps.assets||[])).digest('hex').slice(0,20);
  for(const module of manifest.modules){
   let record=page.modules.get(module.id);if(!record){record={version:module.version,script:null,state:'waiting',settings:null};page.modules.set(module.id,record);}
   if(disabled.has(module.id)){if(record.script)await remove(entry,module,record);record.state='disabled';record.reason='Disabled in local configuration';continue;}
   if(record.state==='failed')continue;
   const missing=module.requires.filter(k=>!caps[k]);
   if(missing.length){if(record.script)await remove(entry,module,record);record.state='waiting';record.reason='Missing capability: '+missing.join(', ');continue;}
   try{
    if(!record.script){const result=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:sources.get(module.id)},entry.sessionId);record.script=result.identifier;}
    const installed=await cdp.evaluate(`!!window[${JSON.stringify(module.global)}]`,entry.sessionId);
    if(!installed)await cdp.evaluate(sources.get(module.id),entry.sessionId);
    const configured=moduleSettings(module.id),signature=JSON.stringify(configured);if(record.settings!==signature){await cdp.evaluate(`window[${JSON.stringify(module.global)}]?.configure?.(${signature})`,entry.sessionId);record.settings=signature;}
    record.state='active';record.reason=null;
   }catch{record.state='failed';record.reason='Installation failed; other modules remain independent';if(record.script)await remove(entry,module,record);}
  }
  await ledger();
 }
 await config();
 return {reconcile,async configure(id,value){const module=manifest.modules.find(m=>m.id===id);if(!module)return;const signature=JSON.stringify(value);for(const [sessionId,page] of pages){const record=page.modules.get(id);if(record?.state!=='active')continue;await cdp.evaluate(`window[${JSON.stringify(module.global)}]?.configure?.(${signature})`,sessionId).then(()=>{record.settings=signature;}).catch(()=>{});}},status:()=>({helpers:helperSession.status(),slackVersion,previouslyTested:manifest.testedSlackVersions?.includes(slackVersion)===true,configError,
  pages:[...pages.values()].map(p=>({capabilities:p.capabilities,modules:Object.fromEntries([...p.modules].map(([id,r])=>[id,r.state]))}))}),
  enabled:id=>!disabled.has(id),
  detach:entry=>pages.delete(entry.sessionId),
  async dispose(sessions){if(disposed)return;disposed=true;if(serviceModules.size)cdp.off('event',serviceEvent);await helperSession.dispose();for(const entry of sessions.values()){const page=pages.get(entry.sessionId);if(!page)continue;for(const module of [...manifest.modules].reverse()){const r=page.modules.get(module.id);if(r)await remove(entry,module,r);}for(const module of serviceModules.values())await cdp.send('Runtime.removeBinding',{name:module.service.binding},entry.sessionId).catch(()=>{});}pages.clear();}
 };
}
