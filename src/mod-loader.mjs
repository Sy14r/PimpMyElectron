import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
export function validateManifest(raw){
 if(raw?.schemaVersion!==1||!Array.isArray(raw.modules))throw Error('Invalid mod manifest');
 const ids=new Set();for(const m of raw.modules){
  if(!/^[a-z][a-z0-9-]+$/.test(m.id)||ids.has(m.id)||!/^src\/renderer\/[a-z0-9-]+\.js$/.test(m.source)||!/^__PME_[A-Z_]+__$/.test(m.global)||typeof m.version!=='string'||!Array.isArray(m.requires)||m.requires.some(k=>!['slackPage','dom','sessionConfig','windowBridge'].includes(k)))throw Error('Invalid mod entry');ids.add(m.id);
 }return raw;
}
export async function createModLoader({cdp,root,runtimeDir,slackVersion}){
 const manifest=validateManifest(JSON.parse(await fs.readFile(path.join(root,'mods/runtime.json'),'utf8')));
 const sources=new Map();for(const m of manifest.modules)sources.set(m.id,await fs.readFile(path.join(root,m.source),'utf8'));
 if(!slackVersion)slackVersion=spawnSync('/usr/bin/plutil',['-extract','CFBundleShortVersionString','raw','-o','-','/Applications/Slack.app/Contents/Info.plist'],{encoding:'utf8'}).stdout?.trim()||'unknown';
 let disabled=new Set(),configError=null,lastLedger='',disposed=false;const pages=new Map();
 async function config(){try{const raw=JSON.parse(await fs.readFile(path.join(runtimeDir,'mods.json'),'utf8'));if(!Array.isArray(raw.disabled)||raw.disabled.some(id=>!sources.has(id)))throw Error();disabled=new Set(raw.disabled);configError=null;}catch(e){if(e.code!=='ENOENT')configError='Invalid module configuration; retaining last working selection.';}}
 const probe=`(()=>({slackPage:location.origin==='https://app.slack.com'&&/^\\/client\\/[TE][A-Z0-9]+(?:\\/|$)/.test(location.pathname),dom:!!document.body,
 windowBridge:typeof window.desktop?.window?.callBrowserWindowMethod==='function',sessionConfig:(()=>{try{const id=location.pathname.split('/')[2];return typeof JSON.parse(localStorage.getItem('localConfig_v2')||'{}').teams?.[id]?.token==='string';}catch{return false;}})(),
 assets:[...document.scripts].map(s=>{try{return new URL(s.src).pathname;}catch{return '';}}).filter(Boolean).sort().slice(0,100)}))()`;
 async function remove(entry,module,record){
  await cdp.evaluate(`window[${JSON.stringify(module.global)}]?.dispose?.()`,entry.sessionId).catch(()=>{});
  if(record.script)await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:record.script},entry.sessionId).catch(()=>{});
  record.script=null;
 }
 async function ledger(){const report={slackVersion,previouslyTested:manifest.testedSlackVersions?.includes(slackVersion)===true,qualification:'capability probes; behavioral tests are separate',configError,
  pages:[...pages.values()].map(p=>({fingerprint:p.fingerprint,capabilities:p.capabilities,modules:Object.fromEntries([...p.modules].map(([id,r])=>[id,{version:r.version,state:r.state,reason:r.reason}]))}))};
  const serialized=JSON.stringify(report);if(serialized===lastLedger)return;lastLedger=serialized;
  await fs.writeFile(path.join(runtimeDir,'compatibility.json'),JSON.stringify({...report,checkedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600}).catch(()=>{});
 }
 async function reconcile(entry){
  if(disposed)return;await config();
  let page=pages.get(entry.sessionId);if(!page){page={modules:new Map()};pages.set(entry.sessionId,page);}
  let caps;try{caps=await cdp.evaluate(probe,entry.sessionId);}catch{return;}
  if(!caps)return;
  page.capabilities=Object.fromEntries(['slackPage','dom','sessionConfig','windowBridge'].map(k=>[k,caps[k]===true]));
  page.fingerprint=createHash('sha256').update(JSON.stringify(caps.assets||[])).digest('hex').slice(0,20);
  for(const module of manifest.modules){
   let record=page.modules.get(module.id);if(!record){record={version:module.version,script:null,state:'waiting'};page.modules.set(module.id,record);}
   if(disabled.has(module.id)){if(record.script)await remove(entry,module,record);record.state='disabled';record.reason='Disabled in local configuration';continue;}
   if(record.state==='failed')continue;
   const missing=module.requires.filter(k=>!caps[k]);
   if(missing.length){if(record.script)await remove(entry,module,record);record.state='waiting';record.reason='Missing capability: '+missing.join(', ');continue;}
   try{
    if(!record.script){const result=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:sources.get(module.id)},entry.sessionId);record.script=result.identifier;}
    const installed=await cdp.evaluate(`!!window[${JSON.stringify(module.global)}]`,entry.sessionId);
    if(!installed)await cdp.evaluate(sources.get(module.id),entry.sessionId);
    record.state='active';record.reason=null;
   }catch{record.state='failed';record.reason='Installation failed; other modules remain independent';if(record.script)await remove(entry,module,record);}
  }
  await ledger();
 }
 await config();
 return {reconcile,status:()=>({slackVersion,previouslyTested:manifest.testedSlackVersions?.includes(slackVersion)===true,configError,
  pages:[...pages.values()].map(p=>({capabilities:p.capabilities,modules:Object.fromEntries([...p.modules].map(([id,r])=>[id,r.state]))}))}),
  enabled:id=>!disabled.has(id),
  detach:entry=>pages.delete(entry.sessionId),
  async dispose(sessions){if(disposed)return;disposed=true;for(const entry of sessions.values()){const page=pages.get(entry.sessionId);if(!page)continue;for(const module of [...manifest.modules].reverse()){const r=page.modules.get(module.id);if(r)await remove(entry,module,r);}}pages.clear();}
 };
}
