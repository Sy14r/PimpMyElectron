import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';
import {ActivityStore} from '../src/activity-store.mjs';import {createReadMarker} from '../src/read-marker.mjs';
const source=await fs.readFile(new URL('../src/renderer/mark-read.js',import.meta.url),'utf8');
const response=(body,status=200)=>({ok:status===200,status,headers:{get:()=> '60'},text:async()=>JSON.stringify(body)});
function setup(respond=()=>response({ok:true}),identity={ok:true,team_id:'TTWO',user_id:'UTWO'}){
  const calls=[],teams={TTWO:{id:'TTWO',user_id:'UTWO',token:'private-test-token'}},location={origin:'https://app.slack.com',pathname:'/client/TONE/CONE'};
  const window={};window.top=window;
  vm.runInNewContext(source,{window,location,AbortController,AbortSignal,URLSearchParams,Date,localStorage:{getItem:()=>JSON.stringify({teams})},
    fetch:async(url,options)=>{calls.push({url,fields:Object.fromEntries(options.body),options});return url.endsWith('auth.test')?response(identity):respond(url,options);}});
  return {api:window.__PME_MARK_READ__,calls,teams,location};
}
const request={workspaceId:'TTWO',channelId:'DTWO',ts:'100.000002'};
test('explicit mark verifies identity, sends the frozen timestamp once, and reports newer unread activity',async()=>{
  let reads=0;const env=setup(url=>url.endsWith('client.counts')?response({ok:true,ims:[{id:'DTWO',last_read:++reads===1?'100.000001':'100.000002',has_unreads:true,latest:'100.000003',secret:'private'}]}):response({ok:true}));
  const r=await env.api.mark(request);assert.equal(r.ok,true);assert.equal(r.confirmed,true);assert.equal(r.counts.row.has_unreads,true);
  assert.deepEqual(env.calls.map(c=>c.url),['/api/auth.test','/api/client.counts','/api/conversations.mark','/api/client.counts']);
  assert.deepEqual(env.calls[2].fields,{token:'private-test-token',_x_team_id:'TTWO',channel:'DTWO',ts:request.ts});
  assert.equal(env.calls[2].options.redirect,'error');assert.equal(JSON.stringify(r).includes('private'),false);env.api.dispose();
});
test('already advanced cursors, missing cursor, invalid timestamps and thread requests cannot write',async()=>{
  for(const cursor of ['100.000003',null]){
    const env=setup(()=>response({ok:true,ims:cursor?[{id:'DTWO',last_read:cursor,has_unreads:false}]:[]}));
    const r=await env.api.mark(request);assert.equal(r.ok,!!cursor);assert.equal(env.calls.some(c=>c.url.endsWith('conversations.mark')),false);env.api.dispose();
  }
  const env=setup();for(const r of [{...request,ts:'999;bad'},{...request,threadTs:'100.000001'},{...request,channelId:'../chat.postMessage'}])assert.equal((await env.api.mark(r)).error,'invalid_request');assert.equal(env.calls.length,0);env.api.dispose();
});
test('identity mismatch and credential rotation prevent writes',async()=>{
  const env=setup(undefined,{ok:true,team_id:'TWRONG',user_id:'UTWO'});assert.equal((await env.api.mark(request)).error,'workspace_mismatch');assert.equal(env.calls.length,1);env.api.dispose();
  let changed;changed=setup(()=>{changed.teams.TTWO.token='rotated';return response({ok:true,ims:[{id:'DTWO',last_read:'100.000001'}]});});
  assert.equal((await changed.api.mark(request)).error,'workspace_changed');assert.equal(changed.calls.some(c=>c.url.endsWith('conversations.mark')),false);changed.api.dispose();
});
test('uncertain writes are not retried; accepted writes with failed verification remain saved',async()=>{
  for(const accepted of [false,true]){
    let counts=0,writes=0;const env=setup(url=>{
      if(url.endsWith('client.counts')){if(++counts>1)throw Error('offline');return response({ok:true,ims:[{id:'DTWO',last_read:'100.000001'}]});}
      writes++;if(!accepted)throw Error('connection lost');return response({ok:true});
    });
    const result=await env.api.mark(request);assert.equal(writes,1);assert.equal(result.ok,accepted);assert.equal(accepted?result.confirmed:result.error,accepted?false:'outcome_unknown');env.api.dispose();
  }
});
test('rate limits and concurrent duplicate actions never trigger a second write',async()=>{
  let release;const gate=new Promise(r=>release=r);let marks=0;
  const env=setup(async url=>{if(url.endsWith('client.counts'))return response({ok:true,ims:[{id:'DTWO',last_read:'100.000001'}]});marks++;await gate;return response({},429);});
  const first=env.api.mark(request);assert.equal((await env.api.mark(request)).error,'busy');release();assert.equal((await first).error,'ratelimited');assert.equal((await env.api.mark(request)).error,'ratelimited');assert.equal(marks,1);env.api.dispose();
});
test('host marker rejects unloaded/thread destinations and keeps the selected timestamp across new activity',async()=>{
  const store=new ActivityStore();store.ingestDOM({workspaceId:'TTWO',channelId:'DTWO',messages:[{ts:'100.000002',text:'seen'}]});
  const item=store.workspaces.get('TTWO').items.get('TTWO:DTWO:');const thread=store.upsert(store.workspace('TTWO'),'DTWO',{},'100.000001');store.message(store.workspace('TTWO'),thread,{ts:'100.000002'});
  let release,calls=[];const gate=new Promise(r=>release=r);const marker=createReadMarker({store,mark:async r=>{calls.push(r);await gate;return {ok:true,confirmed:true,counts:{group:'ims',row:{id:'DTWO',last_read:r.ts,has_unreads:true}}};}});
  assert.equal(await marker.mark('TTWO',item.key,'100.000099'),false);assert.equal(await marker.mark('TTWO',thread.key,'100.000002'),false);assert.equal(await marker.mark('TWRONG',item.key,'100.000002'),false);
  const one=marker.mark('TTWO',item.key,'100.000002'),two=marker.mark('TTWO',item.key,'100.000002');assert.equal(one,two);
  store.message(store.workspace('TTWO'),item,{ts:'100.000003',text:'arrived while marking'});release();assert.equal(await one,true);
  assert.equal(calls.length,1);assert.equal(calls[0].ts,'100.000002');assert.equal(item.unread,true);assert.equal(item.kind,'dm');assert.equal(item.latest,'100.000003');assert.equal(marker.state(item.key).status,'success');marker.dispose();
});
