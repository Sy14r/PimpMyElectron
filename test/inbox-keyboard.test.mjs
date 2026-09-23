import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('  const pendingInboxRead='),source.indexOf('  function nextUnreadItem('));
function setup(){
 const calls=[],host={},rows=[{key:'one',unread:true,latest:'100.1'},{key:'two',unread:true,latest:'100.2'},{key:'three',unread:false}],nodes=new Map();
 const shadow={activeElement:null};
 const list={children:rows.map(item=>({dataset:{key:item.key},focus(){shadow.activeElement=this;calls.push(['focus',item.key]);},scrollIntoView(){}}))};
 const search={value:'',dataset:{},matches:()=>true,focus(){shadow.activeElement=this;},select(){calls.push(['select-filter']);}};nodes.set('list',list);nodes.set('search',search);nodes.set('notice',{});
 const status={ready:true,target:{key:'two'}};
 const env={mode:'queue',filter:'all',quickReply:null,pillReadPending:null,selection:null,openingKey:null,shadow,host,startCompose:()=>calls.push(['compose']),filtered:()=>env.filter==='unread'?rows.filter(r=>r.unread):rows,$:id=>nodes.get(id),connected:()=>true,render(){},touch(){},openItem:key=>calls.push(['open',key]),
   document:{activeElement:null},setInboxInput:input=>{env.inputMode=input;},window:{__PME_REPLY__:{status:()=>status,focus:()=>calls.push(['composer'])}},heldRow:null,transition:async mode=>{env.mode=mode;calls.push(['mode',mode]);},focusInbox:()=>calls.push(['inbox']),readFromPill:async(item,opts)=>{calls.push(['read',item.key,opts.inbox,opts.unread]);item.unread=opts.unread;return {ok:true};}};
 vm.runInNewContext(helpers,env);
 const event=(key,extra={})=>({key,composedPath:()=>[shadow.activeElement,host],preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
 return {env,calls,rows,list,shadow,search,event,status};
}
test('J/K and arrows move only the filtered row focus, wrapping without native navigation',()=>{
 const f=setup();f.shadow.activeElement=f.list.children[0];
 for(const key of ['j','ArrowDown','j','k','ArrowUp'])assert.equal(f.env.inboxNavigationKey(f.event(key)),true);
 assert.deepEqual(f.calls,[['focus','two'],['focus','three'],['focus','one'],['focus','three'],['focus','two']]);
 f.env.mode='reply';f.env.selection='one';f.env.inboxNavigationKey(f.event('j'));assert.equal(f.env.selection,'one');assert.equal(f.shadow.activeElement.dataset.key,'three');
});
test('Enter opens the highlighted destination, or focuses an already mounted editor without reopening',()=>{
 const f=setup();f.shadow.activeElement=f.list.children[1];f.env.inboxNavigationKey(f.event('Enter'));assert.deepEqual(f.calls,[['open','two']]);
 f.env.mode='reply';f.env.inboxNavigationKey(f.event('Enter'));assert.deepEqual(f.calls.at(-1),['composer']);
 f.env.inboxNavigationKey(f.event('Enter',{repeat:true}));assert.equal(f.calls.length,2);
 f.shadow.activeElement={dataset:{}};assert.equal(f.env.inboxNavigationKey(f.event('Enter')),false);
});
test('typing, native composer, dialogs caller, modifiers, IME and ordinary Slack keep their keys',()=>{
 const f=setup();f.shadow.activeElement=f.search;
 for(const key of ['h','j','k','l','x','ArrowLeft','ArrowRight'])assert.equal(f.env.inboxNavigationKey(f.event(key)),false);
 assert.equal(f.env.inboxNavigationKey(f.event('ArrowDown')),true);assert.equal(f.shadow.activeElement.dataset.key,'one');
 for(const extra of [{metaKey:true},{ctrlKey:true},{altKey:true},{shiftKey:true},{isComposing:true},{defaultPrevented:true},{composedPath:()=>[{}]}])assert.equal(f.env.inboxNavigationKey(f.event('x',extra)),false);
 for(const mode of ['stock','cluster','strip']){f.env.mode=mode;assert.equal(f.env.inboxNavigationKey(f.event('j')),false);}
});
test('X toggles read and unread through the hidden native flow, keeping rows that remain visible focused',async()=>{
 const f=setup();f.shadow.activeElement=f.list.children[0];f.env.mode='reply';
 await f.env.readInboxItem();assert.deepEqual(f.calls,[['mode','queue'],['read','one',true,false],['inbox']]);assert.equal(f.env.selection,'one');
 f.calls.length=0;await f.env.readInboxItem();assert.deepEqual(f.calls,[['read','one',true,true],['inbox']]);assert.equal(f.env.selection,'one');
 f.calls.length=0;f.env.inboxNavigationKey(f.event('x',{repeat:true}));assert.equal(f.calls.length,0);
 f.env.pillReadPending={key:'one',latest:100.1};await f.env.readInboxItem();assert.equal(f.calls.length,0);
});
test('X advances only when the selected row leaves the Unread filter and defaults unknown state to explicit read',async()=>{
 const f=setup();f.env.filter='unread';f.shadow.activeElement=f.list.children[0];await f.env.readInboxItem();assert.equal(f.env.selection,'two');
 f.env.filter='all';f.rows[2].unread=null;f.shadow.activeElement=f.list.children[2];f.calls.length=0;await f.env.readInboxItem();assert.deepEqual(f.calls,[['read','three',true,false],['inbox']]);
});

test('H/L and horizontal arrows cycle inbox filters in order and wrap',()=>{
 const f=setup();f.shadow.activeElement=f.list.children[0];
 for(const [key,filter] of [['l','unread'],['ArrowRight','mentions'],['l','dms'],['l','channels'],['l','threads'],['l','all'],['h','threads'],['ArrowLeft','channels'],['h','dms']]){assert.equal(f.env.inboxNavigationKey(f.event(key)),true);assert.equal(f.env.filter,filter);}
 assert.equal(f.calls.filter(c=>c[0]==='inbox').length,9);assert.equal(f.calls.some(c=>c[0]==='open'),false);
});

test('Slash focuses and selects the conversation filter, then remains literal while typing',()=>{
 const f=setup();f.shadow.activeElement=f.list.children[0];assert.equal(f.env.inboxNavigationKey(f.event('/')),true);assert.equal(f.shadow.activeElement,f.search);assert.deepEqual(f.calls,[['select-filter']]);assert.equal(f.env.inboxNavigationKey(f.event('/')),false);
});

test('N opens compose through workspace-aware routing and toggles it closed without touching drafts',()=>{
 const f=setup();f.shadow.activeElement=f.list.children[0];assert.equal(f.env.composeToggleKey(f.event('n')),true);assert.deepEqual(f.calls,[['compose']]);
 f.env.mode='reply';f.status.target={kind:'compose'};f.env.composeToggleKey(f.event('n'));assert.deepEqual(f.calls.at(-1),['mode','queue']);
 f.env.mode='reply';f.status.target={kind:'dm'};f.env.openingKey='TONE:compose';f.env.composeToggleKey(f.event('n'));assert.deepEqual(f.calls.at(-1),['mode','queue']);
});
test('N ignores typing, IME, modifiers, repeats, quick reply and full Slack',()=>{
 const f=setup();f.shadow.activeElement=f.search;assert.equal(f.env.composeToggleKey(f.event('n')),false);
 f.shadow.activeElement=f.list.children[0];
 for(const extra of [{isComposing:true},{defaultPrevented:true},{metaKey:true},{ctrlKey:true},{altKey:true},{shiftKey:true},{composedPath:()=>[{matches:()=>true}]}])assert.equal(f.env.composeToggleKey(f.event('n',extra)),false);
 f.env.composeToggleKey(f.event('n',{repeat:true}));assert.equal(f.calls.length,0);
 f.env.mode='stock';assert.equal(f.env.composeToggleKey(f.event('n')),false);f.env.mode='reply';f.env.quickReply={};assert.equal(f.env.composeToggleKey(f.event('n')),false);
});

test('X restores focus after native navigation, while preserving a field the user focused during the action',async()=>{
 for(const typing of [false,true]){
  const f=setup();f.shadow.activeElement=f.list.children[0];
  f.env.readFromPill=async()=>{await Promise.resolve();f.shadow.activeElement=typing?f.search:null;return {ok:true};};
  await f.env.readInboxItem();assert.equal(f.calls.filter(c=>c[0]==='inbox').length,typing?1:2);
 }
});


test('unknown read state checks the passive cache before choosing the toggle direction',async()=>{
 for(const cached of [true,false,null]){
  const f=setup();f.rows[0].unread=null;f.shadow.activeElement=f.list.children[0];let requested;
  f.env.window.__PME_OBSERVER__={readState(item){requested=item;return cached;}};
  await f.env.readInboxItem();assert.equal(requested,f.rows[0]);assert.deepEqual(f.calls[0],['read','one',true,cached===false]);
 }
});
test('a missing or failed cache observer does not block marking unknown items read',async()=>{
 const f=setup();f.rows[0].unread=null;f.shadow.activeElement=f.list.children[0];f.env.window.__PME_OBSERVER__={readState(){throw Error('observer unavailable');}};
 await f.env.readInboxItem();assert.deepEqual(f.calls[0],['read','one',true,false]);
});


test('native message focus enables inbox navigation without changing the open conversation',()=>{
 const f=setup();f.env.mode='reply';f.env.selection='two';
 const native={closest:()=>null};f.env.document.activeElement=native;
 const event=key=>f.event(key,{composedPath:()=>[native]});
 assert.equal(f.env.inboxNavigationKey(event('j')),true);
 assert.equal(f.shadow.activeElement.dataset.key,'three');assert.equal(f.env.selection,'two');
 assert.equal(f.env.inputMode,'keyboard');assert.equal(f.calls.some(c=>c[0]==='open'),false);
 f.shadow.activeElement=null;assert.equal(f.env.inboxNavigationKey(event('Enter')),true);assert.deepEqual(f.calls.at(-1),['composer']);
 f.shadow.activeElement=null;assert.equal(f.env.inboxNavigationKey(event('h')),true);assert.equal(f.env.filter,'threads');
 assert.equal(f.env.inboxNavigationKey(event('/')),true);assert.equal(f.shadow.activeElement,f.search);
});
test('native editors and their descendants keep inbox shortcuts until focus is released',()=>{
 for(const viaPath of [true,false]){
  const f=setup();f.env.mode='reply';const editor={closest:()=>({})};
  f.env.document.activeElement=editor;
  for(const key of ['j','k','h','l','x','/','Enter','ArrowDown','ArrowLeft']){
   assert.equal(f.env.inboxNavigationKey(f.event(key,{composedPath:()=>viaPath?[editor]:[{}]})),false);
  }
  assert.deepEqual(f.calls,[]);
 }
});
test('native auxiliary views, overlays and quick reply retain their navigation',()=>{
 for(const state of ['auxiliary','overlay','switcher','quick']){
  const f=setup();f.env.mode='reply';
  if(state==='auxiliary')f.status.auxiliary=true;
  if(state==='overlay')f.env.window.__PME_REPLY__.overlayOpen=()=>true;
  if(state==='switcher')f.env.window.__PME_REPLY__.switcherOpen=()=>true;
  if(state==='quick')f.env.quickReply={};
  assert.equal(f.env.inboxNavigationKey(f.event('j',{composedPath:()=>[{}]})),false);assert.deepEqual(f.calls,[]);
 }
});


test('Shift+/ clears only search text and preserves row/native focus and category',()=>{
 for(const native of [false,true]){
  const f=setup();f.env.filter='channels';f.search.value='launch';
  f.env.mode=native?'reply':'queue';f.env.selection='two';f.shadow.activeElement=native?null:f.list.children[1];
  const before=f.shadow.activeElement;
  const event=f.event('?',{shiftKey:true,code:'Slash',...(native?{composedPath:()=>[{}]}:{})});
  assert.equal(f.env.inboxNavigationKey(event),true);assert.equal(f.search.value,'');
  assert.equal(f.env.filter,'channels');assert.equal(f.shadow.activeElement,before);
  assert.equal(f.calls.some(c=>c[0]==='select-filter'||c[0]==='open'),false);
 }
});
test('Shift+/ remains a question mark while typing and respects modifiers and composition',()=>{
 const f=setup();f.search.value='launch';f.shadow.activeElement=f.search;
 assert.equal(f.env.inboxNavigationKey(f.event('?',{shiftKey:true,code:'Slash'})),false);
 f.env.mode='reply';f.shadow.activeElement=null;
 assert.equal(f.env.inboxNavigationKey(f.event('?',{shiftKey:true,code:'Slash',composedPath:()=>[{closest:()=>({})}]})),false);
 for(const extra of [{metaKey:true},{ctrlKey:true},{altKey:true},{isComposing:true}]){
  assert.equal(f.env.inboxNavigationKey(f.event('?',{shiftKey:true,code:'Slash',...extra})),false);
 }
 assert.equal(f.search.value,'launch');
});
test('Enter into the already mounted editor clears the search before moving focus',()=>{
 const f=setup();f.env.mode='reply';f.search.value='two';f.shadow.activeElement=f.list.children[1];
 assert.equal(f.env.inboxNavigationKey(f.event('Enter')),true);
 assert.equal(f.search.value,'');assert.deepEqual(f.calls,[['composer']]);
});
