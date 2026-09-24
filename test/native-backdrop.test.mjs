import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeBackdrop} from '../src/native-backdrop.mjs';
const geometry={window:{x:980,y:39,width:820,height:1130},inbox:{x:980,y:39,width:420,height:1130}};
const request={id:'session',slackPID:123,geometry,enabled:true};
test('native backdrop admits only finite inbox geometry inside the owned window',()=>{
 assert.deepEqual(nativeBackdrop(request),{id:'session',slackPID:123,...geometry});
 for(const progress of [0,.25,.5,.75,1])assert.ok(nativeBackdrop({...request,geometry:{...geometry,inbox:{...geometry.inbox,x:980+400*progress}}}));
 for(const patch of [{enabled:false},{slackPID:0},{id:null},{geometry:null}])assert.equal(nativeBackdrop({...request,...patch}),null);
 for(const patch of [{x:979-1},{x:1381+1},{width:421},{height:9000},{width:NaN},{y:Infinity}])assert.equal(nativeBackdrop({...request,geometry:{...geometry,inbox:{...geometry.inbox,...patch}}}),null);
 for(const width of [12,44,419,821,1e9])assert.equal(nativeBackdrop({...request,geometry:{...geometry,window:{...geometry.window,width}}}),null);
 const extra={...geometry,inbox:{...geometry.inbox,text:'private'},window:{...geometry.window,command:'anything'}};
 assert.deepEqual(nativeBackdrop({...request,geometry:extra}),{id:'session',slackPID:123,...geometry});
});

test('detail backdrop follows the revealed union and rejects overdraw outside the Slack window',()=>{
 for(const right of [false,true])for(const p of [0,.25,.5,.75,1]){
  const inbox={...geometry.inbox,x:geometry.window.x+(right?400*(1-p):0)};
  const surface={...inbox,width:420+400*p};
  assert.deepEqual(nativeBackdrop({...request,geometry:{...geometry,inbox,surface}}).surface,surface);
 }
 for(const patch of [{width:821},{width:419},{x:981},{y:40},{height:1100},{width:NaN}]){
  assert.equal(nativeBackdrop({...request,geometry:{...geometry,surface:{...geometry.inbox,width:820,...patch}}}),null);
 }
});

test('renderer reports only the revealed detail region, including final handoff and queue collapse',async()=>{
 const fs=await import('node:fs/promises'),vm=await import('node:vm');
 const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('  function reportShell('),source.indexOf('  function syncNativeStrip('));
 for(const right of [false,true])for(const progress of [0,.5,1]){
  let report;const x=right?400*(1-progress):0;
  const env={glassActive:true,glassBounds:{x:100,y:30,width:820,height:900},glassConcealed:false,disposed:false,mode:'reply',quickReply:null,innerWidth:820,
   detailMode:()=>true,shadow:{querySelector:()=>({getBoundingClientRect:()=>({x,y:0,width:420,height:900})})},host:{hasAttribute:()=>true},
   getComputedStyle:()=>({getPropertyValue:()=>String(progress)}),document:{body:{},hasFocus:()=>false},window:{__pmeShellState:s=>{report=JSON.parse(s);}},
   team:()=> 'TONE',reducedTransparency:{matches:false},navigator:{onLine:true},displayInfo:[],pillPreview:null};
  vm.runInNewContext(fn,env);env.reportShell();assert.deepEqual(report.backdropGeometry.surface,{x:100+x,y:30,width:420+400*progress,height:900});
  // The last frame remains full width when animation attributes are removed.
  env.host.hasAttribute=()=>false;env.shadow.querySelector=()=>({getBoundingClientRect:()=>({x:0,y:0,width:420,height:900})});env.reportShell();assert.equal(report.backdropGeometry.surface.width,820);
  env.mode='queue';env.detailMode=()=>false;env.glassBounds.width=420;env.innerWidth=420;env.reportShell();assert.equal(report.backdropGeometry.surface.width,420);
  env.glassConcealed=true;env.reportShell();assert.equal(report.backdropGeometry,null);
 }
});
