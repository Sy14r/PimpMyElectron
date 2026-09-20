import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
const waitSource=source.slice(source.indexOf('  function waitForNativeChange('),source.indexOf('  function afterLayout('));
function fixture(){
 const timers=new Map();let sequence=0,callback,connected=false;
 const env={document:{body:{}},setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  MutationObserver:class{constructor(fn){callback=fn;}observe(){connected=true;}disconnect(){connected=false;}}};
 vm.runInNewContext(waitSource,env);
 return {wait:env.waitForNativeChange,timers,change:()=>callback(),connected:()=>connected,fire(ms){const entry=[...timers].find(([,t])=>t.ms===ms);assert.ok(entry);timers.delete(entry[0]);entry[1].fn();}};
}
test('native mount changes wake navigation early, coalesce bursts and detach the temporary observer',async()=>{
 const f=fixture();let complete=false;const pending=f.wait().then(()=>complete=true);
 assert.equal(f.connected(),true);f.change();f.change();assert.equal(f.timers.size,2);assert.equal(complete,false);
 f.fire(16);await pending;assert.equal(complete,true);assert.equal(f.connected(),false);assert.equal(f.timers.size,0);
});
test('route-only navigation wakes on the fallback and releases its observer',async()=>{
 const f=fixture(),pending=f.wait();f.fire(150);await pending;
 assert.equal(f.connected(),false);assert.equal(f.timers.size,0);
});
