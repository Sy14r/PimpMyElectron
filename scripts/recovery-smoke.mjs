// Real, bounded CDP network outage in the owned test client; no message sends.
import {inspect,control,until,root} from './control.mjs';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const localFile=path.join(root,'.lab/dev/triage-state.json'),records=async()=>JSON.parse(await fs.readFile(localFile,'utf8')).records;
const original=await records();let pinned=false;
try{
  await until('__PME_TRIAGE__?.status().items>0');
  for(let i=0;i<100;i++){const s=await control({op:'status'});if(s.feature.activity.length===2&&s.feature.activity.every(a=>a.status==='ready'))break;if(i===99)throw Error('Initial refresh not ready');await new Promise(r=>setTimeout(r,200));}
  await inspect(`(async()=>{await __PME_TRIAGE__.transition('queue');const s=document.querySelector('#pme-live-triage').shadowRoot;s.querySelector('[data-filter="all"]').click();__PME_TRIAGE__.open('T0C3P9VJUBA:D0C2DJ1HK63:',{reader:true});})()`);
  await until(`document.querySelector('#pme-live-triage').shadowRoot.getElementById('history-status').textContent.startsWith('Loaded')`);
  const before=await control({op:'status'}),nativePath=await inspect('location.pathname');
  await inspect(`window.__pmeRecoveryBody=JSON.stringify([...document.querySelector('#pme-live-triage').shadowRoot.querySelectorAll('.body')].map(n=>n.textContent));true`);
  assert.ok((await inspect('window.__pmeRecoveryBody.length'))>0);
  const offline=await control({op:'test-network-offline',durationMs:20000});assert.equal(offline.offline,true);
  await until(`navigator.onLine===false&&__PME_TRIAGE__.status().network==='offline'`);
  const failed=await inspect(`__PME_READS__.read({workspaceId:'T0C3P9VJUBA',channelId:'D0C2DJ1HK63'})`);assert.equal(failed.ok,false);
  const retained=await inspect(`(()=>{const s=document.querySelector('#pme-live-triage').shadowRoot;return {same:JSON.stringify([...s.querySelectorAll('.body')].map(n=>n.textContent))===__pmeRecoveryBody,offline:s.getElementById('activity-status').textContent.includes('offline'),localEnabled:!s.getElementById('pin').disabled,pinned:s.getElementById('pin').textContent==='Unpin'};})()`);
  assert.equal(retained.same,true);assert.equal(retained.offline,true);assert.equal(retained.localEnabled,true);
  await inspect(`document.querySelector('#pme-live-triage').shadowRoot.getElementById('pin').click()`);pinned=true;
  await until(`document.querySelector('#pme-live-triage').shadowRoot.getElementById('pin').textContent===${JSON.stringify(retained.pinned?'Pin':'Unpin')}`);
  await inspect(`document.querySelector('#pme-live-triage').shadowRoot.getElementById('undo').click()`);
  await until(`document.querySelector('#pme-live-triage').shadowRoot.getElementById('pin').textContent===${JSON.stringify(retained.pinned?'Unpin':'Pin')}`);pinned=false;assert.deepEqual(await records(),original);
  await until(`navigator.onLine===true&&__PME_TRIAGE__.status().network==='available'`,{attempts:130});
  let recovered;for(let i=0;i<130;i++){
    const s=await control({op:'status'});if(s.feature.activity.length===2&&s.feature.activity.every(a=>a.status==='ready'&&a.at>Math.max(...before.feature.activity.map(a=>a.at||0)))){recovered=s;break;}
    await new Promise(r=>setTimeout(r,200));
  }
  assert.ok(recovered,'Both workspace refreshes must recover without manual refresh');assert.equal(recovered.pid,before.pid);
  assert.equal(await inspect('location.pathname'),nativePath);assert.deepEqual(await records(),original);
  for(const method of ['chat.postMessage','conversations.mark'])assert.equal(recovered.feature.methods[method]||0,before.feature.methods[method]||0);
  const report={checkedAt:new Date().toISOString(),experiment:'20-second dev-renderer CDP offline interval',actualReadFailed:true,offlineNotice:true,cachedReaderRetained:true,localPinUndoWhileOffline:true,automaticNetworkRestore:true,bothWorkspacesAutomaticallyRefreshed:true,clientRestarted:false,nativeRouteUnchanged:true,localDecisionsRestored:true,messageSends:0,markReadRequests:0,realMacSleepTested:false};
  await fs.writeFile(path.join(root,'evidence/recovery-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{
  const reset=await control({op:'test-network-restore'});assert.equal(reset.restored,true,'Network reset must succeed');
  if(pinned){await inspect(`document.querySelector('#pme-live-triage').shadowRoot.getElementById('undo').click()`);await new Promise(r=>setTimeout(r,1800));}
  await inspect(`delete window.__pmeRecoveryBody;__PME_TRIAGE__?.command('rest')`).catch(()=>{});
}
