import {test} from 'node:test';import assert from 'node:assert/strict';
import {createSendConfirmation} from '../src/send-confirmation.mjs';
const target={id:'attempt-1',workspaceId:'TONE',channelId:'DONE',threadTs:null};
const meta={method:'chat.postMessage',workspaceId:'TONE',channelId:'DONE',threadTs:null};
const ok={ok:true,channel:'DONE',ts:'100.000001',message:{}};
test('send confirmation requires a current native attempt and matching destination',()=>{
 const c=createSendConfirmation();assert.equal(c.request('s1',meta),null);assert.equal(c.begin('s1',target),true);
 for(const patch of [{workspaceId:'TTWO'},{channelId:'DOTHER'},{threadTs:'1.0'},{method:'chat.scheduleMessage'}])assert.equal(c.request('s1',{...meta,...patch}),null);
 assert.equal(c.request('s2',meta),null);
 const r=c.request('s1',meta);assert.equal(c.complete('s1',r,{ok:false}),null);
 assert.equal(c.complete('s1',r,{...ok,channel:'DOTHER'}),null);
 assert.equal(c.complete('s1',r,{...ok,message:{thread_ts:'1.0'}}),null);
 assert.deepEqual(c.complete('s1',r,ok),{id:target.id,ts:ok.ts});assert.equal(c.complete('s1',r,ok),null);
});
test('thread replies, replaced attempts, expiry and cleanup fail closed',()=>{
 let now=0;const c=createSendConfirmation({now:()=>now});c.begin('s1',{...target,threadTs:'2.0'});
 const r=c.request('s1',{...meta,threadTs:'2.0'});assert.equal(c.complete('s1',r,ok),null);
 c.begin('s1',{...target,id:'attempt-2',threadTs:'2.0'});assert.equal(c.complete('s1',r,{...ok,message:{thread_ts:'2.0'}}),null);
 const r2=c.request('s1',{...meta,threadTs:'2.0'});now=30001;assert.equal(c.complete('s1',r2,{...ok,message:{thread_ts:'2.0'}}),null);
 c.begin('s1',target);now+=15001;assert.equal(c.request('s1',meta),null);c.clear('s1');assert.equal(c.request('s1',meta),null);
});
test('native sends without request team metadata require explicit matching team evidence in the response',()=>{
 const c=createSendConfirmation();c.begin('s1',target);
 const request=c.request('s1',{...meta,workspaceId:null});assert.ok(request);
 assert.equal(c.complete('s1',request,ok),null);
 assert.equal(c.complete('s1',request,{...ok,message:{team:'TTWO'}}),null);
 assert.deepEqual(c.complete('s1',request,{...ok,message:{team:'TONE'}}),{id:target.id,ts:ok.ts});
});
