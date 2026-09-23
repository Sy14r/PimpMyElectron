import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
function setup({thread=null,delayFirstSelection=false,openingThread=null,nativeCallbacks=false,missingRoot=false,callbackTeam='TONE',selectionThrows=false,scrollThrows=false,headerControls=false,menuControls=false,returningThread=false,notificationOnly=false}={}){
  let clockOffset=0;
  const attributes=new Map(),bodyAttributes=new Map(),listeners=new Map(),storage=new Map(),navigations=[];let focused=false,removed=false,tick;const events=[];
  let threadPending=false,threadClosed=false;
  const readButton={disabled:false,clicks:0,click(){this.clicks++;}};
  const native={team:'TONE',threadCloses:0,switches:0,selects:0,composeClicks:0,threadNavigations:[],latestJumps:0,replyJumps:[]};
  const teamButton={getAttribute:()=> 'TTWO',click(){native.switches++;native.team='TTWO';location.pathname='/client/TTWO/COLD';}};
  const channelRow={getAttribute:()=> 'CTWO',click(){if(selectionThrows)throw Error('native navigation failed');native.selects++;if(!delayFirstSelection||native.selects>1)box.channel='CTWO';location.pathname='/client/TTWO/CTWO';}};
  const box={channel:'CONE',thread,getAttribute(name){return name==='data-channel-id'?this.channel:name==='data-thread-ts'?this.thread:null;},querySelector:()=>editor};
  const scroller={scrollTop:0,scrollHeight:1200};
  const callbacks={teamId:callbackTeam,channelId:'CONE',threadTs:openingThread||thread,latest:'200.000001',
    dispatchNavigateToThread(request){native.threadNavigations.push(request);threadPending=true;setTimeout(()=>{if(!threadClosed)box.thread=request.ts;},230);},
    markMostRecentMsgRead(request){native.readConversation=request;},markReplyAsUnreadByMsg(message){native.unreadThread=message;},messages:{'200.000001':{ts:'200.000001',thread_ts:openingThread||thread}},maxMarkableTs:'200.000001',
    jumpToReply(ts){native.replyJumps.push(ts);},jumpToMessageInChannel({messageTs}){native.messageJump=messageTs;}};
  const listNode=nativeCallbacks?{__reactFiber$test:{memoizedProps:callbacks,stateNode:{props:callbacks,scrollToMostRecentMessage(){if(scrollThrows)throw Error('scroll unavailable');native.latestJumps++;}}}}:{};
  const threadNode=nativeCallbacks?{__reactFiber$test:{memoizedProps:callbacks,stateNode:{props:callbacks,markThreadRead(){native.threadReads=(native.threadReads||0)+1;}}}}:{};
  const nativeMessage={...(nativeCallbacks?{__reactFiber$test:{memoizedProps:{teamId:callbackTeam,channelId:'CONE',ts:'100.000002',markMsgUnread(request){native.unreadMessage=request;}}}}:{}),getAttribute:k=>k==='data-msg-ts'?'100.000002':box.channel,getBoundingClientRect:()=>({top:120,bottom:160,width:400,height:40})};
  const headerAttributes=new Map(),headerChildren=[],headerEvents=[],bodyChildren=[];
  const makeNode=()=>({attributes:new Map(),children:[],handlers:new Map(),style:{},offsetWidth:220,offsetHeight:120,isConnected:true,
    setAttribute(k,v){this.attributes.set(k,v);},getAttribute(k){return this.attributes.get(k)??null;},hasAttribute(k){return this.attributes.has(k);},removeAttribute(k){this.attributes.delete(k);},
    matches:()=>false,focus(){document.activeElement=this;},getBoundingClientRect:()=>({right:700,bottom:48,width:30,height:30}),
    append(n){this.children.push(n);n.parentElement=this;},addEventListener(k,fn){this.handlers.set(k,fn);},showPopover(){},
    querySelector(){return this.children.find(n=>!n.disabled);},querySelectorAll(){return this.children.filter(n=>!n.disabled);},
    remove(){for(const list of [headerChildren,bodyChildren]){const i=list.indexOf(this);if(i>=0)list.splice(i,1);}this.parentElement=null;this.isConnected=false;}});
  const controlSelectors=['button[data-qa="huddle_channel_header_button"]','[data-qa="search_in_channel_button"]','[data-feat="view-header:notifications"]'];
  const controls=controlSelectors.map(()=>({...makeNode(),clicks:0,click(){this.clicks++;}}));
  controls[2].setAttribute('aria-label','Mute conversation');controls[2].setAttribute('aria-pressed','false');
  const auxAttributes=new Map(),auxView={hasAttribute:k=>auxAttributes.has(k),focus:()=>{document.activeElement=auxView;},isConnected:false,setAttribute:(k,v)=>auxAttributes.set(k,v),removeAttribute:k=>auxAttributes.delete(k),querySelector:()=>null};
  let auxiliaryKind=null;

  const nativeLinkButton={closest:s=>s==='a,button,[role="button"]'?nativeLinkButton:null};
  const back={matches:()=>true},otherHeaderControl={matches:()=>false};
  const header={querySelector:s=>s.startsWith('.p-flexpane_header__primary,')?header:menuControls?controls[controlSelectors.indexOf(s)]||null:null,contains:n=>n===back||n===otherHeaderControl||headerChildren.includes(n)||controls.includes(n),setAttribute:(k,v)=>headerAttributes.set(k,v),removeAttribute:k=>headerAttributes.delete(k),prepend(n){headerChildren.unshift(n);n.parentElement=header;},append(n){headerChildren.push(n);n.parentElement=header;},insertBefore(n,before){headerChildren.splice(headerChildren.indexOf(before),0,n);n.parentElement=header;}};
  for(const control of controls)control.parentElement=header;
  const pane={hasAttribute:k=>attributes.has(k),focus:()=>{document.activeElement=pane;},querySelectorAll:()=>[nativeMessage],isConnected:true,contains:n=>n===editor||n===composer||n===nativeLinkButton,setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k),querySelector:s=>s.startsWith('.p-flexpane_header,')||s.startsWith('.p-view_header,')?(headerControls?header:null):s==='button.p-message_pane__unread_banner__close_icon'?(readButton.hidden?null:readButton):s==='[data-qa="threads_flexpane"]'&&(thread||openingThread)?threadNode:s==='.c-virtual_list'?listNode:s==='.c-virtual_list [data-qa="slack_kit_scrollbar"]'?scroller:null};
  const editor={contains:n=>n===editor,isConnected:true,textContent:'untouched user draft',closest:s=>s==='.p-view_contents'?pane:box,focus:()=>{focused=true;}};
  const composerAttributes=new Map(),sendButton={disabled:false};
  const composer={parentElement:pane,querySelector:s=>s==='[data-qa="texty_send_button"]'?sendButton:s==='[role="toolbar"]'?{}:null,setAttribute:(k,v)=>composerAttributes.set(k,v),removeAttribute:k=>composerAttributes.delete(k)};
  editor.parentElement=composer;
  const recipient={focused:false,focus(){this.focused=true;}};
  const composePage={mounted:false,closest:()=>pane,querySelector:s=>s.includes('destination-input')?recipient:editor};
  const composeButton={click(){native.composeClicks++;composePage.mounted=true;location.pathname='/client/'+native.team;}};
  const rootMessage={getAttribute:n=>n==='data-msg-ts'?openingThread:'CONE',querySelector:()=>({click(){threadPending=true;setTimeout(()=>{if(!threadClosed)box.thread=openingThread;},230);}})};
  const document={head:{append(){}},body:{append:n=>bodyChildren.push(n),hasAttribute:k=>bodyAttributes.has(k),setAttribute:(k,v)=>bodyAttributes.set(k,v),removeAttribute:k=>bodyAttributes.delete(k)},createElement:tag=>tag==='style'?{remove(){removed=true;}}:makeNode(),
    querySelectorAll:s=>s==='[data-qa="search_view"]'?(auxiliaryKind==='full search'?[{closest:()=>auxView}]:[]):s==='[data-pme-message-focus]'?[...(attributes.has('data-pme-message-focus')?[pane]:[]),...(auxAttributes.has('data-pme-message-focus')?[auxView]:[])]:s==='[data-qa="message-input-system-notification-roadblock"]'?(notificationOnly?[{closest:()=>pane}]:[]):s==='[data-qa="composer_page"]'?(composePage.mounted?[composePage]:[]):s==='[data-pme-native-reply-pane]'?[...(attributes.has('data-pme-native-reply-pane')?[pane]:[]),...(auxAttributes.has('data-pme-native-reply-pane')?[auxView]:[])]:s==='[data-qa="message_input"][data-channel-id]'?(notificationOnly?[]:[box]):s==='[data-qa="message_container"][data-msg-ts]'&&openingThread&&!missingRoot?[rootMessage]:s==='[data-qa="team_sidebar_item"]'?[teamButton]:s==='[data-qa="channel-sidebar-channel"]'?[channelRow]:[],
    querySelector:s=>s===`[data-qa="message_input"][data-channel-id="${box.channel}"]`?box:(auxiliaryKind==='profile'&&s==='[data-qa="member_profile_pane"]'||auxiliaryKind==='search'&&s==='[data-qa="search_in_channel_title"]'||auxiliaryKind==='full search'&&s==='[data-qa="search_view"]')?{closest:()=>auxView}:s==='[data-qa="quip_close_thread"]'&&returningThread&&box.thread?{click(){native.threadCloses++;box.thread=null;}}:s==='[data-qa="composer_button"]'?composeButton:s==='[data-qa="composer_page"]'?(composePage.mounted?composePage:null):s==='[data-qa="team_sidebar_item"][data-team-active="true"]'?{getAttribute:()=>native.team}:s==='[data-qa="threads_flexpane"] button[aria-label="Close"]'&&threadPending?{click(){threadClosed=true;threadPending=false;}}:null,
    addEventListener:(name,fn)=>listeners.set(name,fn)};
  const window={__PME_TRIAGE__:{status:()=>({mode:'reply'})},dispatchEvent(event){events.push(event.type);if(event.type==='pme-native-header-action')headerEvents.push(event.detail.action);}};window.top=window;
  const location={origin:'https://app.slack.com',pathname:'/client/TONE/CONE',assign:url=>navigations.push(url)};
  vm.runInNewContext(source,{window,document,location,AbortController,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},Date:{now:()=>Date.now()+clockOffset},innerWidth:820,innerHeight:660,setTimeout,clearInterval(){},setInterval:fn=>{tick=fn;return 1;},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  return {auxView,nativeLinkButton,setNotificationOnly(value){notificationOnly=value;},callbacks,controls,bodyChildren,document,auxAttributes,setAuxiliary(kind){auxiliaryKind=kind;auxView.isConnected=!!kind;editor.isConnected=!kind;},header,headerChildren,headerEvents,headerAttributes,back,otherHeaderControl,advance:ms=>clockOffset+=ms,readButton,sendButton,window,api:window.__PME_REPLY__,tick:()=>tick(),events,composePage,recipient,scroller,box,pane,editor,composerAttributes,location,native,listeners,storage,navigations,attributes,bodyAttributes,focused:()=>focused,removed:()=>removed};
}
function clickHeader(env,button){
 const result={prevented:false,stopped:false};env.listeners.get('click')({type:'click',target:{closest:selector=>selector==='button'?button:null},preventDefault(){result.prevented=true;},stopImmediatePropagation(){result.stopped=true;}});return result;
}
test('native header actions intercept back and handoff without navigation or draft changes',async()=>{
 const env=setup({thread:'100.000001',headerControls:true});await env.api.open({workspaceId:'TONE',channelId:'CONE',threadTs:'100.000001'});
 assert.equal(env.headerChildren.length,2);assert.ok(env.headerAttributes.has('data-pme-native-header'));
 for(let i=0;i<3;i++)env.tick();assert.equal(env.headerChildren.length,2);
 assert.deepEqual(clickHeader(env,env.back),{prevented:true,stopped:true});assert.deepEqual(env.headerEvents,['conversation']);
 assert.deepEqual(clickHeader(env,env.headerChildren.find(b=>b.className==='pme-open-slack')),{prevented:true,stopped:true});assert.deepEqual(env.headerEvents,['conversation','stock']);
 assert.deepEqual(clickHeader(env,env.headerChildren.find(b=>b.className==='pme-thread-alias')),{prevented:true,stopped:true});assert.ok(env.events.includes('pme-thread-alias'));
 assert.equal(env.editor.textContent,'untouched user draft');assert.deepEqual(env.navigations,[]);
 env.api.suspend();assert.equal(env.headerChildren.length,0);assert.equal(env.headerAttributes.size,0);env.api.dispose();
});
test('native header leaves unrelated controls and full Slack alone and rejects stale destinations',async()=>{
 const env=setup({headerControls:true});await env.api.open({workspaceId:'TONE',channelId:'CONE'});
 assert.equal(clickHeader(env,env.otherHeaderControl).prevented,false);
 assert.equal(clickHeader(env,{matches:()=>true}).prevented,false);
 env.window.__PME_TRIAGE__.status=()=>({mode:'stock'});assert.equal(clickHeader(env,env.back).prevented,false);
 env.window.__PME_TRIAGE__.status=()=>({mode:'reply'});env.box.channel='COTHER';
 assert.equal(clickHeader(env,env.headerChildren[0]).prevented,true);assert.deepEqual(env.headerEvents,[]);env.api.dispose();
});
test('native header controls recover after Slack removes the injected button',async()=>{
 const env=setup({headerControls:true});await env.api.open({workspaceId:'TONE',channelId:'CONE'});
 env.headerChildren[0].remove();env.tick();assert.equal(env.headerChildren.length,1);env.api.dispose();assert.equal(env.headerChildren.length,0);
});
test('native reply frames the verified editor, preserves its draft and removes all layout changes',async()=>{
  const env=setup();assert.equal((await env.api.open({workspaceId:'TONE',channelId:'CONE'})).ok,true);
  assert.equal(env.api.status().ready,true);assert.equal(env.focused(),true);assert.equal(env.editor.textContent,'untouched user draft');assert.ok(env.attributes.has('data-pme-native-reply-pane'));
  assert.ok(env.composerAttributes.has('data-pme-native-composer'));
  env.api.suspend();assert.equal(env.api.status().active,false);assert.equal(env.attributes.size,0);assert.equal(env.bodyAttributes.size,0);assert.equal(env.editor.textContent,'untouched user draft');
  assert.equal(env.composerAttributes.size,0);
  assert.equal(JSON.stringify([...env.storage.values()]).includes('untouched user draft'),false);
  env.api.dispose();assert.equal(env.removed(),true);
});

test('linked message navigation uses Slack’s exact jump callback instead of jumping to latest',async()=>{
  const env=setup({nativeCallbacks:true});
  await env.api.open({workspaceId:'TONE',channelId:'CONE',messageTs:'100.000001'},{preservePosition:true});
  assert.equal(env.api.status().ready,true);assert.equal(env.native.messageJump,'100.000001');assert.equal(env.native.latestJumps,0);
  assert.equal(env.api.status().scrollMethod,'native-message');env.api.dispose();
});
test('replayed native links preserve position and cancelled requests never activate their link',async()=>{
  const env=setup({nativeCallbacks:true});let clicks=0;
  const request={workspaceId:'TONE',channelId:'CONE'};
  const options={nativeNavigate:()=>clicks++,preservePosition:true,focusEditor:false};
  const pending=env.api.open(request,options);env.api.suspend();assert.equal((await pending).cancelled,true);assert.equal(clicks,0);
  assert.equal((await env.api.open(request,options)).ok,true);assert.equal(clicks,1);assert.equal(env.native.latestJumps,0);assert.equal(env.focused(),false);env.api.dispose();
});
test('a replaced Command-K result recovers through native conversation navigation without reopening the pane',async()=>{
  const env=setup();let attempts=0;
  const result=await env.api.open({workspaceId:'TTWO',channelId:'CTWO'},{nativeNavigate:()=>{attempts++;return false;},preservePosition:true});
  assert.equal(result.ok,true);assert.equal(attempts,1);assert.equal(env.native.switches,1);assert.equal(env.native.selects,1);
  assert.equal(env.api.status().ready,true);assert.equal(env.api.status().target.channelId,'CTWO');
  assert.equal(env.editor.textContent,'untouched user draft');assert.deepEqual(env.navigations,[]);env.api.dispose();
});
test('Command-K can mount a verified DM in Slack’s DMs hub without a channel URL',async()=>{
  const env=setup();env.box.channel='DONE';
  const result=await env.api.open({workspaceId:'TONE',channelId:'DONE'},{nativeNavigate:()=>{env.location.pathname='/client/TONE/dms';},preservePosition:true});
  assert.equal(result.ok,true);assert.equal(env.api.status().ready,true);assert.equal(env.focused(),true);
  assert.ok(env.attributes.has('data-pme-native-reply-pane'));assert.equal(env.native.selects,0);
  env.tick();assert.equal(env.api.status().ready,true);
  env.box.channel='DOTHER';env.tick();assert.equal(env.api.status().ready,false);
  assert.equal(env.api.status().state,'error');assert.equal(env.attributes.has('data-pme-native-reply-pane'),false);env.api.dispose();
});
test('DMs hub readiness requires the matching workspace and an unambiguous mounted input',async()=>{
  for(const mismatch of ['workspace','route','channel','duplicate']){
    const env=setup();env.box.channel='DONE';
    const queries=env.document.querySelectorAll;
    const result=await env.api.open({workspaceId:'TONE',channelId:'DONE'},{nativeNavigate:()=>{
      env.location.pathname='/client/TONE/dms';
      if(mismatch==='workspace')env.native.team='TTWO';
      if(mismatch==='route')env.location.pathname='/client/TTWO/dms';
      if(mismatch==='channel')env.box.channel='DOTHER';
      if(mismatch==='duplicate')env.document.querySelectorAll=s=>s==='[data-qa="message_input"][data-channel-id]'?[env.box,env.box]:queries(s);
      // Advance past the deadline on the first wait after validating the pane.
      setTimeout(()=>env.advance(11000),10);
    }});
    assert.equal(result.ok,false,mismatch);assert.equal(env.api.status().ready,false,mismatch);
    assert.equal(env.attributes.has('data-pme-native-reply-pane'),false,mismatch);assert.equal(env.focused(),false,mismatch);env.api.dispose();
  }
});
test('message focus preserves drafts and removes only its own temporary tabindex when suspended',async()=>{
  const env=setup();await env.api.open({workspaceId:'TONE',channelId:'CONE'});
  assert.equal(env.api.focusMessages(),true);assert.equal(env.attributes.get('tabindex'),'-1');assert.equal(env.editor.textContent,'untouched user draft');
  env.setAuxiliary('profile');env.tick();assert.equal(env.attributes.has('data-pme-native-reply-pane'),false);
  env.api.suspend();assert.equal(env.attributes.has('tabindex'),false);assert.equal(env.api.focusMessages(),false);env.api.dispose();
});
test('composer interaction does not authorize adopting a changed native destination',async()=>{
  const env=setup();await env.api.open({workspaceId:'TONE',channelId:'CONE'});
  env.listeners.get('click')({type:'click',isTrusted:true,target:env.editor});
  // The editor is deliberately excluded from navigation intent.
  env.location.pathname='/client/TONE/COTHER';env.tick();assert.equal(env.events.includes('pme-native-fallback'),false);env.api.dispose();
});
test('an unsupported user-initiated native view hands off only after allowing time to mount',async()=>{
  const env=setup();await env.api.open({workspaceId:'TONE',channelId:'CONE'});
  env.listeners.get('click')({type:'click',isTrusted:true,target:env.nativeLinkButton});
  env.location.pathname='/client/TONE/COTHER';env.tick();assert.equal(env.events.includes('pme-native-fallback'),false);
  env.advance(1600);env.tick();assert.equal(env.events.includes('pme-native-fallback'),true);assert.equal(env.api.status().ready,false);
  env.api.dispose();
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

test('native back waits for the originating click to finish and cancelled navigation cannot close its thread',async()=>{
  const env=setup({thread:'100.000001',returningThread:true});
  const pending=env.api.open({workspaceId:'TONE',channelId:'CONE'});
  assert.equal(env.native.threadCloses,0);env.api.suspend();
  assert.equal((await pending).cancelled,true);assert.equal(env.native.threadCloses,0);
  assert.equal(env.box.thread,'100.000001');env.api.dispose();
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
  e.api.confirmSend(attempt.id,'100.000002');assert.ok(e.events.includes('pme-native-send-confirmed'));e.tick();assert.equal(e.events.includes('pme-native-quick-sent'),false);e.advance(1101);e.tick();assert.equal(e.events.includes('pme-native-quick-sent'),!newDraft);assert.equal(e.readButton.clicks,newDraft?0:1);
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


test('conversation menu delegates to current native controls, uses pressed mute state and restores originals',async()=>{
 const env=setup({headerControls:true,menuControls:true});await env.api.open({workspaceId:'TONE',channelId:'CONE'});
 assert.equal(env.headerChildren.length,2);assert.ok(env.controls.every(n=>n.hasAttribute('data-pme-menu-native')));
 clickHeader(env,env.headerChildren[0]);let menu=env.bodyChildren[0];assert.equal(env.api.overlayOpen(),true);
 assert.deepEqual(menu.children.map(n=>n.textContent),['Huddle…','Search this conversation…','Mute conversation']);
 const old=env.controls[0];env.controls[0]={...old,clicks:0};menu.children[0].handlers.get('click')();
 assert.equal(old.clicks,0);assert.equal(env.controls[0].clicks,1);assert.equal(env.api.overlayOpen(),false);
 env.controls[2].setAttribute('aria-pressed','true');clickHeader(env,env.headerChildren[0]);menu=env.bodyChildren[0];assert.equal(menu.children[2].textContent,'Unmute conversation');
 env.box.channel='COTHER';menu.children[2].handlers.get('click')();assert.equal(env.controls[2].clicks,0);
 env.api.suspend();assert.equal(env.bodyChildren.length,0);assert.equal(env.headerChildren.length,0);assert.ok(env.controls.every(n=>!n.hasAttribute('data-pme-menu-native')));env.api.dispose();
});
test('native profile and search replace the editor, restore it without moving scroll and never authorize sending',async()=>{
 for(const kind of ['profile','search']){
  const env=setup({nativeCallbacks:true});await env.api.open({workspaceId:'TONE',channelId:'CONE'});
  env.setAuxiliary(kind);env.tick();assert.equal(env.api.status().auxiliary,kind);assert.equal(env.api.status().ready,true);
  assert.equal(env.attributes.has('data-pme-native-reply-pane'),false);assert.equal(env.auxAttributes.get('data-pme-native-auxiliary'),kind);
  assert.equal(env.api.focus(),false);assert.equal(env.api.jumpToLatest().ok,false);
  env.setAuxiliary(null);env.tick();assert.equal(env.api.status().auxiliary,null);assert.equal(env.api.status().ready,true);assert.equal(env.native.latestJumps,1);assert.equal(env.auxAttributes.size,0);
  env.setAuxiliary(kind);env.tick();let blocked=false;
  env.listeners.get('keydown')({type:'keydown',key:'Enter',target:{closest:()=>({})},preventDefault(){blocked=true;},stopImmediatePropagation(){}});
  assert.equal(blocked,true);assert.equal(env.api.status().state,'error');assert.equal(env.auxAttributes.size,0);env.api.dispose();
 }
});


test('native full search requests a first-class search pane instead of full Slack',async()=>{
 const env=setup({headerControls:true,menuControls:true});await env.api.open({workspaceId:'TONE',channelId:'CONE'});
 env.setAuxiliary('full search');env.location.pathname='/client/TONE/search';env.tick();
 assert.deepEqual(env.headerEvents,[]);assert.ok(env.events.includes('pme-native-search-open'));
 env.api.suspend();assert.equal(env.attributes.size,0);assert.equal(env.auxAttributes.size,0);assert.equal(env.headerChildren.length,0);env.api.dispose();
});


test('returning from a thread closes it before any redundant parent sidebar navigation',async()=>{
 const env=setup({thread:'100.000001',returningThread:true});
 await env.api.open({workspaceId:'TONE',channelId:'CONE',threadTs:'100.000001'});
 assert.equal((await env.api.open({workspaceId:'TONE',channelId:'CONE'})).ok,true);
 assert.equal(env.native.threadCloses,1);assert.equal(env.native.selects,0);assert.equal(env.box.thread,null);assert.equal(env.api.status().ready,true);env.api.dispose();
});


test('notifications-only app conversations frame native content without requiring or authorizing a composer',async()=>{
 const env=setup({notificationOnly:true,nativeCallbacks:true,headerControls:true,menuControls:true});
 assert.equal((await env.api.open({workspaceId:'TONE',channelId:'CONE'})).ok,true);
 assert.equal(env.api.status().ready,true);assert.equal(env.api.status().readOnly,true);assert.equal(env.focused(),false);assert.equal(env.api.focus(),false);assert.equal(env.composerAttributes.size,0);
 assert.equal(env.api.jumpToLatest().ok,true);clickHeader(env,env.headerChildren[0]);assert.equal(env.api.overlayOpen(),true);
 env.bodyChildren[0].children[1].handlers.get('click')();assert.equal(env.controls[1].clicks,1);
 clickHeader(env,env.headerChildren.at(-1));assert.deepEqual(env.headerEvents,['stock']);
 let blocked=false;env.listeners.get('keydown')({type:'keydown',key:'Enter',target:{closest:()=>({})},preventDefault(){blocked=true;},stopImmediatePropagation(){}});
 assert.equal(blocked,true);assert.equal(env.api.status().state,'error');env.api.dispose();
});
test('notifications-only content must keep matching the workspace, channel and native list identity',async()=>{
 for(const change of [e=>e.native.team='TOTHER',e=>e.location.pathname='/client/TONE/COTHER',e=>e.callbacks.channelId='COTHER',e=>e.callbacks.teamId='TOTHER']){
  const env=setup({notificationOnly:true,nativeCallbacks:true});await env.api.open({workspaceId:'TONE',channelId:'CONE'});
  change(env);assert.equal(env.api.status().ready,false);env.tick();assert.equal(env.api.status().state,'error');assert.equal(env.attributes.size,0);env.api.dispose();
 }
});
test('opening a normal editor after read-only app content restores normal composer verification',async()=>{
 const env=setup({notificationOnly:true,nativeCallbacks:true});await env.api.open({workspaceId:'TONE',channelId:'CONE'});
 env.setNotificationOnly(false);await env.api.open({workspaceId:'TONE',channelId:'CONE'});
 assert.equal(env.api.status().ready,true);assert.equal(env.api.status().readOnly,false);assert.equal(env.focused(),true);assert.ok(env.composerAttributes.has('data-pme-native-composer'));
 env.api.suspend();assert.equal(env.attributes.size,0);env.api.dispose();
});

test('search is an independent read-only destination that frames only its own workspace and never sends',async()=>{
 const env=setup();env.setAuxiliary('full search');env.location.pathname='/client/TONE/search';
 const opened=await env.api.open({kind:'search',workspaceId:'TONE'},{preservePosition:true});assert.equal(opened.ok,true);
 assert.equal(env.api.status().target.kind,'search');assert.equal(env.api.status().readOnly,true);assert.equal(env.api.status().ready,true);assert.equal(env.api.status().auxiliary,null);
 assert.equal(env.api.jumpToLatest().ok,false);assert.equal(env.api.markReadNative().ok,false);assert.equal(env.native.selects,0);assert.equal(env.native.composeClicks,0);
 env.tick();assert.equal(env.api.status().ready,true);assert.deepEqual(env.headerEvents,[]);
 assert.equal((await env.api.open({kind:'search',workspaceId:'TONE',channelId:'CONE'})).ok,false);
 env.native.team='TTWO';assert.equal(env.api.status().ready,false);env.api.dispose();assert.equal(env.auxAttributes.size,0);
});
test('a search pane cannot authorize a native send even if a composer appears beneath it',async()=>{
 const env=setup();env.setAuxiliary('full search');env.location.pathname='/client/TONE/search';await env.api.open({kind:'search',workspaceId:'TONE'});
 let prevented=false;env.listeners.get('keydown')({type:'keydown',key:'Enter',target:{closest:s=>s==='[data-qa="message_input"]'?{}:null},preventDefault(){prevented=true;},stopImmediatePropagation(){}});
 assert.equal(prevented,true);assert.equal(env.api.status().ready,false);env.api.dispose();
});


test('native unread actions use the exact mounted conversation or thread and preserve drafts',async()=>{
 const dm=setup({nativeCallbacks:true});assert.equal(dm.api.markUnreadNative().ok,false);await dm.api.open({workspaceId:'TONE',channelId:'CONE'});
 assert.equal(dm.api.markUnreadNative().ok,true);assert.deepEqual(JSON.parse(JSON.stringify(dm.native.unreadMessage)),{channel:'CONE',ts:'100.000002'});assert.equal(dm.editor.textContent,'untouched user draft');
 dm.native.team='TTWO';assert.equal(dm.api.markUnreadNative().ok,false);dm.api.dispose();
 const t=setup({thread:'100.000001',nativeCallbacks:true});await t.api.open({workspaceId:'TONE',channelId:'CONE',threadTs:'100.000001'});
 assert.equal(t.api.markUnreadNative().ok,true);assert.equal(t.native.unreadThread,t.callbacks.messages['200.000001']);assert.equal(t.native.unreadMessage,undefined);
 assert.equal(t.api.markReadNative().ok,true);assert.equal(t.native.threadReads,1);assert.equal(t.readButton.clicks,0);t.api.dispose();
});
test('unread rejects missing actions, mismatched workspaces, and wrong-thread or root messages without a broader fallback',async()=>{
 for(const options of [{nativeCallbacks:false},{nativeCallbacks:true,callbackTeam:'TTWO'}]){
  const e=setup(options);await e.api.open({workspaceId:'TONE',channelId:'CONE'});assert.equal(e.api.markUnreadNative().ok,false);assert.equal(e.native.unreadMessage,undefined);e.api.dispose();
 }
 const t=setup({thread:'100.000001',nativeCallbacks:true});await t.api.open({workspaceId:'TONE',channelId:'CONE',threadTs:'100.000001'});
 t.callbacks.messages['200.000001'].thread_ts='100.000003';assert.equal(t.api.markUnreadNative().ok,false);
 t.callbacks.latest='100.000001';t.callbacks.messages['100.000001']={ts:'100.000001',thread_ts:'100.000001'};assert.equal(t.api.markUnreadNative().error,'no-reply');
 t.callbacks.threadTs='100.000003';assert.equal(t.api.markReadNative().ok,false);assert.equal(t.native.unreadThread,undefined);t.api.dispose();
});


test('channel read falls back to the banner action without clearing separate threads or accepting wrong-workspace callbacks',async()=>{
 for(const team of ['TONE','TTWO']){
  const e=setup({nativeCallbacks:true,callbackTeam:team});e.readButton.hidden=true;await e.api.open({workspaceId:'TONE',channelId:'CONE'});
  assert.equal(e.api.markReadNative().ok,team==='TONE');assert.equal(e.native.readConversation?.channelId,team==='TONE'?'CONE':undefined);assert.equal(e.native.threadReads,undefined);e.api.dispose();
 }
});


test('closing a profile defers its native Back activation, preserving the destination and draft',async()=>{
 const e=setup({nativeCallbacks:true});await e.api.open({workspaceId:'TONE',channelId:'CONE'});e.setAuxiliary('profile');e.tick();
 let originalClick=true,closes=0;e.auxView.querySelector=()=>({click(){if(originalClick)return;closes++;e.setAuxiliary(null);}});
 assert.equal(e.api.closeAuxiliary(),true);assert.equal(closes,0);originalClick=false;
 await new Promise(r=>setTimeout(r,130));assert.equal(closes,1);assert.equal(e.api.status().ready,true);assert.equal(e.api.status().auxiliary,null);assert.equal(e.editor.textContent,'untouched user draft');e.api.dispose();
});
test('cancelling a deferred profile close cannot act on the native pane afterward',async()=>{
 const e=setup();await e.api.open({workspaceId:'TONE',channelId:'CONE'});e.setAuxiliary('profile');e.tick();let closes=0;e.auxView.querySelector=()=>({click(){closes++;}});
 e.api.closeAuxiliary();e.api.suspend();await new Promise(r=>setTimeout(r,20));assert.equal(closes,0);assert.equal(e.api.status().active,false);e.api.dispose();
});

test('Activity is a verified read-only pane and parking leaves drafts and the reopen destination intact',async()=>{
 const env=setup();await env.api.open({workspaceId:'TONE',channelId:'CONE'});
 const before=env.editor.textContent,query=env.document.querySelector;
 let detail=true;
 const activityView={isConnected:true,setAttribute(){},removeAttribute(){},querySelector:()=>null};
 env.document.querySelector=s=>s==='[data-qa="tab_rail_activity_button"]'?{click(){env.location.pathname='/client/TONE/activity-inbox';}}:
  s.startsWith('.p-view_contents--primary')&&detail?{click(){detail=false;}}:
  s==='[data-qa="activity-inbox-sidebar-header-title"]'?{closest:()=>activityView}:
  s==='[data-qa="message_input"],[data-qa="message_pane"],[data-qa="threads_flexpane"],[data-qa="composer_page"]'?(detail?env.editor:null):query(s);
 assert.equal((await env.api.park()).ok,true);assert.equal(env.api.status().active,false);assert.equal(env.api.status().target.channelId,'CONE');
 assert.equal((await env.api.open({kind:'activity',workspaceId:'TONE'},{focusEditor:false})).ok,true);
 assert.equal(env.api.status().ready,true);assert.equal(env.api.status().readOnly,true);assert.equal(env.api.markReadNative().ok,false);assert.equal(env.api.markUnreadNative().ok,false);
 assert.equal(env.editor.textContent,before);env.api.dispose();
});


test('normal thread replies mark read only after server confirmation and keep the pane open',async()=>{
 const e=setup({thread:'100.000001',nativeCallbacks:true});
 await e.api.open({workspaceId:'TONE',channelId:'CONE',threadTs:'100.000001'});
 let attempt;e.window.__pmeTriageAction=raw=>{attempt=JSON.parse(raw);};
 e.listeners.get('click')({type:'click',target:{closest:()=>({})}});
 assert.equal(attempt.action,'native-send-attempt');assert.equal(e.native.threadReads,undefined);
 e.api.confirmSend('other-attempt','100.000002');assert.equal(e.native.threadReads,undefined);
 const query=e.pane.querySelectorAll;
 e.pane.querySelectorAll=selector=>selector==='[data-qa="message_container"][data-msg-ts]'?[]:query(selector);
 e.editor.textContent='Keep this next draft';
 e.api.confirmSend(attempt.id,'100.000002');assert.equal(e.native.threadReads,undefined);
 e.pane.querySelectorAll=query;e.tick();assert.equal(e.native.threadReads,1);
 assert.equal(e.editor.textContent,'Keep this next draft');
 assert.ok(e.events.includes('pme-native-send-confirmed'));e.advance(2000);e.tick();
 assert.equal(e.events.includes('pme-native-quick-sent'),false);assert.equal(e.api.status().ready,true);
 e.api.dispose();
});
