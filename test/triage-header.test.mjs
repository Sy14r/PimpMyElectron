import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('  async function nativeHeaderAction('),source.indexOf("  window.addEventListener('pme-native-header-action'"));
function fixture({mode='reply',ready=true,quickReply=null,target=null,auxiliary=null,rows=[]}={}){
 const transitions=[],focus=[],opened=[],editor={isConnected:true,focus:options=>focus.push(options)};
 const env={mode,quickReply,items:()=>rows,notificationItems:()=>[],startReply:async item=>opened.push(item),window:{__PME_REPLY__:{status:()=>({ready,target,auxiliary})}},document:{querySelector:()=>editor},transition:async next=>{transitions.push(next);env.mode=next;}};
 vm.runInNewContext(handler,env);return {env,editor,transitions,focus,opened};
}
test('full Slack handoff restores the window and focuses the preserved native editor',async()=>{
 const f=fixture();await f.env.nativeHeaderAction({detail:{action:'stock'}});assert.deepEqual(f.transitions,['stock']);assert.equal(f.focus.length,1);
});
test('back keeps the inbox visible; quick reply returns to pill',async()=>{
 for(const quickReply of [null,{}]){const f=fixture({quickReply});await f.env.nativeHeaderAction({detail:{action:'queue'}});assert.deepEqual(f.transitions,[quickReply?'cluster':'queue']);assert.equal(f.focus.length,0);}
});
test('stale events and intervening navigation cannot open or refocus a native editor',async()=>{
 for(const options of [{mode:'stock'},{ready:false}]){const f=fixture(options);await f.env.nativeHeaderAction({detail:{action:'stock'}});assert.deepEqual(f.transitions,[]);}
 const f=fixture();await f.env.nativeHeaderAction({detail:{action:'unknown'}});assert.deepEqual(f.transitions,[]);
 f.env.transition=async()=>{f.env.mode='queue';};await f.env.nativeHeaderAction({detail:{action:'stock'}});assert.equal(f.focus.length,0);
 const detached=fixture();detached.editor.isConnected=false;await detached.env.nativeHeaderAction({detail:{action:'stock'}});assert.equal(detached.focus.length,0);
});


test('thread back opens its parent conversation with the same workspace and no thread target',async()=>{
 for(const channelId of ['DDM','CCHANNEL'])for(const cached of [true,false]){
  const target={workspaceId:'TONE',channelId,threadTs:'100.000001',key:`TONE:${channelId}:100.000001`,name:'Conversation'};
  const parent={workspaceId:'TONE',channelId,key:`TONE:${channelId}:`,name:'Parent name',threadTs:null};
  const f=fixture({target,rows:cached?[parent]:[]});await f.env.nativeHeaderAction({detail:{action:'conversation'}});
  assert.equal(f.opened.length,1);assert.equal(f.opened[0].key,parent.key);assert.equal(f.opened[0].workspaceId,'TONE');assert.equal(f.opened[0].channelId,channelId);assert.equal(f.opened[0].threadTs,null);
  if(cached)assert.equal(f.opened[0],parent);assert.deepEqual(f.transitions,[]);
 }
});
test('parent navigation ignores stale events, non-threads and auxiliary views',async()=>{
 for(const options of [{mode:'stock'},{ready:false},{target:{workspaceId:'TONE',channelId:'CONE'}},{target:{threadTs:'100.000001'},auxiliary:'profile'}]){
  const f=fixture(options);await f.env.nativeHeaderAction({detail:{action:'conversation'}});assert.deepEqual(f.opened,[]);
 }
});
