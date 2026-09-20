import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('  const pendingInboxRead='),source.indexOf('  function nextUnreadItem('));
function setup(){
 const calls=[],host={},rows=[{key:'one',unread:true,latest:'100.1'},{key:'two',unread:true,latest:'100.2'},{key:'three',unread:false}],nodes=new Map();
 const shadow={activeElement:null};
 const list={children:rows.map(item=>({dataset:{key:item.key},focus(){shadow.activeElement=this;calls.push(['focus',item.key]);},scrollIntoView(){}}))};
 const search={dataset:{},matches:()=>true,focus(){shadow.activeElement=this;},select(){calls.push(['select-filter']);}};nodes.set('list',list);nodes.set('search',search);nodes.set('notice',{});
 const status={ready:true,target:{key:'two'}};
 const env={mode:'queue',filter:'all',quickReply:null,pillReadPending:null,selection:null,openingKey:null,shadow,host,startCompose:()=>calls.push(['compose']),filtered:()=>rows,$:id=>nodes.get(id),connected:()=>true,render(){},touch(){},openItem:key=>calls.push(['open',key]),
   window:{__PME_REPLY__:{status:()=>status,focus:()=>calls.push(['composer'])}},heldRow:null,transition:async mode=>{env.mode=mode;calls.push(['mode',mode]);},focusInbox:()=>calls.push(['inbox']),readFromPill:async(item,opts)=>{calls.push(['read',item.key,opts.inbox]);return {ok:true};}};
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
test('X reads the selected unread item using the hidden native flow and advances; read items and repeats do nothing',async()=>{
 const f=setup();f.shadow.activeElement=f.list.children[0];f.env.mode='reply';
 await f.env.readInboxItem();assert.deepEqual(f.calls,[['mode','queue'],['read','one',true],['inbox']]);assert.equal(f.env.selection,'two');
 f.calls.length=0;f.shadow.activeElement=f.list.children[2];await f.env.readInboxItem();assert.equal(f.calls.length,0);
 f.shadow.activeElement=f.list.children[0];f.env.inboxNavigationKey(f.event('x',{repeat:true}));assert.equal(f.calls.length,0);
 f.env.pillReadPending={key:'one',latest:100.1};await f.env.readInboxItem();assert.equal(f.calls.length,0);
});

test('H/L and horizontal arrows cycle inbox filters in order and wrap',()=>{
 const f=setup();f.shadow.activeElement=f.list.children[0];
 for(const [key,filter] of [['l','unread'],['ArrowRight','mentions'],['l','dms'],['l','threads'],['l','all'],['h','threads'],['ArrowLeft','dms']]){assert.equal(f.env.inboxNavigationKey(f.event(key)),true);assert.equal(f.env.filter,filter);}
 assert.equal(f.calls.filter(c=>c[0]==='inbox').length,7);assert.equal(f.calls.some(c=>c[0]==='open'),false);
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
