import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivityStore, requestMetadata, compareTs } from '../src/activity-store.mjs';
const meta = (method, extra = {}) => ({ method, workspaceId: 'TONE', channelId: 'CONE', ...extra });
const item = (s, channel = 'CONE', team = 'TONE') => s.snapshot().workspaces.find(w => w.id === team)?.items.find(i => i.channelId === channel && !i.threadTs);

test('request metadata accepts Slack endpoints and retains no credentials', () => {
  for (const body of [JSON.stringify({team_id:'TONE',channel:'CONE',token:'SECRET'}),
    'team_id=TONE&channel=CONE&token=SECRET',
    '--boundary\r\nContent-Disposition: form-data; name="channel"\r\n\r\nCONE\r\n--boundary\r\nContent-Disposition: form-data; name="token"\r\n\r\nSECRET\r\n']) {
    assert.deepEqual(requestMetadata({url:'https://app.slack.com/api/conversations.history?token=SECRET',postData:body,headers:{Authorization:'SECRET'}},'TONE'),meta('conversations.history',{threadTs:null}));
  }
  for (const url of ['https://slack.com.evil.test/api/client.boot','http://slack.com/api/client.boot','https://other.test/api/client.boot','https://slack.com/not-api']) assert.equal(requestMetadata({url},'TONE'),null);
});

test('unknown unread stays unknown; DOM flags do not invent or keep stale exact counts', () => {
  let now=1000;const s=new ActivityStore({now:()=>now});
  s.ingest(meta('conversations.list'),{ok:true,channels:[{id:'CONE',name:'general'}]});
  assert.equal(item(s).unread,null);assert.equal(item(s).unreadCount,null);
  s.ingest(meta('client.counts'),{channels:[{id:'CONE',unread_count:3}]});
  assert.equal(item(s).unreadCount,3);
  s.ingestDOM({workspaceId:'TONE',conversations:[{channelId:'CONE',unread:true,unreadObserved:true}]});
  assert.equal(item(s).unread,true);assert.equal(item(s).unreadCount,null);
  now+=61000;assert.equal(item(s).countsStale,true);
  s.ingestDOM({workspaceId:'TONE',conversations:[{channelId:'CONE',unread:false,unreadObserved:true}]});
  assert.equal(item(s).unread,false);assert.equal(item(s).unreadCount,0);assert.equal(item(s).countsStale,false);
});

test('failed reads retain observations and mismatched workspace data is rejected', () => {
  const s=new ActivityStore();
  s.ingest(meta('conversations.history'),{messages:[{ts:'100.000001',text:'one'}]});
  assert.equal(s.ingest(meta('conversations.history'),{ok:false,messages:[]}),false);
  for(const team of ['TTWO',{id:'TTWO'}]) assert.equal(s.ingest(meta('conversations.history'),{team,messages:[{ts:'100.000002',text:'wrong workspace'}]}),false);
  assert.equal(s.ingestEvent('TONE',{type:'message',team:'TTWO',channel:'CONE',ts:'100.000002',text:'wrong'}),false);
  assert.equal(item(s).messages.length,1);
  s.ingest(meta('conversations.history',{workspaceId:'TTWO'}),{messages:[{ts:'100.000001',text:'two'}]});
  assert.equal(item(s,'CONE','TTWO').messages[0].text,'two');
  assert.equal(s.ingest(meta('chat.postMessage'),{messages:[{ts:'200.000001',text:'wrong method'}]}),false);
});

test('socket duplicate, edit, and delete reconcile captured channel messages', () => {
  const s=new ActivityStore();
  const msg={type:'message',team:'TONE',channel:'CONE',ts:'100.000001',user:'UONE',text:'hello',files:[{id:'FONE'}]};
  s.ingestEvent('TONE',msg);s.ingestEvent('TONE',msg);
  assert.equal(item(s).messages.length,1);assert.equal(item(s).unread,null);
  s.ingestDOM({workspaceId:'TONE',channelId:'CONE',messages:[{ts:msg.ts,text:'hello',author:'Person'}]});
  assert.equal(item(s).messages[0].hasAttachments,true);assert.equal(item(s).messages[0].userId,'UONE');
  s.ingestEvent('TONE',{...msg,subtype:'message_changed',message:{ts:msg.ts,text:'edited'}});
  assert.equal(item(s).messages[0].text,'edited');
  s.ingestEvent('TONE',{...msg,subtype:'message_deleted',deleted_ts:msg.ts});
  assert.equal(item(s).messages.length,0);assert.equal(item(s).latest,null);
});

test('thread events create a separate reader and deleting root removes its captured thread', () => {
  const s=new ActivityStore();
  s.ingest(meta('conversations.list'),{channels:[{id:'CONE',name:'general'}]});
  s.ingestEvent('TONE',{type:'message',channel:'CONE',ts:'100.000002',thread_ts:'100.000001',text:'reply'});
  const thread=s.snapshot().workspaces[0].items.find(i=>i.kind==='thread');
  assert.equal(thread.name,'general');assert.equal(thread.messages[0].text,'reply');assert.equal(item(s).messages.length,0);
  s.ingestEvent('TONE',{type:'message',subtype:'message_deleted',channel:'CONE',deleted_ts:'100.000001'});
  assert.equal(s.snapshot().workspaces[0].items.some(i=>i.kind==='thread'),false);
});

test('timestamp ordering preserves precision and capture storage is bounded', () => {
  assert.ok(compareTs('9999999999.000001','9999999999.000002')<0);
  assert.ok(compareTs('9.9','10.1')<0);assert.equal(compareTs('100.1','100.100000'),0);
  const s=new ActivityStore({maxMessages:70,maxItems:2,maxWorkspaces:1,maxUsers:2});
  for(const channelId of ['CONE','CTWO']) s.ingest(meta('conversations.history',{channelId}),{messages:Array.from({length:100},(_,i)=>({ts:`100.${String(i).padStart(6,'0')}`,text:'x'.repeat(5000)}))});
  assert.equal(s.status().messages,70);
  assert.ok(s.snapshot().workspaces[0].items.every(i=>i.messages.length<=60&&i.messages.every(m=>m.text.length<=4000)));
  s.ingest(meta('conversations.list'),{channels:[{id:'CTHREE'}]});assert.equal(s.status().conversations,2);
  s.ingest(meta('users.list'),{members:[{id:'UONE'},{id:'UTWO'},{id:'UTHREE'}]});assert.equal(s.workspaces.get('TONE').users.size,2);
  s.ingest(meta('conversations.list',{workspaceId:'TTWO'}),{channels:[{id:'CONE'}]});assert.equal(s.status().workspaces,1);assert.equal(item(s),undefined);
});

test('older discovery cannot roll back activity; thread latest-reply timestamps advance independently',()=>{
  const store=new ActivityStore();
  store.ingest({method:'users.conversations',workspaceId:'TONE'},{ok:true,channels:[{id:'CONE',latest:'200.000001'}]});
  store.ingest({method:'client.counts',workspaceId:'TONE'},{ok:true,channels:[{id:'CONE',latest:'100.000001',has_unreads:true}]});
  assert.equal(store.snapshot().workspaces[0].items[0].latest,'200.000001');
  store.ingest({method:'subscriptions.thread.getView',workspaceId:'TONE'},{ok:true,threads:[{root_msg:{channel:'CONE',ts:'100.000001',latest_reply:'300.000001'},unread_replies:1}]});
  const thread=store.snapshot().workspaces[0].items.find(i=>i.threadTs);
  assert.equal(thread.latest,'300.000001');assert.equal(thread.messages[0].ts,'100.000001');
});
