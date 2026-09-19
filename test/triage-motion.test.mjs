import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
function functionSource(startText,endText){const start=source.indexOf(startText)+startText.length,end=source.indexOf(endText,start);assert.ok(start>=startText.length&&end>start);return source.slice(start,end);}
const pulseSource=functionSource('const shellTimer=setInterval(', ',2000);');
test('idle timer only rests the expanded pill, leaving the inbox and every detail view open',async()=>{
 for(const mode of ['cluster','queue','reply','reading','strip','stock','hidden']){
  const transitions=[],env={mode,disposed:false,Date:{now:()=>120000},lastPulse:119000,reportShell(){},hostDisconnected:false,connected:()=>true,
   settings:{idleSeconds:30},lastInteraction:0,transition:n=>transitions.push(n),restMode:()=>'strip',displaySignature:'',desktop:{screen:{getAllDisplays:async()=>[]}}};
  await vm.runInNewContext(`(${pulseSource})`,env)();
  assert.deepEqual(transitions,mode==='cluster'?['strip']:[],mode);
 }
});
const transitionSource='function transition('+functionSource('function transition(',"  shadow.addEventListener('click'");
function motionEnv(mode,{reduced=false,staged=false}={}){
 const calls=[],env={mode,disposed:false,stagedDetail:staged,innerWidth:mode==='queue'||staged?420:820,openSequence:0,openingKey:null,
  hoverTimer:0,hoverIntent:null,clearTimeout(){},setPillPreview(){},nativeQueue:Promise.resolve(),document:{activeElement:null},
  window:{matchMedia:()=>({matches:reduced}),__PME_REPLY__:{suspend:()=>calls.push('suspend'),status:()=>({ready:true})}},
  setDetailMotion:()=>calls.push('mask'),clearDetailMotion:()=>{calls.push('unmask');env.stagedDetail=false;},
  applyLayout:()=>calls.push('layout:'+env.mode),render(){},geometry:async(next,options)=>calls.push(`geometry:${next}:${options.animate}`),
  $:()=>({focus(){}}),reportShell(){}};
 vm.runInNewContext(transitionSource,env);return {env,calls};
}
test('closing slides the mounted native pane before suspending it and changing queue layout',async()=>{
 const {env,calls}=motionEnv('reply');await env.transition('queue');
 assert.ok(calls.indexOf('geometry:queue:true')<calls.indexOf('suspend'));
 assert.ok(calls.indexOf('suspend')<calls.indexOf('layout:queue'));
 assert.equal(calls.at(-1),'unmask');
});
test('staging keeps the narrow window until the native pane is ready for reveal',async()=>{
 const {env,calls}=motionEnv('queue');await env.transition('reply',{stage:true});
 assert.equal(calls.some(c=>c.startsWith('geometry:')),false);assert.equal(env.stagedDetail,true);
 await env.transition('reply');assert.ok(calls.includes('geometry:reply:true'));assert.equal(env.stagedDetail,false);
});
test('direct detail switches and Reduce Motion skip animated resizing',async()=>{
 for(const [from,next,reduced] of [['reply','reply',false],['reading','reply',false],['queue','reading',true],['reply','queue',true]]){
  const {env,calls}=motionEnv(from,{reduced});await env.transition(next);
  assert.ok(calls.includes(`geometry:${next}:false`));assert.equal(calls.includes(`geometry:${next}:true`),false);
 }
});
