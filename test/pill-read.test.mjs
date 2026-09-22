import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const start=source.indexOf('  async function readFromPill('),end=source.indexOf('  function quick(',start);
function setup(){
 let resolveOpen,now=0;const calls=[],attrs=new Set(),item={key:'TONE:DONE:',unread:true,latest:'100.000001'};
 const env={mode:'cluster',connected:()=>true,pillReadPending:null,pillReadRun:0,disposed:false,
  paintPillDismissal:()=>Promise.resolve(),notificationItems:()=>[item],renderPill:()=>calls.push('render'),schedulePillCollapse:()=>{},touch:()=>{},
  Date:{now:()=>now},setTimeout:fn=>{now+=200;queueMicrotask(fn);},document:{body:{setAttribute:k=>attrs.add(k),removeAttribute:k=>attrs.delete(k)}},
  window:{__PME_REPLY__:{open:async(target,options)=>{calls.push({target,options});return new Promise(r=>resolveOpen=r);},markReadNative:()=>{calls.push('read');item.unread=false;},suspend:()=>calls.push('suspend')}}};
 vm.runInNewContext(source.slice(start,end),env);
 return {env,calls,attrs,item,open:value=>resolveOpen(value)};
}
test('pill read dismisses immediately, opens invisibly without focus, and waits for real unread confirmation',async()=>{
 const s=setup(),pending=s.env.readFromPill({key:s.item.key});await new Promise(r=>setImmediate(r));
 assert.equal(s.env.pillReadPending.key,s.item.key);assert.equal(s.calls[0],'render');
 assert.equal(s.attrs.has('data-pme-background-read'),true);assert.equal(s.calls[1].options.focusEditor,false);
 s.open({ok:true});assert.equal((await pending).ok,true);assert.equal(s.env.pillReadPending,null);
 assert.equal(s.item.unread,false);assert.equal(s.attrs.size,0);assert.equal(s.calls.includes('suspend'),true);
});
test('failed native opening rolls back optimistic dismissal without inventing read state',async()=>{
 const s=setup(),pending=s.env.readFromPill({key:s.item.key});await new Promise(r=>setImmediate(r));s.open({ok:false});
 assert.equal((await pending).ok,false);assert.equal(s.item.unread,true);assert.equal(s.env.pillReadPending,null);assert.equal(s.attrs.size,0);
 assert.equal(s.calls.filter(c=>c==='render').length,2);assert.equal(s.calls.includes('read'),false);
});
test('no confirmation leaves the item unread, and invalid or concurrent targets do not navigate',async()=>{
 const s=setup();assert.equal((await s.env.readFromPill({key:'TOTHER:DOTHER:'})).ok,false);assert.equal(s.calls.length,0);
 s.env.window.__PME_REPLY__.markReadNative=()=>false;
 const pending=s.env.readFromPill({key:s.item.key});await new Promise(r=>setImmediate(r));assert.equal((await s.env.readFromPill({key:s.item.key})).ok,false);s.open({ok:true});
 assert.equal((await pending).ok,false);assert.equal(s.item.unread,true);assert.equal(s.env.pillReadPending,null);
});
test('badge dismissal paints before native navigation starts, and cancellation during paint does not navigate',async()=>{
 for(const cancel of [false,true]){
  const s=setup();let painted;s.env.paintPillDismissal=()=>new Promise(r=>painted=r);
  const pending=s.env.readFromPill({key:s.item.key});assert.deepEqual(s.calls,['render']);assert.ok(s.env.pillReadPending);
  if(cancel){s.env.pillReadRun++;s.env.pillReadPending=null;}
  painted();await new Promise(r=>setImmediate(r));
  if(cancel){assert.equal((await pending).cancelled,true);assert.equal(s.calls.some(c=>typeof c==='object'),false);}
  else{s.open({ok:true});assert.equal((await pending).ok,true);}
 }
});
const repliedStart=source.indexOf('  const repliedPillItems='),repliedEnd=source.indexOf('  const pillItems=',repliedStart);
test('confirmed replies disappear through their sent timestamp, while newer activity and failed read confirmation return',()=>{
 let now=0,renders=0;const env={Date:{now:()=>now},renderPill:()=>renders++};vm.runInNewContext(source.slice(repliedStart,repliedEnd),env);
 const item={key:'TONE:DONE:',latest:'100.000001',unread:true};
 env.dismissRepliedItem({key:item.key,ts:'100.000002'});assert.equal(renders,1);assert.equal(env.replyDismissed(item),true);
 assert.equal(env.replyDismissed({...item,latest:'100.000003'}),false);
 env.dismissRepliedItem({key:item.key,ts:'100.000004'});assert.equal(env.replyDismissed({...item,unread:false}),false);assert.equal(env.replyDismissed(item),false);
 env.dismissRepliedItem({key:item.key,ts:'100.000004'});now=25000;assert.equal(env.replyDismissed(item),false);assert.equal(item.unread,true);
});

test('inbox read uses inbox scope even when notification settings exclude the workspace, and does not change layout',async()=>{
 const s=setup();s.env.mode='queue';s.env.items=()=>[s.item];s.env.notificationItems=()=>[];s.env.render=()=>s.calls.push('inbox-render');
 const pending=s.env.readFromPill({key:s.item.key},{inbox:true});await new Promise(r=>setImmediate(r));
 assert.equal(s.calls[0],'inbox-render');assert.equal(s.calls[1].options.focusEditor,false);assert.equal(s.env.mode,'queue');
 s.open({ok:true});assert.equal((await pending).ok,true);assert.equal(s.calls.at(-1),'inbox-render');assert.equal(s.env.pillReadPending,null);
});


test('inbox unread marks through the native action, suspends the pane, and waits for observed state',async()=>{
 const s=setup();s.item.unread=false;s.env.mode='queue';s.env.items=()=>[s.item];s.env.render=()=>s.calls.push('inbox-render');
 s.env.window.__PME_REPLY__.markUnreadNative=()=>{s.calls.push('unread');s.item.unread=true;return {ok:true};};
 const pending=s.env.readFromPill({key:s.item.key},{inbox:true,unread:true});await new Promise(r=>setImmediate(r));
 assert.equal(s.env.pillReadPending.unread,true);s.open({ok:true});assert.equal((await pending).ok,true);assert.equal(s.calls.includes('read'),false);assert.equal(s.calls.includes('suspend'),true);assert.equal(s.attrs.size,0);
});
test('unread failure rolls back the pending indicator and is never available to the pill read action',async()=>{
 const s=setup();s.item.unread=false;assert.equal((await s.env.readFromPill({key:s.item.key},{unread:true})).ok,false);
 s.env.mode='queue';s.env.items=()=>[s.item];s.env.render=()=>{};s.env.window.__PME_REPLY__.markUnreadNative=()=>({ok:false});
 const pending=s.env.readFromPill({key:s.item.key},{inbox:true,unread:true});await new Promise(r=>setImmediate(r));s.open({ok:true});assert.equal((await pending).error,'unavailable');assert.equal(s.item.unread,false);assert.equal(s.env.pillReadPending,null);assert.equal(s.attrs.size,0);
});


test('unknown inbox items can use explicit native read without a visible opening; pill actions cannot guess',async()=>{
 const s=setup();s.item.unread=null;
 assert.equal((await s.env.readFromPill({key:s.item.key},{resolveUnknown:true})).ok,false);
 s.env.mode='queue';s.env.items=()=>[s.item];s.env.render=()=>s.calls.push('inbox-render');
 const pending=s.env.readFromPill({key:s.item.key},{inbox:true,resolveUnknown:true});await new Promise(r=>setImmediate(r));
 assert.equal(s.env.pillReadPending.unread,false);assert.equal(s.calls[1].options.focusEditor,false);
 s.open({ok:true});assert.equal((await pending).ok,true);assert.equal(s.item.unread,false);
});
test('a known read state resolved from cache can mark an unknown inbox snapshot unread',async()=>{
 const s=setup();s.item.unread=null;s.env.mode='queue';s.env.items=()=>[s.item];s.env.render=()=>{};
 s.env.window.__PME_REPLY__.markUnreadNative=()=>{s.item.unread=true;return {ok:true};};
 const pending=s.env.readFromPill({key:s.item.key},{inbox:true,resolveUnknown:true,unread:true});await new Promise(r=>setImmediate(r));
 s.open({ok:true});assert.equal((await pending).ok,true);assert.equal(s.calls.includes('read'),false);
});

test('cache resolution arriving before the hidden flow can confirm the intended state without navigation',async()=>{
 const s=setup();s.item.unread=false;s.env.mode='queue';s.env.items=()=>[s.item];s.env.render=()=>{};
 assert.equal((await s.env.readFromPill({key:s.item.key},{inbox:true,resolveUnknown:true})).ok,true);
 assert.equal(s.calls.length,0);assert.equal(s.env.pillReadPending,null);
});

test('background read parks the native conversation before releasing its hidden rendering guard',async()=>{
 const s=setup();let finishPark;
 s.env.window.__PME_REPLY__.park=()=>new Promise(r=>{finishPark=r;});
 const pending=s.env.readFromPill({key:s.item.key});await new Promise(r=>setImmediate(r));s.open({ok:true});await new Promise(r=>setImmediate(r));
 assert.equal(s.attrs.has('data-pme-background-read'),true);assert.ok(s.env.pillReadPending);
 finishPark({ok:true});await pending;assert.equal(s.attrs.size,0);assert.equal(s.env.pillReadPending,null);
});
