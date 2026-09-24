import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const geometry=source.slice(source.indexOf('  async function geometry('),source.indexOf('  function transition('));
const reveal=source.slice(source.indexOf('  async function revealDetailContent('),source.indexOf('  async function geometry('));
function fixture({visible=false,minimized=false,stripHidden=false}={}){
 const calls=[],area={x:0,y:24,width:1440,height:876};
 const bridge={getWindowId:async()=>1,callBrowserWindowMethod:async(_id,method,...args)=>{
  calls.push([method,...args]);return {isVisible:visible,isMinimized:minimized}[method];
 }};
 const env={compactBounds:null,nativeStripRequest:null,nativeStripHidden:stripHidden,window:{desktop:{window:bridge}},
  desktop:{screen:{getAllDisplays:async()=>[{id:1,workArea:area}],getPrimaryDisplay:async()=>({id:1,workArea:area})}},
  original:{min:[400,300],bounds:{x:20,y:30,width:900,height:700},top:false,spaces:false},spacesApplied:true,glassHelper:false,
  sessionStorage:{removeItem(){},setItem(){}},settings:{display:'main'},layoutKey:'layout',edge:'left',quickReply:null,innerWidth:420,
  pillHeight:()=>88,pillItems:()=>[],stripSequence:0,reportShell(){},syncNativeStrip(){}};
 vm.runInNewContext(geometry,env);return {calls,env};
}
test('hidden windows get final geometry before becoming visible without waiting on throttled timers',async()=>{
 for(const next of ['queue','cluster','stock']){
  const f=fixture();await f.env.geometry(next);const methods=f.calls.map(c=>c[0]);
  assert.ok(methods.indexOf('setBounds')<methods.indexOf('showInactive'));
  assert.equal(methods.at(-1),'showInactive');
 }
});
test('minimized windows restore only after sizing; visible windows do not incur a presentation delay',async()=>{
 const f=fixture({minimized:true});await f.env.geometry('queue');const methods=f.calls.map(c=>c[0]);
 assert.ok(methods.indexOf('setBounds')<methods.indexOf('restore'));
 const visible=fixture({visible:true});await visible.env.geometry('queue');
 assert.equal(visible.calls.some(c=>['paint','showInactive','restore'].includes(c[0])),false);
});
test('fully hidden mode never shows a window and an acknowledged native strip stays hidden',async()=>{
 const hidden=fixture();await hidden.env.geometry('hidden');assert.deepEqual(hidden.calls,[['hide']]);
 const strip=fixture({stripHidden:true});await strip.env.geometry('strip');
 assert.equal(strip.calls.some(c=>['paint','showInactive','restore'].includes(c[0])),false);
});

test('content-only animation is limited to visible helper-backed detail transitions',async()=>{
 for(const [visible,minimized,glass,closing,reveals] of [[true,false,true,false,true],[true,false,false,false,false],[false,false,true,false,false],[true,true,true,false,false],[true,false,true,true,true]]){
  const f=fixture({visible,minimized});f.env.glassHelper=glass;f.env.innerWidth=closing?820:420;
  f.env.setDetailMotion=()=>{};f.env.setTimeout=fn=>fn();f.env.revealDetailContent=async()=>f.calls.push(['reveal']);
  await f.env.geometry(closing?'queue':'reply',{animate:true});
  assert.equal(f.calls.some(c=>c[0]==='reveal'),reveals);
  assert.equal(f.calls.some(c=>c[0]==='setBounds'),!reveals);
 }
});

test('closing slides content first and shrinks once, cleaning up even when the final resize fails',async()=>{
 for(const fails of [false,true]){
  const f=revealFixture(),bounds={width:420},call=async(...args)=>{f.calls.push(args);if(fails)throw Error('final resize failed');};
  const pending=f.env.revealDetailContent(call,bounds,true);await flush();
  assert.equal(f.calls.length,0);f.frames.shift()();f.frames.shift()();await flush();
  assert.equal(f.calls[0][0],'animate');assert.equal(f.calls[0][1][0]['--pme-detail-progress'],'1');assert.equal(f.calls[0][1][1]['--pme-detail-progress'],'0');
  f.finish();if(fails)await assert.rejects(pending,/final resize failed/);else await pending;
  assert.equal(f.calls.filter(c=>c[0]==='setBounds').length,1);assert.equal(f.attributes.size,0);assert.equal(f.properties.size,0);
 }
});

function revealFixture(){
 const calls=[],frames=[],timers=new Map(),attributes=new Map(),properties=new Map();let nextTimer=0,finish;
 const node=prefix=>({setAttribute:(k,v)=>attributes.set(prefix+k,v),removeAttribute:k=>attributes.delete(prefix+k)});
 const body={...node('body:'),style:{setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)},animate:(keyframes,options)=>{
  calls.push(['animate',keyframes,options]);return {finished:new Promise(resolve=>{finish=resolve;}),cancel:()=>calls.push(['cancel'])};
 }};
 const env={host:node('host:'),document:{body},innerWidth:820,edge:'left',disposed:false,reportShell(){},
  setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),
  requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){}};
 vm.runInNewContext(reveal,env);
 return {env,calls,frames,timers,attributes,properties,finish:()=>finish(),call:async(...args)=>{calls.push(args);}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('detail reveal allocates once, waits for a paint, then animates content without resizing again',async()=>{
 const f=revealFixture(),bounds={x:0,y:24,width:820,height:876},pending=f.env.revealDetailContent(f.call,bounds);await flush();
 assert.deepEqual(f.calls,[['setBounds',bounds,false]]);assert.equal(f.properties.get('--pme-detail-progress'),'0');
 f.frames.shift()();await flush();assert.equal(f.calls.length,1);
 f.frames.shift()();await flush();assert.equal(f.calls[1][0],'animate');assert.equal(f.calls[1][2].duration,180);
 f.finish();await pending;
 assert.equal(f.calls.filter(c=>c[0]==='setBounds').length,1);assert.equal(f.calls.at(-1)[0],'cancel');
 assert.equal(f.attributes.size,0);assert.equal(f.properties.size,0);assert.equal(f.timers.size,0);
});
test('unpainted, throttled, or failed reveals clean up without leaving clipped or invisible content',async()=>{
 for(const failure of ['resize','timeout','width','animation-timeout']){
  const f=revealFixture();if(failure==='width')f.env.innerWidth=420;
  const pending=f.env.revealDetailContent(failure==='resize'?async()=>{throw Error('resize failed');}:f.call,{width:820});
  if(failure==='resize'){await assert.rejects(pending,/resize failed/);}
  else{
   await flush();
   if(failure==='timeout'){[...f.timers.values()][0]();}
   else{f.frames.shift()();f.frames.shift()();await flush();if(failure==='animation-timeout')[...f.timers.values()][0]();}
   await pending;
  }
  assert.equal(f.attributes.size,0);assert.equal(f.properties.size,0);
  assert.equal(f.calls.some(c=>c[0]==='animate'),failure==='animation-timeout');
 }
});
