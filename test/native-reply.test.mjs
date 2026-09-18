import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
function setup({thread=null,delayFirstSelection=false}={}){
  const attributes=new Map(),bodyAttributes=new Map(),listeners=new Map(),storage=new Map(),navigations=[];let focused=false,removed=false;
  const native={team:'TONE',switches:0,selects:0};
  const teamButton={getAttribute:()=> 'TTWO',click(){native.switches++;native.team='TTWO';location.pathname='/client/TTWO/COLD';}};
  const channelRow={getAttribute:()=> 'CTWO',click(){native.selects++;if(!delayFirstSelection||native.selects>1)box.channel='CTWO';location.pathname='/client/TTWO/CTWO';}};
  const box={channel:'CONE',thread,getAttribute(name){return name==='data-channel-id'?this.channel:name==='data-thread-ts'?this.thread:null;},querySelector:()=>editor};
  const pane={isConnected:true,contains:n=>n===editor,setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k),querySelector:()=>thread?{}:null};
  const editor={isConnected:true,textContent:'untouched user draft',closest:s=>s==='.p-view_contents'?pane:box,focus:()=>{focused=true;}};
  const document={head:{append(){}},body:{setAttribute:(k,v)=>bodyAttributes.set(k,v),removeAttribute:k=>bodyAttributes.delete(k)},createElement:()=>({remove(){removed=true;}}),
    querySelectorAll:s=>s==='[data-pme-native-reply-pane]'?(attributes.has('data-pme-native-reply-pane')?[pane]:[]):s==='[data-qa="message_input"][data-channel-id]'?[box]:s==='[data-qa="team_sidebar_item"]'?[teamButton]:s==='[data-qa="channel-sidebar-channel"]'?[channelRow]:[],
    querySelector:s=>s==='[data-qa="team_sidebar_item"][data-team-active="true"]'?{getAttribute:()=>native.team}:null,
    addEventListener:(name,fn)=>listeners.set(name,fn)};
  const window={dispatchEvent(){}};window.top=window;
  const location={origin:'https://app.slack.com',pathname:'/client/TONE/CONE',assign:url=>navigations.push(url)};
  vm.runInNewContext(source,{window,document,location,AbortController,CustomEvent:class{},Date,setTimeout,clearInterval(){},setInterval:()=>1,
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  return {api:window.__PME_REPLY__,box,pane,editor,location,native,listeners,storage,navigations,attributes,bodyAttributes,focused:()=>focused,removed:()=>removed};
}
test('native reply frames the verified editor, preserves its draft and removes all layout changes',async()=>{
  const env=setup();assert.equal((await env.api.open({workspaceId:'TONE',channelId:'CONE'})).ok,true);
  assert.equal(env.api.status().ready,true);assert.equal(env.focused(),true);assert.equal(env.editor.textContent,'untouched user draft');assert.ok(env.attributes.has('data-pme-native-reply-pane'));
  env.api.suspend();assert.equal(env.api.status().active,false);assert.equal(env.attributes.size,0);assert.equal(env.bodyAttributes.size,0);assert.equal(env.editor.textContent,'untouched user draft');
  assert.equal(JSON.stringify([...env.storage.values()]).includes('untouched user draft'),false);
  env.api.dispose();assert.equal(env.removed(),true);
});
test('thread destination changes block native sending before clearing the reply layout',async()=>{
  const env=setup({thread:'100.000001'});await env.api.open({workspaceId:'TONE',channelId:'CONE',threadTs:'100.000001'});
  assert.equal(env.api.status().ready,true);env.box.thread='200.000001';let prevented=false,stopped=false;
  env.listeners.get('click')({type:'click',target:{closest:()=>({})},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
  assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(env.api.status().state,'error');assert.equal(env.attributes.size,0);env.api.dispose();
});
test('native workspace and channel navigation preserve the editor draft without direct URL assignment',async()=>{
  const env=setup();assert.equal((await env.api.open({workspaceId:'TONE',channelId:'../bad'})).ok,false);assert.equal(env.navigations.length,0);
  const r=await env.api.open({workspaceId:'TTWO',channelId:'CTWO',name:'Person'});
  assert.equal(r.ok,true);assert.equal(env.native.switches,1);assert.equal(env.native.selects,1);assert.deepEqual(env.navigations,[]);assert.equal(env.api.status().ready,true);
  assert.equal(env.editor.textContent,'untouched user draft');assert.equal(JSON.stringify([...env.storage.values()]).includes('untouched user draft'),false);env.api.dispose();
});
test('a stale workspace DOM blocks sending even when the URL and editor channel still match',async()=>{
  const env=setup();await env.api.open({workspaceId:'TONE',channelId:'CONE'});env.native.team='TTWO';
  assert.equal(env.api.status().ready,false);
  let prevented=false;env.listeners.get('keydown')({type:'keydown',key:'Enter',target:{closest:()=>({})},preventDefault(){prevented=true;},stopImmediatePropagation(){}});
  assert.equal(prevented,true);env.api.dispose();
});

test('native routing retries a sidebar selection when a workspace restore has not mounted its composer',async()=>{
  const env=setup({delayFirstSelection:true});
  const result=await env.api.open({workspaceId:'TTWO',channelId:'CTWO'});
  assert.equal(result.ok,true);assert.equal(env.native.selects,2);assert.equal(env.api.status().ready,true);env.api.dispose();
});
test('suspending an incomplete navigation cancels further route retries',async()=>{
  const env=setup({delayFirstSelection:true});
  const pending=env.api.open({workspaceId:'TTWO',channelId:'CTWO'});env.api.suspend();
  assert.equal((await pending).cancelled,true);assert.equal(env.native.selects,1);assert.equal(env.api.status().active,false);env.api.dispose();
});
