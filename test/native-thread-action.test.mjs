import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const native=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
const triage=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const action=native.slice(native.indexOf('  function threadAction('),native.indexOf('  // A route/editor replacement'));
const handler=triage.slice(triage.indexOf('  async function nativeThreadAction('),triage.indexOf("  window.addEventListener('pme-native-thread-action'"));
function fixture(channelId='DONE'){
  const target={workspaceId:'TONE',channelId,key:`TONE:${channelId}:`,name:'Peer',peer:'UONE',threadTs:null};
  const events=[],opened=[];let matching=true,inside=true,mode='reply',rowChannel=channelId,ts='100.000001';
  const message={getAttribute:k=>k==='data-msg-ts'?ts:rowChannel},control={closest:()=>message};
  const env={active:true,state:'ready',target,auxiliary:null,verifiedPane:()=>matching,pane:{contains:()=>inside},
    window:{__PME_TRIAGE__:{status:()=>({mode})},dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}}};
  vm.runInNewContext(action,env);
  const reply={ready:true,target,auxiliary:null};
  const ui={mode:'reply',window:{__PME_REPLY__:{status:()=>reply}},items:()=>[],notificationItems:()=>[],startReply:async item=>opened.push(item)};
  vm.runInNewContext(handler,ui);
  function click(extra={}){const e={type:'click',target:{closest:selector=>{assert.equal(selector,'[data-qa="reply_bar"],[data-qa="start_thread"]');return control;}},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};const handled=env.threadAction(e);return {handled,event:e};}
  return {env,ui,reply,target,events,opened,click,matching:v=>matching=v,inside:v=>inside=v,mode:v=>mode=v,rowChannel:v=>rowChannel=v,ts:v=>ts=v};
}
test('native thread click opens the exact clicked root in the same DM or channel, even absent from the inbox cache',async()=>{
  for(const id of ['DONE','CONE']){
    const f=fixture(id),r=f.click();assert.equal(r.handled,true);assert.equal(r.event.prevented,true);assert.equal(r.event.stopped,true);
    assert.equal(f.events[0].type,'pme-native-thread-action');await f.ui.nativeThreadAction(f.events[0]);
    assert.equal(f.opened.length,1);assert.equal(f.opened[0].key,`TONE:${id}:100.000001`);assert.equal(f.opened[0].threadTs,'100.000001');
    assert.equal(f.opened[0].workspaceId,'TONE');assert.equal(f.opened[0].channelId,id);assert.equal(f.opened[0].peer,'UONE');
    assert.equal(f.target.threadTs,null); // Never mutate the still-mounted editor's destination.
  }
});
test('cached thread keeps its observed metadata when opened from a native reply control',async()=>{
  const f=fixture(),cached={workspaceId:'TONE',channelId:'DONE',key:'TONE:DONE:100.000001',threadTs:'100.000001',unread:true};
  f.ui.items=()=>[cached];f.click();await f.ui.nativeThreadAction(f.events[0]);assert.equal(f.opened[0],cached);
});
test('native click routing ignores stock Slack, modified clicks, other panes and mismatched message identity',()=>{
  for(const change of [f=>f.mode('stock'),f=>f.matching(false),f=>f.inside(false),f=>f.rowChannel('DOTHER'),f=>f.ts('bad'),f=>f.env.state='loading',f=>f.env.auxiliary={},f=>f.target.threadTs='90.000001']){
    const f=fixture();change(f);assert.equal(f.click().handled,false);assert.equal(f.events.length,0);
  }
  for(const extra of [{metaKey:true},{ctrlKey:true},{altKey:true},{shiftKey:true},{defaultPrevented:true},{type:'keydown',key:'Enter'}]){
    const f=fixture();assert.equal(f.click(extra).handled,false);assert.equal(f.events.length,0);
  }
});
test('triage rejects stale or malformed thread requests without weakening destination verification',async()=>{
  for(const change of [f=>f.ui.mode='queue',f=>f.reply.ready=false,f=>f.reply.auxiliary='profile',f=>f.target.key='TOTHER:DOTHER:',f=>f.target.threadTs='90.000001',f=>f.events[0].detail.threadTs='bad']){
    const f=fixture();f.click();change(f);await f.ui.nativeThreadAction(f.events[0]);assert.equal(f.opened.length,0);
  }
});
