import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  let inboxPointerPosition='),source.indexOf("  document.addEventListener('pointermove',inboxPointerMoved"));
function setup(){
 const attributes=new Map(),rows=[{dataset:{key:'one',pointerTitle:'First preview'},title:'First preview'},{dataset:{key:'two',pointerTitle:'Second preview'},title:'Second preview'}];
 const env={host:{getAttribute:k=>attributes.get(k),setAttribute:(k,v)=>attributes.set(k,v)},$:()=>({children:rows})};vm.runInNewContext(code,env);
 const move=extra=>env.inboxPointerMoved({isTrusted:true,pointerType:'mouse',screenX:100,screenY:200,movementX:0,movementY:0,...extra});
 return {env,rows,move,input:()=>attributes.get('data-inbox-input')};
}
test('keyboard navigation suppresses row tooltips until actual pointer movement',()=>{
 const e=setup();e.move();e.env.setInboxInput('keyboard');assert.ok(e.rows.every(r=>r.title===''));
 for(const extra of [{},{clientX:90,clientY:50},{movementX:12,movementY:5}]){e.move(extra);assert.equal(e.input(),'keyboard');}
 e.move({screenX:101,movementX:1});assert.equal(e.input(),'pointer');assert.deepEqual(e.rows.map(r=>r.title),['First preview','Second preview']);
});
test('a first stationary pointer event, touch scrolling and synthetic movement cannot cancel keyboard mode',()=>{
 const e=setup();e.env.setInboxInput('keyboard');e.move();assert.equal(e.input(),'keyboard');
 e.move({pointerType:'touch',screenX:150});e.move({isTrusted:false,screenX:150});assert.equal(e.input(),'keyboard');
 e.move({screenY:201,pointerType:'pen'});assert.equal(e.input(),'pointer');
});
test('returning to keyboard mode does not overwrite preview content and an explicit click can restore hover',()=>{
 const e=setup();for(let i=0;i<3;i++){e.env.setInboxInput('keyboard');e.env.setInboxInput('keyboard');e.env.setInboxInput('pointer');}
 assert.deepEqual(e.rows.map(r=>r.title),['First preview','Second preview']);
});
