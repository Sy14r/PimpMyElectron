import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const originalRenderSource=source.slice(source.indexOf('  function renderReply()'),source.indexOf('  const quickCard='));
function fixture(){
  const nodes=new Map();
  const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,dataset:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},append(n){n.parentElement=this;},insertBefore(n){n.parentElement=this;}});return nodes.get(id);};
  let status={state:'loading',ready:false,target:{key:'new',name:'New chat'}};
  const env={mode:'reply',selection:'new',openingKey:null,quickReply:null,snapshot:{},items:()=>[],detailMode:()=>true,renderQuick(){},$,shadow:{querySelector:$},window:{__PME_REPLY__:{status:()=>status}}};
  vm.runInNewContext(originalRenderSource,env);
  return {env,$,render:()=>env.renderReply(),status:value=>{status={...status,...value};}};
}
test('loading uses a quiet cover, verified destination reveals, and a subsequent switch covers immediately',()=>{
  const f=fixture();f.render();
  assert.equal(f.$('reply-chrome').hidden,true);assert.equal(f.$('reply-placeholder').dataset.state,'loading');
  f.status({state:'ready',ready:true});f.render();
  assert.equal(f.$('reply-placeholder').hidden,false); // Retained to fade away instead of abruptly disappearing.
  assert.equal(f.$('reply-placeholder').dataset.state,'ready');assert.equal(f.$('reply-placeholder').attributes['aria-hidden'],'true');
  f.env.selection='next';f.env.openingKey='next';f.render();
  assert.equal(f.$('reply-placeholder').dataset.state,'loading');assert.equal(f.$('reply-chrome').hidden,true);
  f.env.openingKey=null;f.render();assert.equal(f.$('reply-placeholder').dataset.state,'error'); // A stale ready notification offers recovery without revealing the wrong destination.
});
test('errors retain immediate recovery controls and retry hides the old error',()=>{
  const f=fixture();f.status({state:'error',reason:'Destination unavailable'});f.render();
  assert.equal(f.$('reply-placeholder').dataset.state,'error');assert.equal(f.$('reply-chrome').hidden,false);
  assert.equal(f.$('reply-retry').hidden,false);assert.equal(f.$('reply-placeholder-message').textContent,'Destination unavailable');
  f.env.openingKey='new';f.render();assert.equal(f.$('reply-chrome').hidden,true);assert.equal(f.$('reply-placeholder').dataset.state,'loading');
});
test('the conversation cover stays out of full Slack, queue and quick reply',()=>{
  for(const state of [{mode:'stock'},{mode:'queue'},{quickReply:{}}]){
    const f=fixture();Object.assign(f.env,state);f.render();
    assert.equal(f.$('reply-placeholder').hidden,true);assert.equal(f.$('reply-chrome').hidden,true);
  }
});

const code=source.slice(source.indexOf('  function renderReply('),source.indexOf('  const quickCard='));
function render(reply,openingKey=null){
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},setAttribute(){},append(){}});return nodes.get(id);};
 const controls={parentElement:$('reply-chrome')};const env={openingKey,selection:'TONE:DONE:',mode:'reply',quickReply:null,detailMode:()=>true,items:()=>[],snapshot:{},$,
 window:{__PME_REPLY__:{status:()=>reply}},shadow:{querySelector:()=>controls},renderQuick(){}};
 vm.runInNewContext(code,env);env.renderReply();return $;
}
test('inactive, missing, and mismatched native destinations offer retry instead of an endless loading cover',()=>{
 for(const reply of [undefined,{state:'idle',ready:false},{state:'ready',ready:true,target:{key:'TONE:DOTHER:'}}]){
  const $=render(reply);assert.equal($('reply-placeholder').dataset.state,'error');assert.equal($('reply-retry').hidden,false);assert.match($('reply-placeholder-message').textContent,/conversation changed/);
 }
});
test('genuine native navigation remains loading and a verified destination clears the cover',()=>{
 for(const [reply,key,state] of [[{state:'loading',ready:false},null,'loading'],[{state:'idle',ready:false},'TONE:DONE:','loading'],[{state:'ready',ready:true,target:{key:'TONE:DONE:'}},null,'ready']]){
  const $=render(reply,key);assert.equal($('reply-placeholder').dataset.state,state);assert.equal($('reply-retry').hidden,true);
 }
 const $=render({state:'error',reason:'Native navigation failed',ready:false});assert.equal($('reply-placeholder-message').textContent,'Native navigation failed');
});
