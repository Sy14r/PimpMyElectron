import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActivityStore} from '../src/activity-store.mjs';
import {createHistoryLoader} from '../src/history-loader.mjs';
function setup(read,options={}){
  const store=new ActivityStore(options);store.ingest({method:'client.counts',workspaceId:'TONE'},{channels:[{id:'CONE',has_unreads:true}]});
  const key='TONE:CONE:';return{store,key,item:store.workspaces.get('TONE').items.get(key),loader:createHistoryLoader({store,read,...options})};
}
test('opening known conversation loads, deduplicates, preserves unread and pages older',async()=>{
  const calls=[];let release;
  const {store,key,item,loader}=setup(async request=>{calls.push(request);if(calls.length===1)await new Promise(r=>release=r);
    return{ok:true,messages:[{ts:request.cursor?'100.000001':'100.000002',text:'message'}],hasMore:!request.cursor,nextCursor:request.cursor?null:'page2'};});
  const p=loader.load('TONE',key);assert.equal(loader.load('TONE',key),p);release();await p;
  assert.equal(calls.length,1);assert.equal(item.unread,true);assert.equal(item.history.status,'ready');
  await loader.load('TONE',key);assert.equal(calls.length,1);
  await loader.load('TONE',key,'older');assert.equal(calls[1].cursor,'page2');assert.equal(item.messages.size,2);assert.equal(item.history.nextCursor,null);
  assert.equal('nextCursor' in store.snapshot().workspaces[0].items[0].history,false);loader.dispose();
});
test('invalid scope/action are refused, failures keep loaded messages, and retry-after is honored',async()=>{
  let calls=0,now=1000;const {key,item,loader}=setup(async()=>{calls++;return calls===1?{ok:true,messages:[{ts:'100.000001',text:'keep'}]}:{ok:false,error:'ratelimited',retryAfter:10};},{now:()=>now});
  await loader.load('TTWO',key);await loader.load('TONE','TONE:CTWO:');await loader.load('TONE',key,'send');assert.equal(calls,0);
  await loader.load('TONE',key);await loader.load('TONE',key,'refresh');assert.equal(item.history.status,'error');assert.equal(item.messages.size,1);
  await loader.load('TONE',key,'refresh');assert.equal(calls,2);now+=11000;await loader.load('TONE',key,'refresh');assert.equal(calls,3);loader.dispose();
});
test('bounded pagination stops and dispose discards in-flight results',async()=>{
  const first=setup(async()=>({ok:true,messages:[{ts:'100.000001',text:'x'}],hasMore:true,nextCursor:'page'}),{maxMessagesPerItem:1});
  await first.loader.load('TONE',first.key);assert.equal(first.item.history.bounded,true);assert.equal(await first.loader.load('TONE',first.key,'older'),false);first.loader.dispose();
  let release;const second=setup(()=>new Promise(r=>release=r));const pending=second.loader.load('TONE',second.key);second.loader.dispose();release({ok:true,messages:[{ts:'100.000001',text:'late'}]});await pending;assert.equal(second.item.messages.size,0);
});
test('history roots create selectable thread readers without marking their parent read',async()=>{
  const {store,key,item,loader}=setup(async()=>({ok:true,messages:[{ts:'100.000001',text:'root',reply_count:2}],hasMore:false}));
  await loader.load('TONE',key);const thread=store.snapshot().workspaces[0].items.find(i=>i.kind==='thread');
  assert.equal(thread.threadTs,'100.000001');assert.equal(thread.messages[0].text,'root');assert.equal(item.unread,true);loader.dispose();
});
