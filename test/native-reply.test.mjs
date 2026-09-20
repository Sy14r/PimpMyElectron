import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
function setup({thread=null,delayFirstSelection=false,openingThread=null,nativeCallbacks=false,missingRoot=false,callbackTeam='TONE',selectionThrows=false,scrollThrows=false}={}){
  let clockOffset=0;
  const attributes=new Map(),bodyAttributes=new Map(),listeners=new Map(),storage=new Map(),navigations=[];let focused=false,removed=false,tick;const events=[];
  let threadPending=false,threadClosed=false;
  const readButton={disabled:false,clicks:0,click(){this.clicks++;}};
  const native={team:'TONE',switches:0,selects:0,composeClicks:0,threadNavigations:[],latestJumps:0,replyJumps:[]};
  const teamButton={getAttribute:()=> 'TTWO',click(){native.switches++;native.team='TTWO';location.pathname='/client/TTWO/COLD';}};
  const channelRow={getAttribute:()=> 'CTWO',click(){if(selectionThrows)throw Error('native navigation failed');native.selects++;if(!delayFirstSelection||native.selects>1)box.channel='CTWO';location.pathname='/client/TTWO/CTWO';}};
  const box={channel:'CONE',thread,getAttribute(name){return name==='data-channel-id'?this.channel:name==='data-thread-ts'?this.thread:null;},querySelector:()=>editor};
  const scroller={scrollTop:0,scrollHeight:1200};
  const callbacks={teamId:callbackTeam,channelId:'CONE',threadTs:openingThread||thread,latest:'200.000001',
    dispatchNavigateToThread(request){native.threadNavigations.push(request);threadPending=true;setTimeout(()=>{if(!threadClosed)box.thread=request.ts;},230);},
    jumpToReply(ts){native.replyJumps.push(ts);}};
  const listNode=nativeCallbacks?{__reactFiber$test:{memoizedProps:callbacks,stateNode:{props:callbacks,scrollToMostRecentMessage(){if(scrollThrows)throw Error('scroll unavailable');native.latestJumps++;}}}}:{};
  const threadNode=nativeCallbacks?{__reactFiber$test:{memoizedProps:callbacks}}:{};
  const nativeMessage={getAttribute:k=>k==='data-msg-ts'?'100.000002':box.channel,getBoundingClientRect:()=>({top:120,bottom:160,width:400,height:40})};
  const pane={querySelectorAll:()=>[nativeMessage],isConnected:true,contains:n=>n===editor||n===composer,setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k),querySelector:s=>s==='button.p-message_pane__unread_banner__close_icon'?readButton:s==='[data-qa="threads_flexpane"]'&&(thread||openingThread)?threadNode:s==='.c-virtual_list'?listNode:s==='.c-virtual_list [data-qa="slack_kit_scrollbar"]'?scroller:null};
  const editor={contains:n=>n===editor,isConnected:true,textContent:'untouched user draft',closest:s=>s==='.p-view_contents'?pane:box,focus:()=>{focused=true;}};
  const composerAttributes=new Map(),sendButton={disabled:false};
  const composer={parentElement:pane,querySelector:s=>s==='[data-qa="texty_send_button"]'?sendButton:s==='[role="toolbar"]'?{}:null,setAttribute:(k,v)=>composerAttributes.set(k,v),removeAttribute:k=>composerAttributes.delete(k)};
  editor.parentElement=composer;
  const recipient={focused:false,focus(){this.focused=true;}};
  const composePage={mounted:false,closest:()=>pane,querySelector:s=>s.includes('destination-input')?recipient:editor};
  const composeButton={click(){native.composeClicks++;composePage.mounted=true;location.pathname='/client/'+native.team;}};
  const rootMessage={getAttribute:n=>n==='data-msg-ts'?openingThread:'CONE',querySelector:()=>({click(){threadPending=true;setTimeout(()=>{if(!threadClosed)box.thread=openingThread;},230);}})};
  const document={head:{append(){}},body:{hasAttribute:k=>bodyAttributes.has(k),setAttribute:(k,v)=>bodyAttributes.set(k,v),removeAttribute:k=>bodyAttributes.delete(k)},createElement:()=>({remove(){removed=true;}}),
    querySelectorAll:s=>s==='[data-qa="composer_page"]'?(composePage.mounted?[composePage]:[]):s==='[data-pme-native-reply-pane]'?(attributes.has('data-pme-native-reply-pane')?[pane]:[]):s==='[data-qa="message_input"][data-channel-id]'?[box]:s==='[data-qa="message_container"][data-msg-ts]'&&openingThread&&!missingRoot?[rootMessage]:s==='[data-qa="team_sidebar_item"]'?[teamButton]:s==='[data-qa="channel-sidebar-channel"]'?[channelRow]:[],
    querySelector:s=>s==='[data-qa="composer_button"]'?composeButton:s==='[data-qa="composer_page"]'?(composePage.mounted?composePage:null):s==='[data-qa="team_sidebar_item"][data-team-active="true"]'?{getAttribute:()=>native.team}:s==='[data-qa="threads_flexpane"] button[aria-label="Close"]'&&threadPending?{click(){threadClosed=true;threadPending=false;}}:null,
    addEventListener:(name,fn)=>listeners.set(name,fn)};
  const window={dispatchEvent(event){events.push(event.type);}};window.top=window;
  const location={origin:'https://app.slack.com',pathname:'/client/TONE/CONE',assign:url=>navigations.push(url)};
  vm.runInNewContext(source,{window,document,location,AbortController,CustomEvent:class{constructor(type){this.type=type;}},Date:{now:()=>Date.now()+clockOffset},innerHeight:660,setTimeout,clearInterval(){},setInterval:fn=>{tick=fn;return 1;},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  return {advance:ms=>clockOffset+=ms,readButton,sendButton,window,api:window.__PME_REPLY__,tick:()=>tick(),events,composePage,recipient,scroller,box,pane,editor,composerAttributes,location,native,listeners,storage,navigations,attributes,bodyAttributes,focused:()=>focused,removed:()=>removed};
}
test('native reply frames the verified editor, preserves its draft and removes all layout changes',async()=>{
  const env=setup();assert.equal((await env.api.open({workspaceId:'TONE',channelId:'CONE'})).ok,true);
  assert.equal(env.api.status().ready,true);assert.equal(env.focused(),true);assert.equal(env.editor.textContent,'untouched user draft');assert.ok(env.attributes.has('data-pme-native-reply-pane'));
  assert.ok(env.composerAttributes.has('data-pme-native-composer'));
  env.api.suspend();assert.equal(env.api.status().active,false);assert.equal(env.attributes.size,0);assert.equal(env.bodyAttributes.size,0);assert.equal(env.editor.textContent,'untouched user draft');
  assert.equal(env.composerAttributes.size,0);
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

test('opening a thread waits for its editor instead of closing its loading pane',async()=>{
  const env=setup({openingThread:'100.000001'});
  const result=await env.api.open({workspaceId:'TONE',channelId:'CONE',threadTs:'100.000001'});
  assert.equal(result.ok,true);assert.equal(env.box.thread,'100.000001');assert.equal(env.api.status().ready,true);env.api.dispose();
});


test('native navigation opens a thread whose parent is absent from the DOM',async()=>{
  const env=setup({openingThread:'100.000001',nativeCallbacks:true,missingRoot:true});
  const result=await env.api.open({workspaceId:'TONE',channelId:'CONE',threadTs:'100.000001'});
  assert.equal(result.ok,true);assert.equal(env.native.threadNavigations.length,1);assert.equal(env.api.status().threadNavigation,'native-callback');
  assert.equal(env.native.threadNavigations[0].channelId,'CONE');assert.equal(env.native.threadNavigations[0].ts,'100.000001');
  assert.deepEqual(env.native.replyJumps,['200.000001']);assert.equal(env.api.status().scrollMethod,'native-latest');env.api.dispose();
});
test('conversation open jumps once to latest, and the explicit action can jump again',async()=>{
  const env=setup({nativeCallbacks:true});await env.api.open({workspaceId:'TONE',channelId:'CONE'});
  assert.equal(env.native.latestJumps,1);assert.equal(env.scroller.scrollTop,1200);
  env.scroller.scrollTop=0;assert.equal(env.api.jumpToLatest().ok,true);assert.equal(env.native.latestJumps,2);assert.equal(env.scroller.scrollTop,1200);
  assert.equal(env.editor.textContent,'untouched user draft');
  env.box.channel='COTHER';assert.equal(env.api.jumpToLatest().ok,false);assert.equal(env.native.latestJumps,2);env.api.dispose();
});
test('scroll fallback stays in the verified pane when native callbacks are missing, stale or throw',async()=>{
  for(const options of [{},{nativeCallbacks:true,callbackTeam:'TOTHER'},{nativeCallbacks:true,scrollThrows:true}]){
    const env=setup(options);await env.api.open({workspaceId:'TONE',channelId:'CONE'});
    assert.equal(env.native.latestJumps,0);assert.equal(env.scroller.scrollTop,1200);assert.equal(env.api.status().scrollMethod,'rendered-bottom');
    env.api.suspend();assert.equal(env.api.jumpToLatest().ok,false);env.api.dispose();
  }
});
test('a native navigation exception ends loading with a recoverable error',async()=>{
  const env=setup({selectionThrows:true});const result=await env.api.open({workspaceId:'TTWO',channelId:'CTWO'});
  assert.equal(result.ok,false);assert.equal(env.api.status().state,'error');assert.equal(env.api.status().ready,false);env.api.dispose();
});


test('a thread callback belonging to another workspace is ignored in favor of the visible reply bar',async()=>{
  const env=setup({openingThread:'100.000001',nativeCallbacks:true,callbackTeam:'TOTHER'});
  const result=await env.api.open({workspaceId:'TONE',channelId:'CONE',threadTs:'100.000001'});
  assert.equal(result.ok,true);assert.equal(env.native.threadNavigations.length,0);assert.equal(env.api.status().threadNavigation,'visible-reply-bar');env.api.dispose();
});


test('Compose opens native recipient entry in the requested workspace and reuses its draft on resume',async()=>{
  const env=setup();const request={kind:'compose',workspaceId:'TTWO'};
  assert.equal((await env.api.open(request)).ok,true);assert.equal(env.native.switches,1);assert.equal(env.native.composeClicks,1);
  assert.equal(env.native.selects,0);assert.equal(env.recipient.focused,true);assert.equal(env.api.status().ready,true);
  assert.equal(env.api.status().target.key,'TTWO:compose');assert.equal(env.api.jumpToLatest().ok,false);
  env.api.suspend();assert.equal((await env.api.open(request)).ok,true);assert.equal(env.native.composeClicks,1);
  assert.equal(env.editor.textContent,'untouched user draft');assert.equal(JSON.stringify([...env.storage.values()]).includes('untouched user draft'),false);env.api.dispose();
});
test('Compose leaves recipient validation to Slack but blocks a different workspace',async()=>{
  const env=setup();await env.api.open({kind:'compose',workspaceId:'TONE'});let blocked=false;
  const event={type:'click',target:{closest:()=>({})},preventDefault(){blocked=true;},stopImmediatePropagation(){}};
  env.listeners.get('click')(event);assert.equal(blocked,false);
  env.native.team='TTWO';env.listeners.get('click')(event);assert.equal(blocked,true);assert.equal(env.api.status().state,'error');env.api.dispose();
});
test('leaving native Compose returns control to the inbox without adopting an unverified conversation',async()=>{
  const env=setup();await env.api.open({kind:'compose',workspaceId:'TONE'});
  env.composePage.mounted=false;env.location.pathname='/client/TONE/CNEW';env.tick();
  assert.equal(env.api.status().active,false);assert.equal(env.api.status().target,null);assert.ok(env.events.includes('pme-native-compose-closed'));
  assert.equal(env.editor.textContent,'untouched user draft');env.api.dispose();
});
test('Compose rejects mixed conversation targets before navigating',async()=>{
  const env=setup();assert.equal((await env.api.open({kind:'compose',workspaceId:'TONE',channelId:'CONE'})).ok,false);
  assert.equal(env.native.composeClicks,0);env.api.dispose();
});

test('preparing a native pane defers editor focus until the reveal finishes',async()=>{
 const env=setup();await env.api.open({workspaceId:'TONE',channelId:'CONE'},{focusEditor:false});
 assert.equal(env.api.status().ready,true);assert.equal(env.focused(),false);
 assert.equal(env.api.focus(),true);assert.equal(env.focused(),true);
 env.api.suspend();assert.equal(env.api.focus(),false);env.api.dispose();
});

test('quick reply closes only after confirmed send, empty composer and no new draft',async()=>{
 for(const newDraft of [false,true]){
  const e=setup();await e.api.open({workspaceId:'TONE',channelId:'CONE'});e.bodyAttributes.set('data-pme-quick','');
  let attempt;e.window.__pmeTriageAction=raw=>{attempt=JSON.parse(raw);};
  e.listeners.get('click')({type:'click',target:{closest:()=>({})}});
  assert.equal(attempt.action,'quick-send-attempt');e.editor.textContent='';e.sendButton.disabled=true;e.tick();
  assert.equal(e.events.includes('pme-native-quick-sent'),false);
  if(newDraft){e.editor.textContent='next draft';e.listeners.get('beforeinput')({isTrusted:true,target:e.editor});e.editor.textContent='';}
  e.api.confirmSend(attempt.id,'100.000002');assert.ok(e.events.includes('pme-native-quick-confirmed'));e.tick();assert.equal(e.events.includes('pme-native-quick-sent'),false);e.advance(1101);e.tick();assert.equal(e.events.includes('pme-native-quick-sent'),!newDraft);assert.equal(e.readButton.clicks,newDraft?0:1);
  e.api.dispose();
 }
});

test('native Mark read only invokes the verified conversation banner button',async()=>{
 const e=setup();assert.equal(e.api.markReadNative().ok,false);await e.api.open({workspaceId:'TONE',channelId:'CONE'});
 assert.equal(e.api.markReadNative().ok,true);assert.equal(e.readButton.clicks,1);
 e.native.team='TTWO';assert.equal(e.api.markReadNative().ok,false);assert.equal(e.readButton.clicks,1);e.api.dispose();
 const thread=setup({thread:'1.0'});await thread.api.open({workspaceId:'TONE',channelId:'CONE',threadTs:'1.0'});
 assert.equal(thread.api.markReadNative().ok,false);assert.equal(thread.readButton.clicks,0);thread.api.dispose();
});
