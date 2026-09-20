import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const start=source.indexOf('  function createPillActivityTracker()'),end=source.indexOf('  const detectPillActivity=',start);
const create=vm.runInNewContext(`(${source.slice(start,end).trim()})`,{Date});
const item=(unread,latest='900.000001',extra={})=>({key:'TONE:DONE:',unread,latest,triage:{state:'active'},...extra});
const snapshot=(items,scope='TONE')=>({selectedWorkspace:scope,workspaces:[{id:'TONE',items}]});
const feed=(track,items,options={})=>track(snapshot(items),{now:1000000,...options});
test('first snapshot, late hydration, unchanged snapshots and scope changes do not announce old unread',()=>{
 const track=create();assert.equal(feed(track,[]),false);
 assert.equal(feed(track,[item(true)]),false);assert.equal(feed(track,[item(true)]),false);
 assert.equal(track(snapshot([item(true,'1001.000001')],'*'),{now:1001000}),false);
 assert.equal(feed(track,[item(true,'1002.000001')],{reset:true}),false);
});
test('new unread transitions and later messages in an already unread conversation announce once',()=>{
 const track=create();feed(track,[item(false)]);
 assert.equal(feed(track,[item(true)]),true);assert.equal(feed(track,[item(true)]),false);
 assert.equal(feed(track,[item(true,'1001.000001')]),true);
 assert.equal(feed(track,[item(true,'1001.000001')]),false);
 assert.equal(feed(track,[item(true,'1001.000002')]),true);
});
test('freshly discovered destinations and live counts work without fetching message bodies',()=>{
 const track=create();feed(track,[]);
 assert.equal(feed(track,[item(true,'1001.000001')]),true);
 const counts=create();feed(counts,[item(true,null,{unreadCount:1})]);
 assert.equal(feed(counts,[item(true,null,{unreadCount:2})]),true);
  assert.equal(feed(counts,[item(true,null,{unreadCount:2})]),false);
});
test('a fresh message may arrive before its unread flag without losing the reveal',()=>{
 const track=create();feed(track,[item(null)]);
 assert.equal(feed(track,[item(null,'1001.000001')]),false);
 assert.equal(feed(track,[item(true,'1001.000001')]),true);
 assert.equal(feed(track,[item(true,'1001.000001')]),false);
});
test('background activity reveals the pill even when inbox scope changes to another workspace',()=>{
 const track=create(),value=(unread,scope)=>({selectedWorkspace:scope,workspaces:[{id:scope,items:[]}],notificationWorkspaces:[{id:'TTWO',items:[item(unread)]}]});
 assert.equal(track(value(false,'TONE'),{now:1000000}),false);
 assert.equal(track(value(true,'TONE'),{now:1000000}),true);
 assert.equal(track(value(true,'TTWO'),{now:1000000}),false);
});
test('changing notification preferences updates the baseline without announcing existing unread',()=>{
 const track=create(),value=(notificationScope,unread)=>({notificationScope,notificationWorkspaces:[{id:'TONE',items:[item(unread)]}]});
 assert.equal(track(value('selected-TONE',false),{now:1000000}),false);
 assert.equal(track(value('all',true),{now:1000000}),false);
});
test('reads, edits, pins, local dismissals, and unknown unread do not announce',()=>{
 const track=create();feed(track,[item(true)]);
 assert.equal(feed(track,[item(false,'1001.000001')]),false);
 assert.equal(feed(track,[item(null,'1002.000001')]),false);
 assert.equal(feed(track,[item(true,'1003.000001',{triage:{state:'later'}})]),false);
 assert.equal(feed(track,[item(true,'1004.000001',{triage:{state:'done'}})]),false);
 assert.equal(feed(track,[item(true,'1004.000001')]),false);
 assert.equal(feed(track,[item(true,'1004.000001',{text:'edited',triage:{state:'active',pinned:true}})]),false);
});
test('activity only expands the visible strip, and refreshes the timer for an existing pill',()=>{
 const from=source.indexOf('  function revealPillActivity()'),to=source.indexOf("  let pillSignature=",from);
 for(const mode of ['strip','cluster','queue','reply','reading','stock','hidden']){
  const calls=[],context={mode,disposed:false,nativeStripRequest:{id:'strip'},transition:(next,options)=>calls.push([next,options.passive]),touch:()=>calls.push('touch')};
  vm.runInNewContext(source.slice(from,to),context);context.revealPillActivity();
  assert.deepEqual(calls,mode==='strip'?[['cluster',true]]:mode==='cluster'?['touch']:[],mode);
  calls.length=0;context.mode='strip';context.nativeStripRequest=null;context.revealPillActivity();assert.deepEqual(calls,[]);
 }
});
test('clicking a background notification selects its workspace and opens the native destination',()=>{
 const from=source.indexOf('  function openItem('),to=source.indexOf('  // Count actionable',from);
 for(const scope of ['TONE','*']){
  const destination={key:'TTWO:DTWO:',workspaceId:'TTWO',channelId:'DTWO'},actions=[],opened=[];
  const env={items:()=>[],notificationItems:()=>[destination],viewTeam:()=>scope,window:{__pmeTriageAction:value=>actions.push(JSON.parse(value))},startReply:item=>opened.push(item)};
  vm.runInNewContext(source.slice(from,to),env);env.openItem(destination.key);
  assert.deepEqual(opened,[destination]);
  assert.deepEqual(actions,scope==='*'?[]:[{workspaceId:'TONE',action:'switch',target:'TTWO'}]);
  env.openItem('UNKNOWN');assert.equal(opened.length,1);
 }
});
