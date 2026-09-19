import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createContextGuard} from '../src/context-guard.mjs';

function setup(t) {
  const cdp=new EventEmitter(),guard=createContextGuard(cdp);
  const entry={sessionId:'s',url:'https://app.slack.com/client/TONE/CONE'};
  const emit=(method,params)=>cdp.emit('event',{sessionId:'s',method,params});
  const context=(id,extra={})=>emit('Runtime.executionContextCreated',{context:{id,uniqueId:'context-'+id,origin:'https://app.slack.com',auxData:{frameId:'root',isDefault:true},...extra}});
  const allowed=id=>guard.allows({params:{executionContextId:id}},entry);
  guard.frame('s',{id:'root',loaderId:'doc1',url:entry.url});
  t.after(()=>guard.dispose());return {guard,entry,emit,context,allowed};
}
test('only the exact default main Slack context can call the host',t=>{
  const {guard,entry,context,allowed}=setup(t);
  assert.equal(allowed(1),false);
  context(2,{origin:'https://evil.example'});
  context(3,{auxData:{frameId:'child',isDefault:true}});
  context(4,{auxData:{frameId:'root',isDefault:false}});
  context(1);
  assert.equal(allowed(1),true);
  for(const id of [undefined,2,3,4,99]) assert.equal(allowed(id),false);
  assert.equal(guard.allows({params:{executionContextId:1}},{...entry,sessionId:'other'}),false);
});
test('navigation revokes the old context and accepts a new document without trusting old IDs',t=>{
  const {entry,emit,context,allowed}=setup(t);context(1);
  emit('Page.frameNavigated',{frame:{id:'root',loaderId:'doc2',url:entry.url}});
  assert.equal(allowed(1),false);context(5);assert.equal(allowed(5),true);
  emit('Runtime.executionContextDestroyed',{executionContextId:5});assert.equal(allowed(5),false);
  context(6);emit('Runtime.executionContextsCleared',{});assert.equal(allowed(6),false);
  context(7);emit('Target.detachedFromTarget',{sessionId:'s'});assert.equal(allowed(7),false);
});
test('same-document workspace transitions require matching current routing; non-Slack pages fail closed',t=>{
  const {entry,emit,context,allowed}=setup(t);context(1);
  const url='https://app.slack.com/client/TTWO/CTWO';
  emit('Page.navigatedWithinDocument',{frameId:'root',url});assert.equal(allowed(1),false);
  entry.url=url;assert.equal(allowed(1),true);
  emit('Page.frameNavigated',{frame:{id:'root',loaderId:'doc2',url:'https://evil.example/client/TTWO'}});
  context(8);assert.equal(allowed(8),false);
});
