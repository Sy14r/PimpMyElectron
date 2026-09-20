import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('  function nextUnreadItem('),source.indexOf('  function closeWorkspacePicker('));
function fixture(){
  const opened=[],focused=[],nodes=new Map(),host={};
  const $=id=>{if(!nodes.has(id))nodes.set(id,{children:[],focus:()=>focused.push(id)});return nodes.get(id);};
  let rows=[],connected=true,dismissed=new Set();const pane={contains:n=>n===messages||n===composer},messages={},composer={closest:()=>true};
  const status={ready:true,readOnly:false};
  const env={mode:'reply',quickReply:null,selection:'current',filter:'all',shadow:{querySelector:()=>({focus:()=>focused.push('filter')})},filtered:()=>rows,inboxUnread:i=>i.unread===true,replyDismissed:i=>dismissed.has(i.key),connected:()=>connected,$,host,document:{activeElement:host,querySelector:()=>pane},
    startReply:async(item,options)=>opened.push({item,options}),window:{__PME_REPLY__:{status:()=>status,focusMessages:()=>focused.push('messages'),focus:()=>focused.push('composer')}}};
  vm.runInNewContext(helpers,env);
  return {env,opened,focused,$,host,messages,composer,status,rows:v=>rows=v,disconnect:()=>connected=false,dismiss:key=>dismissed.add(key)};
}
test('next unread follows filtered order, wraps, and skips read, pending, dismissed and locally deferred items',async()=>{
  const f=fixture();f.rows([{key:'previous',unread:true},{key:'current',unread:true},{key:'read',unread:false},{key:'unknown',unread:null},{key:'pending',unread:true,pendingRead:true},{key:'done',unread:true,triage:{state:'done'}},{key:'later',unread:true,triage:{state:'later'}},{key:'dismissed',unread:true},{key:'next',unread:true}]);f.dismiss('dismissed');
  assert.equal(f.env.nextUnreadItem(1).key,'next');assert.equal(f.env.nextUnreadItem(-1).key,'previous');
  await f.env.nextUnread(1);assert.equal(f.opened[0].options.focusAfter,'messages');
  f.env.selection='next';assert.equal(f.env.nextUnreadItem(1).key,'previous');
  f.env.selection='missing';assert.equal(f.env.nextUnreadItem(1).key,'previous');assert.equal(f.env.nextUnreadItem(-1).key,'next');
});
test('empty unread selection preserves the current conversation and draft; quick, disconnected and stock views do not navigate',async()=>{
  const f=fixture();f.rows([{key:'current',unread:true}]);await f.env.nextUnread(1);assert.equal(f.opened.length,0);assert.match(f.$('notice').textContent,/No other unread/);
  for(const setup of [f=>f.env.quickReply={},f=>f.env.mode='stock',f=>f.disconnect()]){const f=fixture();f.rows([{key:'next',unread:true}]);setup(f);await f.env.nextUnread(1);assert.equal(f.opened.length,0);}
});
test('F6 cycles inbox, messages and composer with a reverse path, skipping composer for read-only views',()=>{
  const f=fixture();f.env.cycleTriageFocus(1);f.env.document.activeElement=f.messages;f.env.cycleTriageFocus(1);f.env.document.activeElement=f.composer;f.env.cycleTriageFocus(1);
  assert.deepEqual(f.focused,['messages','composer','filter']);
  f.env.document.activeElement=f.host;f.env.cycleTriageFocus(-1);assert.equal(f.focused.at(-1),'composer');
  f.status.readOnly=true;f.env.document.activeElement=f.messages;f.env.cycleTriageFocus(1);assert.equal(f.focused.at(-1),'filter');
});
test('shortcut chords work from the native composer, suppress repeats, and leave normal typing and composition alone',()=>{
  const f=fixture(),calls=[];f.env.nextUnread=direction=>calls.push(['unread',direction]);f.env.cycleTriageFocus=direction=>calls.push(['focus',direction]);
  const event=extra=>({key:'ArrowDown',altKey:true,shiftKey:true,preventDefault(){this.prevented=true;},stopImmediatePropagation(){},...extra});
  assert.equal(f.env.triageNavigationKey(event()),true);f.env.triageNavigationKey(event({key:'ArrowUp'}));f.env.triageNavigationKey(event({key:'F6',altKey:false,shiftKey:false}));
  assert.deepEqual(calls,[['unread',1],['unread',-1],['focus',1]]);
  for(const extra of [{isComposing:true},{defaultPrevented:true},{metaKey:true},{ctrlKey:true},{altKey:false},{key:'a'}])assert.equal(f.env.triageNavigationKey(event(extra)),false);
  f.env.triageNavigationKey(event({repeat:true}));assert.equal(calls.length,3);
});

test('empty inbox focus stays on the selected filter button, never the text field',()=>{
 const f=fixture();f.$('list').children=[{scrollIntoView(){}}];f.env.focusInbox();assert.deepEqual(f.focused,['filter']);
});
