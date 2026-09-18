import {test} from 'node:test';import assert from 'node:assert/strict';import {createActivityRefresher} from '../src/activity-refresh.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
const ok=(nextCursor=null)=>({ok:true,channels:[],countsAvailable:true,threadsAvailable:true,threadsPartial:false,nextCursor});
test('four workspaces drain fairly through two slots without dropping queued requests',async()=>{
  const calls=[],finish=[];let active=0,max=0;
  const r=createActivityRefresher({load:q=>{calls.push(q.workspaceId);active++;max=Math.max(max,active);return new Promise(resolve=>finish.push(()=>{active--;resolve(ok());}));},onData(){}});
  for(const id of ['TONE','TTWO','TTHREE','TFOUR'])r.request(id,{reason:'manual'});
  await flush();assert.equal(calls.length,2);assert.equal(r.status().queued,2);finish.shift()();await flush();assert.equal(calls.length,3);finish.shift()();await flush();assert.equal(calls.length,4);
  for(const done of finish)done();await flush();assert.equal(max,2);assert.equal(r.status().queued,0);assert.equal(r.status().active,0);r.dispose();
});
test('failed reads preserve last successful data/time and recover automatically with backoff',async()=>{
  let time=1000,fail=false,calls=0,updates=0;
  const r=createActivityRefresher({now:()=>time,load:async()=>{calls++;return fail?{ok:false,error:'offline'}:ok();},onData(){updates++;}});
  r.tick(['TONE']);await flush();assert.equal(r.get('TONE').at,1000);fail=true;time=121000;r.tick(['TONE']);await flush();
  assert.equal(r.get('TONE').status,'error');assert.equal(r.get('TONE').at,1000);assert.equal(updates,1);
  time=125000;r.tick(['TONE']);await flush();assert.equal(calls,2);
  time=131000;fail=false;r.tick(['TONE']);await flush();assert.equal(r.get('TONE').status,'ready');assert.equal(updates,2);r.dispose();
});
test('rate-limit deadlines survive reconnect signals, while offline local state is retained',async()=>{
  let time=1000,calls=0;const r=createActivityRefresher({now:()=>time,load:async()=>{calls++;return calls===1?{ok:false,error:'ratelimited',retryAfter:90}:ok();},onData(){}});
  r.tick(['TONE']);await flush();assert.equal(r.get('TONE').retryAt,91000);
  r.setOnline(false);time=50000;r.tick(['TONE']);r.setOnline(true);r.resume();await flush();assert.equal(calls,1);
  time=91000;r.tick(['TONE']);await flush();assert.equal(calls,2);assert.equal(r.get('TONE').status,'ready');r.dispose();
});
test('online transition refreshes before normal interval, coalescing repeated resume signals',async()=>{
  let time=1000,calls=0;const r=createActivityRefresher({now:()=>time,load:async()=>{calls++;return ok();},onData(){}});
  r.tick(['TONE']);await flush();r.setOnline(false);time=20000;r.tick(['TONE']);await flush();assert.equal(calls,1);
  r.setOnline(true);r.resume();r.resume();await flush();assert.equal(calls,2);
  // Signals received during the in-flight refresh may schedule one follow-up,
  // but never a concurrent duplicate or a request storm.
  r.tick(['TONE']);await flush();assert.equal(calls,2);r.dispose();
});
test('periodic refresh preserves discovery paging; partial counts stay visibly partial',async()=>{
  let time=1000;const cursors=[],r=createActivityRefresher({now:()=>time,load:async q=>{cursors.push(q.cursor);return q.cursor==='page2'?ok('page3'):ok('page2');},onData(){}});
  r.tick(['TONE']);await flush();time+=10000;r.request('TONE',{more:true,reason:'manual'});await flush();assert.equal(r.get('TONE').nextCursor,'page3');
  time+=120000;r.tick(['TONE']);await flush();assert.equal(r.get('TONE').nextCursor,'page3');assert.deepEqual(cursors,[null,'page2',null]);r.dispose();
  const partial=createActivityRefresher({now:()=>time,load:async()=>({...ok(),countsAvailable:false}),onData(){}});partial.tick(['TONE']);await flush();assert.equal(partial.get('TONE').status,'partial');assert.equal(partial.get('TONE').countsAt,0);assert.equal(partial.get('TONE').nextAt,time+15000);partial.dispose();
});
test('disposal ignores late responses and does not start queued work',async()=>{
  let finish,updates=0,calls=0;const r=createActivityRefresher({load:()=>{calls++;return new Promise(resolve=>finish=resolve);},onData(){updates++;}});
  r.request('TONE');await flush();r.dispose();finish(ok());await flush();r.request('TTWO');assert.equal(calls,1);assert.equal(updates,0);
});
test('loading another discovery page does not hide missing unread counts or postpone their retry',async()=>{
  let time=1000;const r=createActivityRefresher({now:()=>time,load:async q=>q.cursor?ok('third'):{...ok('second'),countsAvailable:false},onData(){}});
  r.tick(['TONE']);await flush();const retry=r.get('TONE').nextAt;
  time+=10000;r.request('TONE',{more:true,reason:'manual'});await flush();
  assert.equal(r.get('TONE').status,'partial');assert.equal(r.get('TONE').countsAvailable,false);assert.equal(r.get('TONE').nextAt,retry);r.dispose();
});
