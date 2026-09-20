import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const start=source.indexOf('  function schedulePillCollapse()'),end=source.indexOf("  shadow.addEventListener('pointermove'",start);
assert.ok(start>0&&end>start);
function setup({mode='cluster',seconds=15}={}){
 let now=0,id=0;const timers=new Map(),transitions=[];
 const env={pillReadPending:null,snapshot:{},mode,disposed:false,pillIdleTimer:null,pillPointerInside:false,hoverTimer:null,hoverIntent:null,settings:{idleSeconds:seconds},lastInteraction:0,
  Date:{now:()=>now},window:{},transition:next=>{transitions.push({next,at:now});env.mode=next;},
  setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:key=>timers.delete(key)};
 vm.runInNewContext(source.slice(start,end),env);
 async function advance(ms){const until=now+ms;while(true){const due=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);await due[1].fn();}now=until;}
 return {env,advance,transitions,timers};
}
test('leaving the pill waits the full configured delay instead of the old 600ms timeout',async()=>{
 const {env,advance,transitions}=setup();env.pillHover(true);env.pillHover(false);
 await advance(600);assert.deepEqual(transitions,[]);await advance(14399);assert.deepEqual(transitions,[]);
 await advance(1);assert.deepEqual(transitions,[{next:'strip',at:15000}]);
});
test('returning to the pill cancels collapse and leaving again starts a fresh countdown',async()=>{
 const {env,advance,transitions}=setup();env.pillHover(true);env.pillHover(false);await advance(14000);env.pillHover(true);
 await advance(60000);assert.deepEqual(transitions,[]);env.pillHover(false);await advance(14999);assert.deepEqual(transitions,[]);
 await advance(1);assert.deepEqual(transitions,[{next:'strip',at:89000}]);
});
test('repeated outside cursor polls do not extend the countdown',async()=>{
 const {env,advance,transitions}=setup();env.pillHover(true);env.pillHover(false);
 for(let i=0;i<100;i++){await advance(150);env.pillHover(false);}
 assert.deepEqual(transitions,[{next:'strip',at:15000}]);
});
test('Never disables automatic collapse, including on pointer leave',async()=>{
 const {env,advance,transitions}=setup({seconds:0});env.pillHover(true);env.pillHover(false);await advance(600000);assert.deepEqual(transitions,[]);
});
test('inbox and detail views never arm the pill countdown',async()=>{
 for(const mode of ['queue','reply','reading','stock','strip','hidden']){
  const {env,advance,transitions}=setup({mode});env.touch();await advance(60000);assert.deepEqual(transitions,[],mode);
 }
});
test('activity and a changed delay are honored before a pending timer collapses',async()=>{
 const {env,advance,transitions}=setup();env.touch();await advance(10000);env.touch();env.settings.idleSeconds=30;
 await advance(29999);assert.deepEqual(transitions,[]);await advance(1);assert.deepEqual(transitions,[{next:'strip',at:40000}]);
});
test('a stale callback cannot collapse after the view changes or the module is disposed',async()=>{
 for(const update of [e=>e.mode='queue',e=>e.disposed=true,e=>e.settings.idleSeconds=0]){
  const {env,advance,transitions}=setup();env.touch();update(env);await advance(20000);assert.deepEqual(transitions,[]);
 }
});
test('hovering the native preview pauses a pending pill collapse',async()=>{
 const {env,advance,transitions}=setup({seconds:5});env.touch();await advance(4500);env.snapshot.previewHeld=true;
 await advance(10000);assert.deepEqual(transitions,[]);
 env.snapshot.previewHeld=false;env.touch();await advance(4999);assert.deepEqual(transitions,[]);
 await advance(1);assert.equal(transitions[0].next,'strip');
});
