import {control,inspect,until,root} from './control.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const file=path.join(root,'.lab/dev/mods.json');
const previous=await fs.readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
const configure=disabled=>fs.writeFile(file,JSON.stringify({disabled}),{mode:0o600});
let updatePaused=false;
try{
  await inspect(`__PME_TRIAGE__.transition('stock')`);
  const original=await inspect(`(async()=>{const w=desktop.window,id=await w.getWindowId();return {bounds:await w.callBrowserWindowMethod(id,'getBounds'),min:await w.callBrowserWindowMethod(id,'getMinimumSize'),top:await w.callBrowserWindowMethod(id,'isAlwaysOnTop')};})()`);
  await inspect(`__PME_TRIAGE__.transition('queue')`);
  await configure(['history-reader']);
  await until(`!window.__PME_READS__&&!!window.__PME_TRIAGE__`);
  await configure([]);await until(`!!window.__PME_READS__`);
  await configure(['triage-surface']);await until(`!window.__PME_TRIAGE__&&!document.querySelector('#pme-live-triage')&&!!window.__PME_READS__`);
  const restored=await inspect(`(async()=>{const w=desktop.window,id=await w.getWindowId();return {bounds:await w.callBrowserWindowMethod(id,'getBounds'),min:await w.callBrowserWindowMethod(id,'getMinimumSize'),top:await w.callBrowserWindowMethod(id,'isAlwaysOnTop')};})()`);
  assert.deepEqual(restored,original);
  await configure([]);await until(`!!window.__PME_TRIAGE__`);
  await until(`__PME_TRIAGE__.status().items>0`);
  await inspect(`(async()=>{await __PME_TRIAGE__.transition('queue');window.__pmeSavedUpdate=__PME_TRIAGE__.update;__PME_TRIAGE__.update=()=>{};})()`);updatePaused=true;
  const disconnected=await until(`(()=>{const s=document.querySelector('#pme-live-triage').shadowRoot;return s.getElementById('notice').textContent.startsWith('Triage disconnected')?{refreshDisabled:s.getElementById('activity-refresh').disabled,stockEnabled:!s.getElementById('stock').disabled}:null;})()`,{attempts:60});
  assert.deepEqual(disconnected,{refreshDisabled:true,stockEnabled:true});
  await inspect(`__PME_TRIAGE__.update=window.__pmeSavedUpdate;delete window.__pmeSavedUpdate`);updatePaused=false;
  await until(`__PME_TRIAGE__.status().connected`);
  const before=await inspect(`({path:location.pathname,workspace:__PME_TRIAGE__.status().workspace})`);
  await inspect(`setTimeout(()=>location.reload(),100);true`);
  await new Promise(r=>setTimeout(r,1500));
  const after=await until(`window.__PME_TRIAGE__?.status().items>0?{path:location.pathname,workspace:__PME_TRIAGE__.status().workspace}:null`,{attempts:100});
  assert.deepEqual(after,before);
  await inspect(`__PME_TRIAGE__.command('rest')`);
  const output={checkedAt:new Date().toISOString(),independentReadModuleDisable:true,uiDisableRestoresWindow:true,moduleReenable:true,missingUpdatesShowDisconnected:true,stockEscapeAvailable:true,pageReloadReinstallsMods:true,workspaceScopeRetained:true};
  await fs.writeFile(path.join(root,'evidence/lifecycle-checks.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
}finally{
  if(updatePaused)await inspect(`if(window.__PME_TRIAGE__&&window.__pmeSavedUpdate)__PME_TRIAGE__.update=window.__pmeSavedUpdate;delete window.__pmeSavedUpdate`).catch(()=>{});
  if(previous===null)await fs.rm(file,{force:true});else await fs.writeFile(file,previous,{mode:0o600});
}
