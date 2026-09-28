import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {nativeEdgeStrip,unreadItemCount,notificationSummaries,filterNotificationWorkspaces} from '../src/native-edge.mjs';

test('notification preferences select all, chosen workspaces, or the current inbox without including unknown accounts',()=>{
 const workspaces=[{id:'TONE'},{id:'TTWO'}];
 assert.deepEqual(filterNotificationWorkspaces(workspaces,{notificationMode:'all'},'TONE'),workspaces);
 assert.deepEqual(filterNotificationWorkspaces(workspaces,{notificationMode:'selected',notificationWorkspaces:['TTWO','TUNKNOWN']},'TONE'),[{id:'TTWO'}]);
 assert.deepEqual(filterNotificationWorkspaces(workspaces,{notificationMode:'selected',notificationWorkspaces:[]},'*'),[]);
 assert.deepEqual(filterNotificationWorkspaces(workspaces,{notificationMode:'inbox'},'TONE'),[{id:'TONE'}]);
 assert.deepEqual(filterNotificationWorkspaces(workspaces,{notificationMode:'inbox'},'*'),workspaces);
});

test('global notification summaries export destinations and activity without message bodies or arbitrary cached fields',()=>{
 const result=notificationSummaries([{id:'TTWO',name:'Two',items:[{key:'TTWO:DTWO:',channelId:'DTWO',name:'Person',kind:'dm',unread:true,latest:'100.000001',messages:[{text:'PRIVATE BODY'}],secret:'PRIVATE FIELD',triage:{state:'active',extra:'PRIVATE TRIAGE'}}]}]);
 assert.equal(result[0].items[0].workspaceId,'TTWO');assert.equal(result[0].items[0].unread,true);
 assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
});

test('menu and native strip count unread conversations, excluding read saved items and local dismissals',()=>{
  const workspaces=[{items:[
    {unread:true},{unread:true,triage:{state:'active',pinned:true}},
    {unread:false,triage:{needsAction:true,pinned:true}},
    {unread:null,triage:{needsAction:true}},
    {unread:true,triage:{state:'done'}},{unread:true,triage:{state:'later'}}
  ]}];
  assert.equal(unreadItemCount(workspaces),2);
  const request={id:'123-1',edge:'left',bounds:{x:0,y:100,width:12,height:88},text:'private'};
  assert.deepEqual(nativeEdgeStrip(workspaces,request),{id:'123-1',edge:'left',bounds:request.bounds,count:2});
  for(const invalid of [null,{...request,id:'bad id'},{...request,edge:'top'},
    {...request,bounds:{...request.bounds,width:400}},
    {...request,bounds:{...request.bounds,x:Infinity}}])assert.equal(nativeEdgeStrip(workspaces,invalid),null);
});

const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const start=source.indexOf('  function syncNativeStrip()'),end=source.indexOf('  function setPillPreview',start);
assert.ok(start>0&&end>start);
function renderer(){
  const calls=[];
  const env={mode:'strip',disposed:false,connected:()=>true,nativeStripRequest:{id:'123-1'},snapshot:{},
    nativeStripHidden:false,stripSyncPending:false,nativeQueue:Promise.resolve(),
    window:{desktop:{window:{getWindowId:async()=>1,callBrowserWindowMethod:async(id,method)=>calls.push(method)}}}};
  vm.runInNewContext(source.slice(start,end),env);
  return {env,calls,sync:async()=>{env.syncNativeStrip();await env.nativeQueue;}};
}
test('Slack hides only after the matching panel is ready and reappears if the helper disappears',async()=>{
  const {env,calls,sync}=renderer();await sync();assert.deepEqual(calls,[]);
  env.snapshot.nativeStripReady='wrong';await sync();assert.deepEqual(calls,[]);
  env.snapshot.nativeStripReady='123-1';await sync();assert.deepEqual(calls,['hide']);
  env.snapshot.nativeStripReady=null;await sync();assert.deepEqual(calls,['hide','showInactive']);
  env.snapshot.nativeStripReady='123-1';await sync();env.connected=()=>false;await sync();
  assert.deepEqual(calls,['hide','showInactive','hide','showInactive']);
});
test('queued strip hiding cannot hide a subsequently opened inbox',async()=>{
  const {env,calls}=renderer();env.snapshot.nativeStripReady='123-1';env.syncNativeStrip();env.mode='queue';
  await env.nativeQueue;assert.deepEqual(calls,[]);assert.equal(env.stripSyncPending,false);
});

test('muted destinations are excluded from native counts and keep their mute flag in global summaries',()=>{
 const workspaces=[{id:'TONE',items:[{unread:true,muted:true,mentions:1},{unread:true,muted:false}]}];
 assert.equal(unreadItemCount(workspaces),1);assert.equal(unreadItemCount(notificationSummaries(workspaces)),1);
 assert.equal(notificationSummaries(workspaces)[0].items[0].muted,true);
});
