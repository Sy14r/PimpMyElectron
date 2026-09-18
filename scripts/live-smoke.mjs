// Uses only our UI and native window controls. Never clicks Slack conversations.
import net from 'node:net';
import {until} from './control.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
function control(request){return new Promise((resolve,reject)=>{
  const socket=net.createConnection(path.join(root,'.lab/dev/control.sock'));let data='';
  socket.setTimeout(15000,()=>socket.destroy(new Error('Control timeout')));
  socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));
  socket.on('data',chunk=>{data+=chunk;});socket.on('error',reject);
  socket.on('end',()=>{try{const response=JSON.parse(data);if(!response.ok)throw Error(response.error);resolve(response.result);}catch(e){reject(e);}});
});}
const inspect=expression=>control({op:'inspect',expression});
await until('window.__PME_TRIAGE__?.status().connected&&window.__PME_TRIAGE__?.status().items>0');
const result=await inspect(`(async()=>{
  const mod=window.__PME_TRIAGE__;if(!mod)throw Error('Live triage is not installed');
  const pathBefore=location.pathname;const shadow=document.querySelector('#pme-live-triage').shadowRoot;
  const w=desktop.window,id=await w.getWindowId();const call=(method,...args)=>w.callBrowserWindowMethod(id,method,...args);
  await mod.transition('stock');
  const original={bounds:await call('getBounds'),min:await call('getMinimumSize'),top:await call('isAlwaysOnTop'),spaces:await call('isVisibleOnAllWorkspaces')};
  await mod.transition('queue');const queue=await call('getBounds'),allSpaces=await call('isVisibleOnAllWorkspaces');
  shadow.getElementById('dock').click();await mod.transition('queue');const left=await call('getBounds');
  shadow.getElementById('dock').click();await mod.transition('queue');const right=await call('getBounds');
  await mod.transition('cluster');const cluster=await call('getBounds');
  await mod.transition('strip');const strip=await call('getBounds');
  const displays=await desktop.screen.getAllDisplays();
  const area=displays.find(d=>strip.x>=d.workArea.x&&strip.x<d.workArea.x+d.workArea.width)?.workArea;
  const compactCentered=!!area&&[strip,cluster].every(b=>Math.abs(b.y+b.height/2-(area.y+area.height/2))<=0.5);
  await mod.transition('queue');
  const rows=[...shadow.querySelectorAll('.row')];if(rows[0])mod.open(rows[0].dataset.key,{reader:true});await mod.transition('reading');
  const reader=await call('getBounds');
  const readerVisible=!shadow.querySelector('.reader').hidden;
  await mod.transition('stock');
  const restored={bounds:await call('getBounds'),min:await call('getMinimumSize'),top:await call('isAlwaysOnTop'),spaces:await call('isVisibleOnAllWorkspaces')};
  await mod.transition('queue');
  return {original,restored,allSpaces,widths:{queue:queue.width,cluster:cluster.width,reader:reader.width},
    dockChanged:left.x!==right.x,compactCentered,stripHeight:strip.height,readerVisible,underlyingConversationUnchanged:location.pathname===pathBefore,
    rowCount:rows.length,ui:mod.status()};
})()`);
assert.deepEqual(result.restored,result.original);assert.deepEqual(result.widths,{queue:420,cluster:44,reader:820});
assert.equal(result.dockChanged,true);assert.equal(result.readerVisible,true);assert.equal(result.underlyingConversationUnchanged,true);
assert.equal(result.allSpaces,true);
assert.equal(result.compactCentered,true);
assert.ok(result.stripHeight>=88);
const output={checkedAt:new Date().toISOString(),source:'scripts/live-smoke.mjs',
  nativeGeometryRestored:true,allSpacesFlagSetAndRestored:true,widths:result.widths,leftRightDocking:result.dockChanged,compactCentered:result.compactCentered,
  readerVisible:result.readerVisible,underlyingConversationUnchanged:result.underlyingConversationUnchanged,
  observedConversations:result.rowCount,ui:result.ui};
await fs.writeFile(path.join(root,'evidence/live-prototype-checks.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
