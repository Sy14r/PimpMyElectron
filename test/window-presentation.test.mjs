import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const geometry=source.slice(source.indexOf('  async function geometry('),source.indexOf('  function transition('));
function fixture({visible=false,minimized=false,stripHidden=false}={}){
 const calls=[],area={x:0,y:24,width:1440,height:876};
 const bridge={getWindowId:async()=>1,callBrowserWindowMethod:async(_id,method,...args)=>{
  calls.push([method,...args]);return {isVisible:visible,isMinimized:minimized}[method];
 }};
 const env={compactBounds:null,nativeStripRequest:null,nativeStripHidden:stripHidden,window:{desktop:{window:bridge}},
  desktop:{screen:{getAllDisplays:async()=>[{id:1,workArea:area}],getPrimaryDisplay:async()=>({id:1,workArea:area})}},
  original:{min:[400,300],bounds:{x:20,y:30,width:900,height:700},top:false,spaces:false},spacesApplied:true,
  sessionStorage:{removeItem(){},setItem(){}},settings:{display:'main'},layoutKey:'layout',edge:'left',quickReply:null,innerWidth:420,
  pillHeight:()=>88,pillItems:()=>[],stripSequence:0,reportShell(){},syncNativeStrip(){}};
 vm.runInNewContext(geometry,env);return {calls,env};
}
test('hidden windows get final geometry before becoming visible without waiting on throttled timers',async()=>{
 for(const next of ['queue','cluster','stock']){
  const f=fixture();await f.env.geometry(next);const methods=f.calls.map(c=>c[0]);
  assert.ok(methods.indexOf('setBounds')<methods.indexOf('showInactive'));
  assert.equal(methods.at(-1),'showInactive');
 }
});
test('minimized windows restore only after sizing; visible windows do not incur a presentation delay',async()=>{
 const f=fixture({minimized:true});await f.env.geometry('queue');const methods=f.calls.map(c=>c[0]);
 assert.ok(methods.indexOf('setBounds')<methods.indexOf('restore'));
 const visible=fixture({visible:true});await visible.env.geometry('queue');
 assert.equal(visible.calls.some(c=>['paint','showInactive','restore'].includes(c[0])),false);
});
test('fully hidden mode never shows a window and an acknowledged native strip stays hidden',async()=>{
 const hidden=fixture();await hidden.env.geometry('hidden');assert.deepEqual(hidden.calls,[['hide']]);
 const strip=fixture({stripHidden:true});await strip.env.geometry('strip');
 assert.equal(strip.calls.some(c=>['paint','showInactive','restore'].includes(c[0])),false);
});
