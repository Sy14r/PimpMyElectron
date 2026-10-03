import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
function functionSource(startText,endText){const start=source.indexOf(startText)+startText.length,end=source.indexOf(endText,start);assert.ok(start>=startText.length&&end>start);return source.slice(start,end);}
const transitionSource='function transition('+functionSource('function transition(',"  shadow.addEventListener('click'");
function motionEnv(mode,{reduced=false,staged=false}={}){
 const calls=[],env={transitionEpoch:0,setInboxGlass:async()=>false,focusInbox:()=>{},workspaceDialog:{open:false},aliasDialog:{open:false},densityMenu:{matches:()=>false},mode,pillReadPending:null,quickReply:null,disposed:false,stagedDetail:staged,innerWidth:mode==='queue'||staged?420:820,openSequence:0,openingKey:null,
  hoverTimer:0,hoverIntent:null,pillIdleTimer:0,pillPointerInside:false,touch(){},schedulePillCollapse(){},clearTimeout(){},setPillPreview(){},nativeQueue:Promise.resolve(),document:{activeElement:null},
  window:{matchMedia:()=>({matches:reduced}),__PME_REPLY__:{status:()=>({ready:false}),suspend:()=>calls.push('suspend'),status:()=>({ready:true})}},
  setDetailMotion:()=>calls.push('mask'),clearDetailMotion:()=>{calls.push('unmask');env.stagedDetail=false;},
  concealWindow:async()=>calls.push('hide'),applyLayout:()=>calls.push('layout:'+env.mode),render(){},geometry:async(next,options)=>calls.push(`geometry:${next}:${options.animate}`),
  $:()=>({focus(){}}),reportShell(){}};
 vm.runInNewContext(transitionSource,env);return {env,calls};
}
test('closing slides the mounted native pane before suspending it and changing queue layout',async()=>{
 const {env,calls}=motionEnv('reply');await env.transition('queue');
 assert.ok(calls.indexOf('geometry:queue:true')<calls.indexOf('suspend'));
 assert.ok(calls.indexOf('suspend')<calls.indexOf('layout:queue'));
 assert.equal(calls.at(-1),'unmask');
});
test('staging establishes the covered pane before starting its reveal',async()=>{
 const {env,calls}=motionEnv('queue');await env.transition('reply',{stage:true});
 assert.equal(calls.some(c=>c.startsWith('geometry:')),false);assert.equal(env.stagedDetail,true);
 await env.transition('reply');assert.ok(calls.includes('geometry:reply:true'));assert.equal(env.stagedDetail,false);
});

const startReplySource='async function startReply('+functionSource('async function startReply(','  function startCompose(');
function openingEnv(){
 const calls=[];let loaded,revealed;
 const loading=new Promise(resolve=>{loaded=resolve;}),reveal=new Promise(resolve=>{revealed=resolve;});
 const env={clearInboxFilter:()=>calls.push('clear-filter'),mode:'queue',quickReply:null,stagedDetail:false,openSequence:0,disposed:false,nativeQueue:Promise.resolve(),filtered:()=>[],filter:'all',snapshot:{},
   window:{__PME_REPLY__:{status:()=>({ready:false}),suspend:()=>calls.push('suspend'),open:(_item,options)=>{calls.push(['open',options.focusEditor]);return loading;},focus:()=>calls.push('focus')}},
   transition:async(next,{stage=false}={})=>{env.mode=next;calls.push(stage?'stage':'reveal');if(!stage)await reveal;},render:()=>calls.push('render')};
 vm.runInNewContext(startReplySource,env);
 return {env,calls,loaded,revealed};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('uncached conversations start revealing while still loading, with focus deferred until both finish',async()=>{
 for(const first of ['loaded','revealed']){
  const f=openingEnv(),pending=f.env.startReply({key:'TONE:CONE:',workspaceId:'TONE'});await flush();
  assert.deepEqual(f.calls,['suspend','stage',['open',false],'reveal']);
  f[first]();await flush();assert.equal(f.calls.includes('focus'),false);
  f[first==='loaded'?'revealed':'loaded']();await pending;
  assert.deepEqual(f.calls.slice(-2),['focus','render']);
 }
});
test('finishing an obsolete load cannot steal focus or reopen the detail after dismissal',async()=>{
 const f=openingEnv(),pending=f.env.startReply({key:'TONE:CONE:',workspaceId:'TONE'});await flush();
 f.env.openSequence++;f.env.mode='queue';f.loaded();f.revealed();await pending;
 assert.equal(f.calls.includes('focus'),false);assert.equal(f.calls.includes('render'),false);assert.equal(f.env.mode,'queue');
});
test('direct detail switches and Reduce Motion skip animated resizing',async()=>{
 for(const [from,next,reduced] of [['reply','reply',false],['reading','reply',false],['queue','reading',true],['reply','queue',true]]){
  const {env,calls}=motionEnv(from,{reduced});await env.transition(next);
  assert.ok(calls.includes(`geometry:${next}:false`));assert.equal(calls.includes(`geometry:${next}:true`),false);
 }
});
test('automatic pill reveal never focuses controls or requests app activation, and yields to a queued inbox opening',async()=>{
 const {env,calls}=motionEnv('strip');env.nativeStripRequest={id:'strip'};
 const focus=[],reports=[];env.$=()=>({focus:()=>focus.push(true)});env.reportShell=restore=>reports.push(restore);
 await env.transition('cluster',{passive:true});
 assert.equal(env.mode,'cluster');assert.ok(calls.includes('geometry:cluster:false'));
 assert.deepEqual(focus,[]);assert.deepEqual(reports,[false]);
 env.mode='strip';calls.length=0;
 const pending=env.transition('cluster',{passive:true});env.mode='queue';await pending;
 assert.equal(env.mode,'queue');assert.deepEqual(calls,[]);
});


test('stable reply navigation skips window IPC but normal transitions still apply geometry',async()=>{
 const {env,calls}=motionEnv('reply');await env.transition('reply',{reuseLayout:true});
 assert.ok(calls.includes('layout:reply'));assert.equal(calls.some(c=>c.startsWith('geometry:')),false);
 calls.length=0;await env.transition('reply');assert.ok(calls.includes('geometry:reply:false'));
 const staged=motionEnv('reply',{staged:true});await staged.env.transition('reply',{reuseLayout:true});assert.ok(staged.calls.includes('geometry:reply:true'));
});


test('reply switching reuses geometry only when compact/full size is unchanged',async()=>{
 for(const [previous,quick,reuseLayout] of [[null,null,true],[{},null,false],[null,{},false],[{},{},true]]){
  const f=openingEnv(),options=[];f.env.mode='reply';f.env.quickReply=previous;
  f.env.transition=async(_next,value)=>options.push(value);
  const pending=f.env.startReply({key:'TONE:CONE:',workspaceId:'TONE'},{quick});await flush();f.loaded();await pending;
  assert.equal(options[0].reuseLayout,reuseLayout);
 }
});

test('queue, reader and hidden surfaces park Slack; normal Slack and direct detail switches do not',async()=>{
 for(const next of ['queue','reading','cluster','strip','hidden','stock','reply']){
  const f=motionEnv('reply');f.env.previousFocus=null;f.env.shadow={querySelector:()=>({focus(){}})};f.env.window.__PME_REPLY__.park=async()=>{f.calls.push('park');return {ok:true};};
  await f.env.transition(next);
  assert.equal(f.calls.includes('park'),!['stock','reply'].includes(next));
  if(f.calls.includes('park')){assert.ok(f.calls.indexOf('layout:'+next)<f.calls.indexOf('park'));assert.equal(f.env.resumeReply,false);}
 }
});


test('hiding and compacting conceal the window before clearing the surface or parking Slack',async()=>{
 for(const next of ['hidden','strip','cluster']){
  const f=motionEnv('reply');f.env.previousFocus=null;f.env.shadow={querySelector:()=>({focus(){}})};
  f.env.window.__PME_REPLY__.park=async()=>{f.calls.push('park');return {ok:true};};
  await f.env.transition(next);
  assert.ok(f.calls.indexOf('hide')<f.calls.indexOf('suspend'));
  assert.ok(f.calls.indexOf('hide')<f.calls.indexOf('layout:'+next));
  assert.ok(f.calls.indexOf('hide')<f.calls.indexOf('park'));
  if(next==='hidden')assert.equal(f.calls.some(c=>c.startsWith('geometry:')),false);
 }
});


test('pill and inbox appear before slow background parking finishes, while later navigation stays serialized',async()=>{
 for(const next of ['queue','cluster']){
  const f=motionEnv('reply');f.env.previousFocus=null;f.env.shadow={querySelector:()=>({focus(){}})};
  let parked;f.env.window.__PME_REPLY__.park=()=>new Promise(resolve=>{parked=resolve;});
  let complete=false;const pending=f.env.transition(next).then(()=>{complete=true;});await flush();
  assert.ok(f.calls.some(c=>c.startsWith('geometry:'+next+':')));assert.equal(complete,false);
  const following=f.env.transition('stock');await flush();assert.equal(f.env.mode,next);
  parked({ok:true});await pending;await following;assert.equal(f.env.mode,'stock');
 }
});


test('opening a conversation clears search before navigation, but compose and quick replies leave it alone',async()=>{
 for(const [item,options,clear] of [[{key:'TONE:CONE:',channelId:'CONE'}, {},true],[{key:'TONE:CONE:123',channelId:'CONE',threadTs:'123'}, {},true],[{key:'TONE:compose',kind:'compose'}, {},false],[{key:'TONE:CONE:',channelId:'CONE'},{quick:{}},false]]){
  const f=openingEnv();const pending=f.env.startReply({...item,workspaceId:'TONE'},options);await flush();
  assert.equal(f.calls.includes('clear-filter'),clear);
  if(clear)assert.ok(f.calls.indexOf('clear-filter')<f.calls.indexOf('suspend'));
  f.loaded();f.revealed();await pending;
 }
});


test('visible unread app conversations acknowledge through Slack only after opening and reveal finish',async()=>{
 for(const variant of ['read-only','editable','already-read','wrong-target','loading','cancelled','linked-message']){
  const f=openingEnv(),item={key:'TONE:DAPP:',workspaceId:'TONE',channelId:'DAPP',unread:variant!=='already-read'};
  f.env.window.__PME_REPLY__.status=()=>({ready:variant!=='loading',readOnly:variant!=='editable',target:{key:variant==='wrong-target'?'TONE:DOTHER:':item.key}});
  f.env.window.__PME_REPLY__.markReadNative=()=>{f.calls.push('read');return {ok:true};};
  const pending=f.env.startReply(item,{preservePosition:variant==='linked-message'});await flush();
  f.loaded();await flush();assert.equal(f.calls.includes('read'),false);
  if(variant==='cancelled')f.env.openSequence++;
  f.revealed();await pending;assert.equal(f.calls.includes('read'),variant==='read-only');
 }
});

test('resolved member DM updates the inbox selection before readiness, but stale callbacks cannot replace a new selection',async()=>{
 const f=openingEnv();let resolve;
 f.env.window.__PME_REPLY__.open=(_item,options)=>{resolve=options.onDestinationResolved;return Promise.resolve({ok:true});};
 const pending=f.env.startReply({kind:'compose',workspaceId:'TONE',key:'TONE:compose',peer:'UNEW'},{nativeNavigate:()=>true});
 await flush();resolve({workspaceId:'TONE',channelId:'DNEW',key:'TONE:DNEW:'});
 assert.equal(f.env.selection,'TONE:DNEW:');assert.ok(f.calls.includes('clear-filter'));
 f.env.selection='TONE:DOTHER:';resolve({workspaceId:'TONE',channelId:'DNEW',key:'TONE:DNEW:'});
 assert.equal(f.env.selection,'TONE:DOTHER:');f.revealed();await pending;
});
