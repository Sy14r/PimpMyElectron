import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/state-observer.js',import.meta.url),'utf8');
const inherited=entries=>Object.create(entries);
function state(id='TONE') {return {selfTeamIds:{teamId:id},channels:inherited({DONE:{id:'DONE',is_im:true,user:'UPEER',unreads:[],unread_highlights:[]}}),
  channelCursors:{DONE:'100.000001'},channelLatests:{DONE:'100.000002'},unreadCounts:{initialUnreads:{DONE:{unreadCnt:1,unreadHighlightCnt:1}}},
  members:inherited({UPEER:{id:'UPEER',profile:{display_name:'Test person',email:'SECRET'},token:'SECRET'}}),
  messages:inherited({DONE:inherited({'100.000001':{ts:'100.000001',text:'root',user:'UPEER',reply_count:1,latest_reply:'100.000002'},'100.000002':{ts:'100.000002',thread_ts:'100.000001',text:'reply',user:'UPEER',files:[{private_url:'SECRET'}]}})}),
  threadSub:inherited({'DONE-100.000001':{id:'DONE-100.000001',subscribed:true,lastRead:'100.000001'}})};}
function setup(initial=[state()]){
  let time=1000,next=0,network=0,dispatches=0;const timers=new Map(),intervals=new Map(),snapshots=[],stores=initial.map(s=>{
    const listeners=new Set();return {state:s,listeners,getState(){return this.state;},subscribe(cb){listeners.add(cb);return()=>listeners.delete(cb);},dispatch(){dispatches++;throw Error('must not dispatch');}};
  });
  const makeRoot=()=>{let first=null;for(const store of stores)first={memoizedProps:{value:{store}},sibling:first};return {__reactContainer$test:{stateNode:{current:first}}};};
  const body={children:[makeRoot()]},accounts={TONE:{id:'TONE',name:'One',token:'SECRET'},TTWO:{id:'TTWO',name:'Two',token:'SECRET'}};
  const window={__pmeClientState:s=>snapshots.push(JSON.parse(s))};window.top=window;
  const location={origin:'https://app.slack.com',pathname:'/client/TONE/DONE'};
  const context={window,document:{body},location,localStorage:{getItem:()=>JSON.stringify({teams:accounts})},Date:{now:()=>time},
    setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{intervals.set(++next,fn);return next;},clearInterval:id=>intervals.delete(id),
    fetch(){network++;throw Error('No API calls');},XMLHttpRequest:class{constructor(){network++;throw Error('No API calls');}},WebSocket:class{constructor(){network++;throw Error('No new sockets');}}};
  vm.runInNewContext(source,context);
  const flush=()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}};
  return {api:window.__PME_OBSERVER__,snapshots,stores,accounts,location,flush,timers,intervals,body,network:()=>network,dispatches:()=>dispatches,
    tick(){time+=10000;for(const fn of intervals.values())fn();flush();},change(i=0){for(const fn of stores[i].listeners)fn();}};
}
test('hydrates inherited cached state for background workspaces without requests, dispatch or credential export',()=>{
  const env=setup([state(),state('TTWO'),state('TUNKNOWN')]);env.flush();
  assert.equal(env.snapshots.length,2);assert.equal(env.api.status().workspaces,2);
  for(const s of env.snapshots){assert.equal(s.channels.length,1);assert.equal(s.channels[0].has_unreads,true);assert.equal(s.channels[0].mentionObserved,true);
    assert.equal(s.users[0].name,'Test person');assert.equal(s.messages.length,2);assert.equal(s.threads[0].last_read,'100.000001');assert.equal(JSON.stringify(s).includes('SECRET'),false);}
  assert.equal(env.network(),0);assert.equal(env.dispatches(),0);env.api.dispose();
});
test('subscriptions coalesce changes, read current state, and do not publish every unrelated action',()=>{
  const env=setup();env.flush();for(let i=0;i<100;i++)env.change();assert.equal(env.timers.size,1);env.flush();assert.equal(env.snapshots.length,1);
  env.stores[0].state=state();env.stores[0].state.unreadCounts.initialUnreads.DONE.unreadCnt=0;
  env.stores[0].state.channelCursors.DONE='100.000002';env.change();env.flush();
  assert.equal(env.snapshots.length,2);assert.equal(env.snapshots.at(-1).channels[0].has_unreads,false);
  env.api.dispose();assert.equal(env.stores[0].listeners.size,0);assert.equal(env.timers.size,0);assert.equal(env.intervals.size,0);
});
test('unknown fields and prototype tombstones stay unknown; getter entries are not executed',()=>{
  const s=state();delete s.unreadCounts.initialUnreads.DONE;s.channels.DDELETED=undefined;
  Object.defineProperty(Object.getPrototypeOf(s.channels),'DBAD',{enumerable:true,get(){throw Error('getter must not execute');}});
  const env=setup([s]);env.flush();assert.equal(env.snapshots[0].channels.length,1);assert.equal(env.snapshots[0].channels[0].has_unreads,undefined);
  assert.equal(env.api.status().errors,0);env.api.dispose();
});
test('removing an account or unmounting its provider stops observation and releases subscriptions',()=>{
  const env=setup([state(),state('TTWO')]);env.flush();delete env.accounts.TTWO;env.tick();assert.equal(env.api.status().workspaces,1);assert.equal(env.stores[1].listeners.size,0);
  env.body.children=[];env.tick();assert.equal(env.api.status().workspaces,0);assert.equal(env.stores[0].listeners.size,0);env.api.dispose();
});
test('large cached histories are bounded and visibly partial, including the binding payload',()=>{
  const s=state();s.messages=inherited({DONE:inherited(Object.fromEntries(Array.from({length:500},(_,i)=>[`${100+i}.000001`,{ts:`${100+i}.000001`,text:'x'.repeat(5000),user:'UPEER'}])))});
  const env=setup([s]);env.flush();const result=env.snapshots[0];assert.equal(result.truncated,true);assert.ok(result.messages.length<=200);assert.ok(JSON.stringify(result).length<=300000);
  assert.equal(result.messages[0].ts,'599.000001');assert.ok(result.messages.every(m=>m.text.length<=4000));env.api.dispose();
});
test('a live unread signal does not need a startup count to become visible',()=>{
  const s=state();delete s.unreadCounts.initialUnreads.DONE;s.channels.DONE={...s.channels.DONE,unreads:['101.000001'],unread_highlights:['101.000001']};
  const env=setup([s]);env.flush();assert.equal(env.snapshots[0].channels[0].has_unreads,true);assert.equal(env.snapshots[0].channels[0].mentionObserved,true);env.api.dispose();
});
test('cached state from a different account in the same workspace is not exported',()=>{
  const s=state();s.bootData={user_id:'UOLD'};const env=setup([s]);env.accounts.TONE.user_id='UNEW';env.flush();assert.equal(env.snapshots.length,0);env.api.dispose();
});
test('live per-channel counts reveal new DMs in both workspaces while startup counts and arrays stay empty',()=>{
  const one=state(),two=state('TTWO');
  for(const s of [one,two])s.unreadCounts.initialUnreads.DONE={unreadCnt:0,unreadHighlightCnt:0};
  const env=setup([one,two]);env.flush();assert.ok(env.snapshots.every(s=>s.channels[0].has_unreads===false));
  for(let i=0;i<2;i++){
    const s=env.stores[i].state;
    env.stores[i].state={...s,unreadCounts:{...s.unreadCounts,countsPerChannel:inherited({DONE:{unreadCnt:1,unreadHighlightCnt:1}})}};
    env.change(i);
  }
  env.flush();assert.equal(env.snapshots.length,4);
  for(const s of env.snapshots.slice(-2)){assert.equal(s.channels[0].has_unreads,true);assert.equal(s.channels[0].mentionObserved,true);assert.equal(s.channels[0].unread_count,undefined);}
  assert.equal(env.network(),0);assert.equal(env.dispatches(),0);env.api.dispose();
});
test('live zero counts clear unread and mentions despite stale positive startup counts and arrays',()=>{
  const s=state();s.channels.DONE={...s.channels.DONE,unreads:['100.000002'],unread_highlights:['100.000002']};
  s.unreadCounts.countsPerChannel=inherited({DONE:{unreadCnt:1,unreadHighlightCnt:1}});
  const env=setup([s]);env.flush();assert.equal(env.snapshots[0].channels[0].has_unreads,true);
  env.stores[0].state={...s,unreadCounts:{...s.unreadCounts,countsPerChannel:inherited({DONE:{unreadCnt:0,unreadHighlightCnt:0}})}};
  env.change();env.flush();const row=env.snapshots.at(-1).channels[0];
  assert.equal(row.has_unreads,false);assert.equal(row.mentionObserved,false);env.api.dispose();
});
test('live counts work without startup metadata and missing fields remain unknown independently',()=>{
  const s=state();delete s.unreadCounts.initialUnreads.DONE;
  s.unreadCounts.countsPerChannel=inherited({DONE:{unreadCnt:0}});
  const env=setup([s]);env.flush();const row=env.snapshots[0].channels[0];
  assert.equal(row.has_unreads,false);assert.equal(row.mentionObserved,undefined);env.api.dispose();
});
test('removing a live count after reading falls back to the cleared startup state',()=>{
  const s=state();s.unreadCounts.initialUnreads.DONE={unreadCnt:0,unreadHighlightCnt:0};
  s.unreadCounts.countsPerChannel=inherited({DONE:{unreadCnt:1,unreadHighlightCnt:1}});
  const env=setup([s]);env.flush();assert.equal(env.snapshots[0].channels[0].has_unreads,true);
  const counts=Object.create(s.unreadCounts.countsPerChannel);counts.DONE=undefined;
  env.stores[0].state={...s,channelCursors:{DONE:'100.000002'},unreadCounts:{...s.unreadCounts,countsPerChannel:counts}};
  env.change();env.flush();assert.equal(env.snapshots.at(-1).channels[0].has_unreads,false);
  assert.equal(env.snapshots.at(-1).channels[0].mentionObserved,false);env.api.dispose();
});
