import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('  function switcherDestination('),source.indexOf('  function focus(){'));
function fixture({editable=true}={}){
  const actions=[],events=[],attrs=new Map();let team='TONE',route='TONE',selected,pseudo,now=0;
  const selection={rangeCount:1,anchorNode:{},getRangeAt:()=>({cloneRange:()=>savedRange}),removeAllRanges:()=>actions.push('clear-selection'),addRange:r=>actions.push(r===savedRange?'restore-range':'select-query')};
  const savedRange={startContainer:selection.anchorNode};
  const focus={isConnected:true,contains:n=>n===selection.anchorNode,focus:()=>actions.push('restore-focus')};
  const field={isContentEditable:editable,getAttribute:()=>team,closest:()=>modal,focus:()=>actions.push('query-focus')};
  const modal={isConnected:true,contains:n=>n===field||n===pseudo||n===selected,querySelector:s=>s.includes('search_input_close')?{click(){actions.push('close');modal.isConnected=false;}}:s.includes('aria-selected')?selected:pseudo};
  const button={dispatchEvent:()=>actions.push('open')};
  const env={switcher:null,disposed:false,document:{activeElement:focus,body:{setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)},querySelector:s=>s.includes('top_nav_search')?button:field,querySelectorAll:()=>[{getAttribute:()=> 'TTWO',click(){team=route='TTWO';actions.push('workspace');}}],createRange:()=>({selectNodeContents(){}})},
    nativeTeam:()=>team,path:()=>['','client',route],overlayOpen:()=>false,window:{getSelection:()=>selection,dispatchEvent:e=>events.push(e)},Date:{now:()=>now},
    MouseEvent:class{},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},afterLayout:async()=>{},waitForNativeChange:async()=>{now+=150;field.isContentEditable=true;}};
  vm.runInNewContext(helpers,env);
  const row=(type,id,im)=>{const attributes={'data-type':type,'data-id':id,'data-is-navigational':'true','aria-label':'Test, Direct Message'};return {isConnected:true,attributes,getAttribute:k=>attributes[k],closest(){return this;},click:()=>actions.push('navigate'),__reactFiber$test:{memoizedProps:{suggestion:{id,im}}}};};
  const event=(extra={})=>({type:'keydown',key:'Enter',target:field,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
  return {env,actions,events,attrs,focus,field,modal,row,event,pseudo:r=>pseudo=r,selected:r=>selected=r};
}
test('switcher resolves native channel IDs and exact member-to-DM metadata without using labels',()=>{
  const f=fixture();assert.equal(f.env.switcherDestination(f.row('channel','CONE'),'TONE').channelId,'CONE');
  const im={id:'DONE',user:'UONE',context_team_id:'TONE'};
  assert.equal(f.env.switcherDestination(f.row('member','UONE',im),'TONE').channelId,'DONE');
  for(const bad of [{...im,user:'UOTHER'},{...im,context_team_id:'TTWO'},undefined])assert.equal(f.env.switcherDestination(f.row('member','UONE',bad),'TONE'),null);
  assert.equal(f.env.switcherDestination(f.row('channel','javascript:bad'),'TONE'),null);
  assert.equal(f.env.switcherDestination(f.row('workflow','CONE'),'TONE'),null);
});
test('switcher waits for native editing, focuses only the query, and restores draft focus and selection on Escape',async()=>{
  const f=fixture({editable:false});assert.equal(await f.env.openSwitcher('TONE'),true);assert.ok(f.attrs.has('data-pme-switcher'));
  assert.deepEqual(f.actions,['open','query-focus','clear-selection','select-query']);
  const event=f.event({key:'Escape'});assert.equal(f.env.switcherAction(event),true);await Promise.resolve();
  assert.equal(event.stopped,true);assert.equal(f.env.switcherOpen(),false);assert.equal(f.attrs.size,0);
  assert.deepEqual(f.actions.slice(-4),['close','restore-focus','clear-selection','restore-range']);assert.equal(f.events.length,0);
});
test('native selection supports Enter and mouse, replays once, and rejects changed results',async()=>{
  for(const mouse of [false,true]){
    const f=fixture();await f.env.openSwitcher('TONE');const row=f.row('channel','CONE');f.pseudo(row);
    const event=f.event(mouse?{type:'click',target:row,button:0}:{});assert.equal(f.env.switcherAction(event),true);
    assert.equal(f.events[0].detail.destination.channelId,'CONE');assert.equal(f.actions.includes('navigate'),false);
    const navigate=f.events[0].detail.navigate;navigate();navigate();
    assert.equal(f.actions.filter(a=>a==='navigate').length,1);assert.equal(f.actions.includes('restore-focus'),false);
  }
  const f=fixture();await f.env.openSwitcher('TONE');const row=f.row('channel','CONE');f.pseudo(row);f.env.switcherAction(f.event());row.attributes['data-id']='COTHER';f.events[0].detail.navigate();assert.equal(f.actions.includes('navigate'),false);
});
test('highlighted result wins; modifiers, composition and repeat cannot accidentally choose a destination',async()=>{
  const f=fixture();await f.env.openSwitcher('TONE');f.pseudo(f.row('channel','CONE'));f.selected(f.row('channel','CTWO'));
  for(const options of [{isComposing:true},{shiftKey:true},{metaKey:true},{altKey:true}])assert.equal(f.env.switcherAction(f.event(options)),false);
  assert.equal(f.env.switcherAction(f.event({repeat:true})),true);assert.equal(f.events.length,0);
  f.env.switcherAction(f.event());assert.equal(f.events[0].detail.destination.channelId,'CTWO');
});
test('workflow suggestions explicitly request native fallback, never infer recipients',async()=>{
  const f=fixture();await f.env.openSwitcher('TONE');f.pseudo(f.row('workflow',null));f.env.switcherAction(f.event());
  assert.equal(f.events[0].detail.destination,null);f.events[0].detail.navigate();assert.equal(f.actions.at(-1),'navigate');
});
test('search uses the requested native workspace and refuses missing workspaces or existing overlays',async()=>{
  const f=fixture();assert.equal(await f.env.openSwitcher('TTWO'),true);assert.deepEqual(f.actions.slice(0,2),['workspace','open']);
  const missing=fixture();assert.equal(await missing.env.openSwitcher('TMISSING'),false);assert.equal(missing.actions.includes('open'),false);
  const overlay=fixture();overlay.env.overlayOpen=()=>true;assert.equal(await overlay.env.openSwitcher('TONE'),false);assert.equal(overlay.actions.length,0);
});
test('native close restores focus, whereas cancelled selections cannot replay after leaving triage',async()=>{
  const f=fixture();await f.env.openSwitcher('TONE');f.modal.isConnected=false;f.env.syncSwitcher();await Promise.resolve();assert.ok(f.actions.includes('restore-focus'));
  const g=fixture();await g.env.openSwitcher('TONE');g.pseudo(g.row('channel','CONE'));g.env.switcherAction(g.event());g.env.cancelSwitcher({restore:false});g.events[0].detail.navigate();assert.equal(g.actions.includes('navigate'),false);
});
test('Escape during accepted selection cannot cancel the pending replay and strand a loading pane',async()=>{
  const f=fixture();await f.env.openSwitcher('TONE');f.pseudo(f.row('channel','CONE'));f.env.switcherAction(f.event());
  f.env.switcherAction(f.event({key:'Escape'}));assert.equal(f.env.switcherOpen(),true);f.events[0].detail.navigate();assert.equal(f.actions.at(-1),'navigate');
});
const triage=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const start=triage.indexOf("  window.addEventListener('keydown',event=>{");
const end=triage.indexOf('},{capture:true,signal:abort.signal});',start)+'},{capture:true,signal:abort.signal});'.length;
test('Command-K is captured before inbox filtering, while full Slack, native dialogs and IME keep their keys',()=>{
  let listener,opened=0,navigated=0;
  const env={densityMenu:{matches:()=>false},mode:'queue',aliasDialog:{open:false},workspaceDialog:{open:false},abort:{signal:{}},openNativeSwitcher:()=>opened++,composeToggleKey:()=>false,inboxNavigationKey:()=>false,triageNavigationKey:()=>navigated++,window:{addEventListener:(_name,fn)=>listener=fn,__PME_REPLY__:{switcherOpen:()=>false,overlayOpen:()=>false}}};
  vm.runInNewContext(triage.slice(start,end),env);
  const key=extra=>({key:'k',metaKey:true,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
  const event=key();listener(event);assert.equal(opened,1);assert.equal(event.stopped,true);
  listener(key({repeat:true}));assert.equal(opened,1);
  env.mode='reply';listener(key());assert.equal(opened,2);
  env.mode='stock';const stock=key();listener(stock);assert.equal(stock.prevented,undefined);assert.equal(opened,2);
  env.mode='queue';listener(key({isComposing:true}));assert.equal(opened,2);
  env.workspaceDialog.open=true;listener(key());assert.equal(opened,2);
});

test('search queries and native search history have their own pane target without conversation recipients',()=>{
 const f=fixture();for(const type of ['queryUser','queryHistory']){const row=f.row(type,null);row.attributes['data-is-navigational']=null;
 assert.deepEqual(JSON.parse(JSON.stringify(f.env.switcherDestination(row,'TONE'))),{kind:'search',workspaceId:'TONE',key:'TONE:search',name:'Search results'});}
});
test('native Enter submissions without a suggestion still promote the resulting search route',async()=>{
 const f=fixture();await f.env.openSwitcher('TONE');assert.equal(f.env.switcherAction(f.event()),false);
 f.env.path=()=>['','client','TONE','search'];f.modal.isConnected=false;f.env.syncSwitcher();
 assert.equal(f.events[0].type,'pme-native-search-open');assert.equal(f.events[0].detail.workspaceId,'TONE');assert.equal(f.actions.includes('restore-focus'),false);
});
test('query submission tolerates the popup closing before native search routing commits',async()=>{
 const f=fixture();await f.env.openSwitcher('TONE');f.env.switcherAction(f.event());f.modal.isConnected=false;f.env.syncSwitcher();assert.equal(f.env.switcherOpen(),true);assert.equal(f.events.length,0);
 f.env.path=()=>['','client','TONE','search'];f.env.syncSwitcher();assert.equal(f.events[0].type,'pme-native-search-open');
});
