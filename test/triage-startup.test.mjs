import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const fragment=source.slice(source.indexOf('  let startupTask='),source.indexOf('  window.__PME_TRIAGE__='));
function fixture(previous=null){
 const calls=[],storage=new Map(previous?[['__pme_startup_launch_v1',previous]]:[]);
 const env={disposed:false,transitionEpoch:0,savedLayout:null,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
 window:{__PME_REPLY__:{home:async()=>{calls.push('home');return {ok:true};},status:()=>({active:false})}},
 transition:async next=>calls.push(next),startReply:async()=>calls.push('reply')};
 vm.runInNewContext(fragment,env);return {env,calls,storage};
}
test('a new launch selects Home before inbox, regardless of the previous launch layout; runs once',async()=>{
 const f=fixture('old');f.env.savedLayout={mode:'strip'};
 const [a,b]=await Promise.all([f.env.startup('new'),f.env.startup('new')]);
 assert.equal(a.home,true);assert.equal(b.ok,true);assert.deepEqual(f.calls,['home','queue']);assert.equal(f.storage.get('__pme_startup_launch_v1'),'new');
});
test('reload in the same launch preserves view and never navigates Home again',async()=>{
 const f=fixture('same');f.env.savedLayout={mode:'strip'};assert.equal((await f.env.startup('same')).restored,true);assert.deepEqual(f.calls,['strip']);
 const stock=fixture('same');await stock.env.startup('same');assert.deepEqual(stock.calls,[]);
});
test('user navigation and disposal cancel delayed startup instead of stealing the current destination',async()=>{
 for(const change of [env=>env.transitionEpoch++,env=>{env.disposed=true;}]){
  const f=fixture();f.env.window.__PME_REPLY__.home=async()=>{change(f.env);return {ok:true};};
  assert.equal((await f.env.startup('new')).cancelled,true);assert.deepEqual(f.calls,[]);
 }
 const f=fixture();f.env.transitionEpoch=1;await f.env.startup('new');assert.deepEqual(f.calls,[]);
});
test('unavailable Home does not strand the launch outside triage',async()=>{
 for(const throws of [false,true]){const f=fixture();f.env.window.__PME_REPLY__.home=async()=>{if(throws)throw Error('navigation unavailable');return {ok:false};};
 assert.equal((await f.env.startup('new')).home,false);assert.deepEqual(f.calls,['queue']);}
});
const native=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
const home=native.slice(native.indexOf('  async function home(){'),native.indexOf('  async function park(){'));
test('Home waits for Slack selection, clicks once, and cancels on a newer native navigation',async()=>{
 for(const cancel of [false,true]){
  let now=0,clicks=0,selected=false;
  const env={generation:0,disposed:false,suspend(){env.generation++;},Date:{now:()=>now},pause:async ms=>{now+=ms;if(cancel)env.generation++;else selected=true;},
   document:{querySelector:()=>({getAttribute:()=>String(selected),click:()=>clicks++})}};
  vm.runInNewContext(home,env);const r=await env.home();assert.equal(clicks,1);assert.equal(cancel?r.cancelled:r.ok,true);
 }
});
