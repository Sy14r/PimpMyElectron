import {test} from 'node:test';import assert from 'node:assert/strict';import {createActivityRefresher} from '../src/activity-refresh.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
const ok=(nextCursor=null)=>({ok:true,channels:[],countsAvailable:true,threadsAvailable:true,threadsPartial:false,nextCursor});
test('one hour of events, timer ticks and reconnects across twelve workspaces makes zero enrichment calls',async()=>{
  let time=1000,calls=0;const ids=Array.from({length:12},(_,i)=>`T${i}`);
  const r=createActivityRefresher({now:()=>time,load:async()=>{calls++;return ok();},onData(){}});
  for(let second=0;second<3600;second++){
    time+=1000;r.tick(ids);for(const id of ids)r.request(id);r.resume();r.setOnline(false);r.setOnline(true);
  }
  await flush();assert.equal(calls,0);assert.equal(r.status().automaticPolling,false);assert.equal(r.status().queued,0);assert.equal(r.status().workspaces.length,12);r.dispose();
});
test('explicit requests serialize across workspaces and repeated clicks do not queue follow-ups',async()=>{
  const calls=[],finish=[];let active=0,max=0;
  const r=createActivityRefresher({load:q=>{calls.push(q.workspaceId);active++;max=Math.max(max,active);return new Promise(resolve=>finish.push(()=>{active--;resolve(ok());}));},onData(){}});
  for(const id of ['TONE','TTWO','TTHREE','TFOUR'])r.request(id,{reason:'manual'});
  await flush();assert.equal(calls.length,1);assert.equal(r.status().queued,3);
  for(let i=0;i<100;i++)r.request('TONE',{reason:'manual'});
  for(let i=0;i<4;i++){finish.shift()();await flush();}
  assert.deepEqual(calls,['TONE','TTWO','TTHREE','TFOUR']);assert.equal(max,1);assert.equal(r.status().queued,0);r.dispose();
});
test('refresh, pagination and error retries share a one-minute manual limit, with no delayed work',async()=>{
  let time=1000,calls=0,fail=false,updates=0;
  const r=createActivityRefresher({now:()=>time,load:async()=>{calls++;return fail?{ok:false,error:'invalid_auth'}:ok('page2');},onData(){updates++;}});
  r.request('TONE',{reason:'manual'});await flush();fail=true;
  time=60999;assert.equal(r.request('TONE',{more:true,reason:'manual'}),false);
  time=61000;r.request('TONE',{reason:'manual'});await flush();assert.equal(r.get('TONE').status,'error');assert.equal(r.get('TONE').at,1000);
  time+=3600000;r.tick(['TONE']);r.resume();await flush();assert.equal(calls,2);assert.equal(updates,1);
  fail=false;r.request('TONE',{reason:'manual'});await flush();assert.equal(updates,2);r.dispose();
});
test('Retry-After is never shortened and cannot be bypassed by manual, resume or offline signals',async()=>{
  let time=1000,calls=0;const r=createActivityRefresher({now:()=>time,load:async()=>{calls++;return {ok:false,error:'ratelimited',retryAfter:7200};},onData(){}});
  r.request('TONE',{reason:'manual'});await flush();assert.equal(r.get('TONE').retryAt,7201000);
  time=4000000;r.setOnline(false);r.setOnline(true);r.resume();assert.equal(r.request('TONE',{reason:'manual'}),false);
  time=7201000;r.tick(['TONE']);await flush();assert.equal(calls,1);
  r.request('TONE',{reason:'manual'});await flush();assert.equal(calls,2);r.dispose();
});
test('partial data stays visible through pagination, without repeated optional probes',async()=>{
  let time=1000,calls=0;const r=createActivityRefresher({now:()=>time,load:async q=>{calls++;return q.cursor?ok('third'):{...ok('second'),countsAvailable:false};},onData(){}});
  r.request('TONE',{reason:'manual'});await flush();assert.equal(r.get('TONE').status,'partial');
  time+=60000;r.request('TONE',{more:true,reason:'manual'});await flush();
  assert.equal(r.get('TONE').status,'partial');assert.equal(r.get('TONE').countsAvailable,false);assert.equal(r.get('TONE').nextCursor,'third');
  time+=3600000;r.tick(['TONE']);await flush();assert.equal(calls,2);assert.equal(r.get('TONE').nextCursor,'third');r.dispose();
});
test('offline cancels queued enrichment and disposal ignores late responses',async()=>{
  let finish,updates=0,calls=0;const r=createActivityRefresher({load:()=>{calls++;return new Promise(resolve=>finish=resolve);},onData(){updates++;}});
  r.request('TONE',{reason:'manual'});r.request('TTWO',{reason:'manual'});await flush();
  r.setOnline(false);assert.equal(r.status().queued,0);assert.equal(r.request('TTHREE',{reason:'manual'}),false);
  r.dispose();finish(ok());await flush();assert.equal(calls,1);assert.equal(updates,0);
});
