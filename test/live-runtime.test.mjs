import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import net from 'node:net';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createRuntime} from '../src/live-runtime.mjs';
import {createContextGuard} from '../src/context-guard.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
class FakeCDP extends EventEmitter {
  constructor() {
    super(); this.contextGuard=createContextGuard(this);
    for(const [sessionId,team] of [['s1','TONE'],['s2','TTWO']]) {
      this.contextGuard.frame(sessionId,{id:sessionId+'-frame',loaderId:'initial',url:`https://app.slack.com/client/${team}/CONE`});
      this.emit('event',{sessionId,method:'Runtime.executionContextCreated',params:{context:{id:1,uniqueId:sessionId+'-context',origin:'https://app.slack.com',auxData:{isDefault:true,frameId:sessionId+'-frame'}}}});
    }
  }
  commands=[]; evaluations=[]; captures=new Map();
  async send(method,params,sessionId){this.commands.push({method,params,sessionId});return method==='Page.addScriptToEvaluateOnNewDocument'?{identifier:'script-'+sessionId}:{};}
  async evaluate(expression,sessionId){
    this.evaluations.push({expression,sessionId});
    if(expression.startsWith('!!window'))return true;
    if(expression.includes('slackPage:'))return {slackPage:true,dom:true,sessionConfig:true,windowBridge:true,assets:['/bundle.js']};
    if(expression.startsWith('if(location.origin')) {
      const captures=this.captures;
      vm.runInNewContext(expression,{location:{origin:'https://app.slack.com',pathname:`/client/${sessionId==='s1'?'TONE':'TTWO'}/CONE`},window:{__PME_TRIAGE__:{update:snapshot=>captures.set(sessionId,snapshot)}}});
    }
  }
}
test('passive runtime scopes snapshots, ignores write responses, and cleans up',async t=>{
  const cdp=new FakeCDP();
  const entries=[{targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},{targetId:'two',sessionId:'s2',url:'https://app.slack.com/client/TTWO/CONE'}];
  const sessions=new Map(entries.map(e=>[e.targetId,e]));const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-test-'));t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true}));const runtime=await createRuntime({cdp,contextGuard:cdp.contextGuard,sessions,root,runtimeDir});
  t.after(()=>runtime.dispose());for(const e of entries)await runtime.attach(e);
  const event=(method,params,sessionId='s1')=>cdp.emit('event',{method,params:{executionContextId:1,...params},sessionId});
  for(const [i,e] of entries.entries()) event('Runtime.bindingCalled',{name:'__pmeReadOnlySnapshot',payload:JSON.stringify({workspaceId:i?'TTWO':'TONE',knownWorkspaces:[{id:'TONE',name:'One'},{id:'TTWO',name:'Two'}],channelId:'CONE',messages:[{ts:'100.000001',text:i?'two-private':'one-private'}]})},e.sessionId);
  event('Runtime.bindingCalled',{name:'__pmeReadOnlySnapshot',payload:JSON.stringify({workspaceId:'TTWO',channelId:'CONE',messages:[{ts:'100.000002',text:'spoof'}]})});
  event('Network.requestWillBeSent',{requestId:'write',request:{url:'https://app.slack.com/api/chat.postMessage',postData:'token=SECRET&text=hello'}});
  event('Network.loadingFinished',{requestId:'write',encodedDataLength:10});
  // Background-team counts can omit a team field; never infer their ownership
  // from the currently visible workspace.
  event('Network.requestWillBeSent',{requestId:'ambiguous',request:{url:'https://app.slack.com/api/client.counts',postData:'token=SECRET'}});
  event('Network.loadingFinished',{requestId:'ambiguous',encodedDataLength:10});
  event('Network.webSocketFrameReceived',{response:{opcode:1,payloadData:JSON.stringify({type:'message',team:'TONE',channel:'CONE',ts:'100.000003',text:'live-one'})}});
  event('Network.webSocketFrameReceived',{response:{opcode:1,payloadData:JSON.stringify({type:'message',team:'TTWO',channel:'CONE',ts:'100.000005',text:'background-two'})}});
  event('Network.webSocketFrameReceived',{response:{opcode:1,payloadData:JSON.stringify({type:'message',team:'TUNKNOWN',channel:'CONE',ts:'100.000006',text:'untrusted-team'})}});
  event('Network.webSocketFrameReceived',{response:{opcode:1,payloadData:JSON.stringify({type:'message',channel:'CONE',ts:'100.000007',text:'ambiguous-event'})}});
  for(const target of ['*','TTWO','TONE'])event('Runtime.bindingCalled',{name:'__pmeTriageAction',payload:JSON.stringify({workspaceId:target==='*'?'TONE':target==='TTWO'?'TONE':'TTWO',action:'switch',target})});
  event('Runtime.bindingCalled',{name:'__pmeTriageAction',payload:JSON.stringify({workspaceId:'TTWO',action:'switch',target:'TTWO'})},'s2');
  for(const online of [false,true])event('Runtime.bindingCalled',{name:'__pmeShellState',payload:JSON.stringify({workspaceId:'TONE',online,resumed:true})});
  event('Network.webSocketFrameReceived',{response:{opcode:1,payloadData:JSON.stringify({type:'hello'})}});
  await new Promise(resolve=>setTimeout(resolve,1600));
  assert.equal(cdp.evaluations.filter(e=>e.expression.startsWith('window.__PME_READS__?.activity(')).length,0);
  assert.equal(runtime.status().apiPolicy,'manual-only');assert.equal(runtime.status().customApi.requests,0);

  assert.equal(cdp.captures.get('s1').workspaces.length,1);assert.equal(cdp.captures.get('s1').workspaces[0].id,'TONE');
  assert.equal(cdp.captures.get('s2').workspaces[0].id,'TTWO');
  assert.equal(JSON.stringify(cdp.captures.get('s1')).includes('two-private'),false);
  assert.equal(JSON.stringify(cdp.captures.get('s2')).includes('spoof'),false);
  assert.equal(cdp.captures.get('s1').workspaces[0].items[0].messages.length,2);
  assert.equal(cdp.captures.get('s2').workspaces[0].items[0].messages.some(m=>m.text==='background-two'),true);
  assert.equal(JSON.stringify(cdp.captures.get('s1')).includes('background-two'),false);
  assert.equal(cdp.commands.some(c=>c.method==='Network.getResponseBody'),false);
  assert.equal(cdp.commands.every(c=>['Network.enable','Runtime.addBinding','Page.addScriptToEvaluateOnNewDocument'].includes(c.method)),true);
  event('Runtime.bindingCalled',{name:'__pmeApiMetric',payload:JSON.stringify({adapter:'read',method:'client.counts',event:'request',token:'MUST NOT RETAIN'})});
  event('Runtime.bindingCalled',{name:'__pmeApiMetric',payload:JSON.stringify({adapter:'read',method:'unknown',event:'request'})});
  assert.deepEqual(runtime.status().customApi.methods,{'client.counts':1});
  assert.equal(JSON.stringify(runtime.status()).includes('MUST NOT RETAIN'),false);
  event('Runtime.bindingCalled',{name:'__pmeTriageAction',payload:JSON.stringify({workspaceId:'TONE',action:'switch',target:'*'})});
  event('Runtime.bindingCalled',{name:'__pmeTriageAction',payload:JSON.stringify({workspaceId:'TONE',action:'activity'})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(cdp.evaluations.filter(e=>e.expression.startsWith('window.__PME_READS__?.activity(')).length,0);
  event('Runtime.bindingCalled',{name:'__pmeTriageAction',payload:JSON.stringify({workspaceId:'TONE',action:'switch',target:'TONE'})});
  event('Runtime.bindingCalled',{name:'__pmeTriageAction',payload:JSON.stringify({workspaceId:'TONE',action:'activity'})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(cdp.evaluations.filter(e=>e.expression.startsWith('window.__PME_READS__?.activity(')).length,1);
  event('Page.frameNavigated',{frame:{url:'https://example.test/client/TONE/CONE'}});
  event('Network.webSocketFrameReceived',{response:{opcode:1,payloadData:JSON.stringify({type:'message',channel:'CONE',ts:'100.000004',text:'bad-origin'})}});
  assert.equal(runtime.status().messages,4);
  await runtime.dispose();cdp.contextGuard.dispose();assert.equal(cdp.listenerCount('event'),0);assert.equal(runtime.status().messages,0);
  assert.equal(cdp.commands.filter(c=>c.method==='Page.removeScriptToEvaluateOnNewDocument').length,cdp.commands.filter(c=>c.method==='Page.addScriptToEvaluateOnNewDocument').length);
});

test('cache snapshots hydrate authorized background workspaces and reject stale renderer attribution without API calls',async t=>{
  const cdp=new FakeCDP(),entry={targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},sessions=new Map([['one',entry]]);
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'cache-runtime-'));const runtime=await createRuntime({cdp,contextGuard:cdp.contextGuard,sessions,root,runtimeDir});
  t.after(async()=>{await runtime.dispose();await fs.rm(runtimeDir,{recursive:true,force:true});});await runtime.attach(entry);
  const snapshot={rendererWorkspaceId:'TONE',workspaceId:'TTWO',knownWorkspaces:[{id:'TONE',name:'One'},{id:'TTWO',name:'Two'}],channels:[{id:'DTWO',is_im:true,has_unreads:true}],messages:[{channel:'DTWO',ts:'100.000001',text:'cached background'}]};
  const emit=r=>cdp.emit('event',{sessionId:'s1',method:'Runtime.bindingCalled',params:{executionContextId:1,name:'__pmeClientState',payload:JSON.stringify(r)}});
  for (const name of ['__pmeClientState','__pmeReadOnlySnapshot','__pmeShellState','__pmeTriageAction','__pmeLoadHistory','__pmeApiMetric']) {
    cdp.emit('event',{sessionId:'s1',method:'Runtime.bindingCalled',params:{executionContextId:99,name,payload:JSON.stringify(snapshot)}});
  }
  assert.equal(runtime.status().callbackSecurity.rejected,6);
  assert.equal(runtime.status().clientStateSnapshots,0);
  assert.equal(runtime.status().messages,0);
  assert.ok(cdp.commands.filter(c=>c.method==='Runtime.addBinding').every(c=>c.params.executionContextId===1));
  emit(snapshot);assert.equal(runtime.status().clientStateSnapshots,1);assert.equal(runtime.status().messages,1);
  emit({...snapshot,rendererWorkspaceId:'TTWO'});emit({...snapshot,workspaceId:'TUNKNOWN',knownWorkspaces:[]});
  assert.equal(runtime.status().clientStateSnapshots,1);assert.equal(runtime.status().messages,1);
  assert.equal(cdp.evaluations.some(e=>e.expression.startsWith('window.__PME_READS__?.activity(')),false);
  assert.equal(runtime.status().customApi.requests,0);
});
test('notifications and hover previews cover background workspaces while inbox message content stays scoped',async t=>{
  const cdp=new FakeCDP(),entry={targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},sessions=new Map([['one',entry]]);
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'preview-runtime-'));const runtime=await createRuntime({cdp,contextGuard:cdp.contextGuard,sessions,root,runtimeDir});
  t.after(async()=>{await runtime.dispose();await fs.rm(runtimeDir,{recursive:true,force:true});});await runtime.attach(entry);
  const emit=(name,value)=>cdp.emit('event',{sessionId:'s1',method:'Runtime.bindingCalled',params:{executionContextId:1,name,payload:JSON.stringify(value)}});
  emit('__pmeClientState',{rendererWorkspaceId:'TONE',workspaceId:'TTWO',knownWorkspaces:[{id:'TONE',name:'One'},{id:'TTWO',name:'Two'}],channels:[{id:'DTWO',is_im:true,has_unreads:true,last_read:'100.000001'}],messages:[{channel:'DTWO',ts:'100.000001',text:'old'},{channel:'DTWO',ts:'100.000002',text:'new'}]});
  await new Promise(r=>setTimeout(r,1600));
  const state=(extra={})=>new Promise((resolve,reject)=>{let data='';const socket=net.createConnection(path.join(runtimeDir,'shell.sock'));socket.on('connect',()=>socket.write(JSON.stringify({op:'state',...extra})+'\n'));socket.on('error',reject);socket.on('data',c=>data+=c);socket.on('end',()=>resolve(JSON.parse(data).result));});
  const captured=cdp.captures.get('s1');assert.equal(captured.selectedWorkspace,'TONE');
  assert.equal(captured.workspaces.some(w=>w.id==='TTWO'),false);
  assert.equal(captured.notificationWorkspaces.find(w=>w.id==='TTWO').items[0].unread,true);
  assert.equal(captured.notificationWorkspaces.find(w=>w.id==='TTWO').items[0].messages.length,0);
  assert.equal((await state()).attention,1);
  emit('__pmeShellState',{workspaceId:'TONE',mode:'strip',edgeStrip:{id:'123-1',edge:'left',bounds:{x:0,y:100,width:12,height:88}}});
  assert.equal((await state({edgeStripVersion:1})).edgeStrip.count,1);
  const preview={key:'TTWO:DTWO:',edge:'left',anchor:{x:4,y:100,width:32,height:32},text:'UNTRUSTED PREVIEW'};
  emit('__pmeShellState',{workspaceId:'TONE',mode:'cluster',preview});
  const shown=(await state()).preview;assert.equal(shown.label,'New message');assert.equal(shown.messages[0].text,'new');
  assert.equal(JSON.stringify(shown).includes('UNTRUSTED'),false);
  emit('__pmeShellState',{workspaceId:'TONE',mode:'queue',preview});assert.equal((await state()).preview,null);
  await state({op:'settings',patch:{notificationMode:'inbox'}});assert.equal((await state()).attention,0);
  emit('__pmeShellState',{workspaceId:'TONE',mode:'cluster',preview});assert.equal((await state()).preview,null);
  await state({op:'settings',patch:{notificationMode:'selected',notificationWorkspaces:['TTWO']}});assert.equal((await state()).attention,1);
  emit('__pmeShellState',{workspaceId:'TONE',mode:'cluster',preview});
  assert.equal((await state()).preview.messages[0].text,'new');
  await state({op:'settings',patch:{notificationMode:'selected',notificationWorkspaces:[]}});assert.equal((await state()).attention,0);assert.equal((await state()).preview,null);
  assert.equal(runtime.status().customApi.requests,0);
});

test('a new main document rebinds callbacks while calls from its old context are refused',async t=>{
  const cdp=new FakeCDP(),entry={targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},sessions=new Map([['one',entry]]);
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'navigation-runtime-'));
  const runtime=await createRuntime({cdp,contextGuard:cdp.contextGuard,sessions,root,runtimeDir});
  t.after(async()=>{await runtime.dispose();cdp.contextGuard.dispose();await fs.rm(runtimeDir,{recursive:true,force:true});});
  await runtime.attach(entry);
  const event=(method,params)=>cdp.emit('event',{sessionId:'s1',method,params});
  const callback=executionContextId=>event('Runtime.bindingCalled',{executionContextId,name:'__pmeApiMetric',payload:JSON.stringify({adapter:'read',method:'client.counts',event:'request'})});
  callback(1);assert.equal(runtime.status().customApi.requests,1);
  event('Page.frameNavigated',{frame:{id:'s1-frame',loaderId:'new-document',url:entry.url}});
  callback(1);assert.equal(runtime.status().customApi.requests,1);
  event('Runtime.executionContextCreated',{context:{id:2,uniqueId:'new-context',origin:'https://app.slack.com',auxData:{isDefault:true,frameId:'s1-frame'}}});
  await new Promise(r=>setTimeout(r,1600));
  assert.equal(cdp.commands.filter(c=>c.method==='Runtime.addBinding'&&c.params.executionContextId===2).length,6);
  callback(1);assert.equal(runtime.status().customApi.requests,1);
  callback(2);assert.equal(runtime.status().customApi.requests,2);
  assert.equal(runtime.status().callbackSecurity.rejected,2);
});

test('optimistic preview reads hide immediately, preserve raw unread state and roll back on failure',async t=>{
 const cdp=new FakeCDP(),entry={targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},sessions=new Map([['one',entry]]);
 const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'optimistic-read-'));
 const runtime=await createRuntime({cdp,contextGuard:cdp.contextGuard,sessions,root,runtimeDir});
 t.after(async()=>{await runtime.dispose();await fs.rm(runtimeDir,{recursive:true,force:true});});await runtime.attach(entry);
 let resolveRead;const evaluate=cdp.evaluate.bind(cdp);cdp.evaluate=(expression,id)=>expression.includes('__PME_TRIAGE__?.readFromPill(')?new Promise(r=>resolveRead=r):evaluate(expression,id);
 const emit=(name,value)=>cdp.emit('event',{sessionId:'s1',method:'Runtime.bindingCalled',params:{executionContextId:1,name,payload:JSON.stringify(value)}});
 emit('__pmeClientState',{rendererWorkspaceId:'TONE',workspaceId:'TONE',knownWorkspaces:[{id:'TONE',name:'One'}],channels:[{id:'CONE',has_unreads:true,last_read:'100.000001'}],messages:[{channel:'CONE',ts:'100.000002',text:'new'}]});
 await new Promise(r=>setTimeout(r,1600));
 const call=request=>new Promise((resolve,reject)=>{let data='';const socket=net.createConnection(path.join(runtimeDir,'shell.sock'));socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));socket.on('error',reject);socket.on('data',c=>data+=c);socket.on('end',()=>resolve(JSON.parse(data)));});
 const state=async()=> (await call({op:'state'})).result;
 const preview={key:'TONE:CONE:',edge:'left',anchor:{x:4,y:100,width:32,height:32}};
 emit('__pmeShellState',{workspaceId:'TONE',mode:'cluster',preview});assert.equal((await state()).attention,1);
 const action=await call({op:'preview-action',action:'read',key:preview.key});assert.equal(action.result.activate,false);
 assert.equal((await state()).attention,0);assert.equal((await state()).preview,null);
 // A late hover report must not reopen an optimistically dismissed item.
 emit('__pmeShellState',{workspaceId:'TONE',mode:'cluster',preview});assert.equal((await state()).preview,null);
 await new Promise(r=>setTimeout(r,1600));
 const observed=cdp.captures.get('s1').notificationWorkspaces[0].items[0];assert.equal(observed.unread,true);assert.equal(observed.pendingRead,true);
 resolveRead({ok:false});await new Promise(r=>setImmediate(r));assert.equal((await state()).attention,1);
 assert.equal(runtime.status().customApi.requests,0);
});

test('a confirmed native quick reply immediately suppresses its pill count without waiting for cache refresh',async t=>{
 const cdp=new FakeCDP(),entry={targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},sessions=new Map([['one',entry]]);
 const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'reply-dismiss-'));
 const runtime=await createRuntime({cdp,contextGuard:cdp.contextGuard,sessions,root,runtimeDir});
 t.after(async()=>{await runtime.dispose();await fs.rm(runtimeDir,{recursive:true,force:true});});await runtime.attach(entry);
 const emit=(method,params)=>cdp.emit('event',{sessionId:'s1',method,params:{executionContextId:1,...params}});
 const binding=(name,value)=>emit('Runtime.bindingCalled',{name,payload:JSON.stringify(value)});
 const cache={rendererWorkspaceId:'TONE',workspaceId:'TONE',knownWorkspaces:[{id:'TONE',name:'One'}],channels:[{id:'CONE',has_unreads:true,last_read:'100.000001'}],messages:[{channel:'CONE',ts:'100.000002',text:'new'}]};
 binding('__pmeClientState',cache);await new Promise(r=>setTimeout(r,1600));
 const call=request=>new Promise((resolve,reject)=>{let data='';const socket=net.createConnection(path.join(runtimeDir,'shell.sock'));socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));socket.on('error',reject);socket.on('data',c=>data+=c);socket.on('end',()=>resolve(JSON.parse(data)));});
 const state=async()=> (await call({op:'state'})).result;
 const key='TONE:CONE:';binding('__pmeShellState',{workspaceId:'TONE',mode:'cluster',preview:{key,edge:'left',anchor:{x:4,y:100,width:32,height:32}}});
 await call({op:'preview-action',action:'reply',key});binding('__pmeShellState',{workspaceId:'TONE',mode:'reply'});
 binding('__pmeTriageAction',{action:'quick-send-attempt',workspaceId:'TONE',key,id:'attempt-1'});
 assert.equal((await state()).attention,1);
 const send=cdp.send.bind(cdp);cdp.send=async(method,params,sessionId)=>method==='Network.getResponseBody'?{body:JSON.stringify({ok:true,channel:'CONE',ts:'100.000003',message:{team:'TONE'}})}:send(method,params,sessionId);
 emit('Network.requestWillBeSent',{requestId:'native-send',request:{url:'https://app.slack.com/api/chat.postMessage',postData:'channel=CONE'}});
 emit('Network.loadingFinished',{requestId:'native-send',encodedDataLength:100});await new Promise(r=>setImmediate(r));
 assert.equal((await state()).attention,0);assert.equal(runtime.status().quickSend.confirmed,1);
 assert.equal(cdp.captures.get('s1').notificationWorkspaces[0].items[0].unread,true);
 binding('__pmeClientState',{...cache,messages:[...cache.messages,{channel:'CONE',ts:'100.000004',text:'newer than reply'}]});await new Promise(r=>setTimeout(r,1600));
 assert.equal((await state()).attention,1);assert.equal(runtime.status().customApi.requests,0);
});

test('a normal thread send clears inbox and pill indicators only after success and newer activity returns',async t=>{
 const cdp=new FakeCDP(),entry={targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},sessions=new Map([['one',entry]]);
 const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'reply-dismiss-'));
 const runtime=await createRuntime({cdp,contextGuard:cdp.contextGuard,sessions,root,runtimeDir});
 t.after(async()=>{await runtime.dispose();await fs.rm(runtimeDir,{recursive:true,force:true});});await runtime.attach(entry);
 const emit=(method,params)=>cdp.emit('event',{sessionId:'s1',method,params:{executionContextId:1,...params}});
 const binding=(name,value)=>emit('Runtime.bindingCalled',{name,payload:JSON.stringify(value)});
 const cache={rendererWorkspaceId:'TONE',workspaceId:'TONE',knownWorkspaces:[{id:'TONE',name:'One'}],channels:[{id:'CONE',has_unreads:false,last_read:'100.000001'}],messages:[{channel:'CONE',ts:'100.000002',thread_ts:'100.000001',text:'new'}],threads:[{channel:'CONE',ts:'100.000001',last_read:'100.000001'}]};
 binding('__pmeClientState',cache);await new Promise(r=>setTimeout(r,1600));
 const call=request=>new Promise((resolve,reject)=>{let data='';const socket=net.createConnection(path.join(runtimeDir,'shell.sock'));socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));socket.on('error',reject);socket.on('data',c=>data+=c);socket.on('end',()=>resolve(JSON.parse(data)));});
 const state=async()=> (await call({op:'state'})).result;
 const key='TONE:CONE:100.000001';binding('__pmeShellState',{workspaceId:'TONE',mode:'reply'});
 binding('__pmeTriageAction',{action:'native-send-attempt',workspaceId:'TONE',key,id:'attempt-1'});
 assert.equal((await state()).attention,1);
 const send=cdp.send.bind(cdp);cdp.send=async(method,params,sessionId)=>method==='Network.getResponseBody'?{body:JSON.stringify({ok:true,channel:'CONE',ts:'100.000003',message:{team:'TONE',thread_ts:'100.000001'}})}:send(method,params,sessionId);
 emit('Network.requestWillBeSent',{requestId:'native-send',request:{url:'https://app.slack.com/api/chat.postMessage',postData:'channel=CONE&thread_ts=100.000001'}});
 emit('Network.loadingFinished',{requestId:'native-send',encodedDataLength:100});await new Promise(r=>setImmediate(r));
 assert.equal((await state()).attention,0);assert.equal(runtime.status().quickSend.confirmed,1);
 await new Promise(r=>setTimeout(r,1600));
 assert.equal(cdp.captures.get('s1').workspaces[0].items.find(i=>i.key===key).pendingRead,true);
 binding('__pmeClientState',{...cache,messages:[...cache.messages,{channel:'CONE',ts:'100.000004',thread_ts:'100.000001',text:'newer than reply'}]});await new Promise(r=>setTimeout(r,1600));
 assert.equal((await state()).attention,1);assert.equal(runtime.status().customApi.requests,0);
});

test('renderer-only Slack mods attach without triage bindings, network observation, or shell',async t=>{
 const cdp=new FakeCDP(),entry={targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},sessions=new Map([['one',entry]]);
 const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'quote-runtime-'));t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true}));
 await fs.writeFile(path.join(runtimeDir,'mods.json'),JSON.stringify({disabled:['sender-tints','state-observer','history-reader','mark-read','native-reply','triage-surface','message-polish','slack-appearance','custom-css','personal-emoji','sidebar-productivity','slack-layout']}));
 const runtime=await createRuntime({cdp,contextGuard:cdp.contextGuard,sessions,root,runtimeDir});t.after(()=>runtime.dispose());await runtime.attach(entry);
 assert.equal(runtime.status().mode,'renderer-only');assert.equal(runtime.status().mods.pages[0].modules['quote-reply'],'active');
 await runtime.configure('slack-quote-reply',{previewShortcut:false});assert.ok(cdp.evaluations.some(item=>item.expression.includes('__PME_QUOTE_REPLY__')&&item.expression.includes('"previewShortcut":false')));
 assert.equal(cdp.commands.some(c=>c.method.startsWith('Network.')||c.method==='Runtime.addBinding'),false);
 assert.equal(await fs.stat(path.join(runtimeDir,'shell.sock')).catch(()=>null),null);
});
test('layout-only runtime hosts Slack Companion settings and applies them live without triage observation',async t=>{
 const cdp=new FakeCDP(),entry={targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},sessions=new Map([['one',entry]]),runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'layout-runtime-'));t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true}));
 await fs.writeFile(path.join(runtimeDir,'mods.json'),JSON.stringify({disabled:['sender-tints','state-observer','history-reader','mark-read','native-reply','triage-surface','quote-reply','message-polish','slack-appearance','custom-css','personal-emoji','sidebar-productivity']}));
 const runtime=await createRuntime({cdp,contextGuard:cdp.contextGuard,sessions,root,runtimeDir});await runtime.attach(entry);assert.equal(runtime.status().mode,'renderer-only');assert.equal(runtime.status().companion,true);assert.ok(await fs.stat(path.join(runtimeDir,'shell.sock')));
 await new Promise((resolve,reject)=>{const socket=net.createConnection(path.join(runtimeDir,'shell.sock')),chunks=[];socket.setEncoding('utf8');socket.on('connect',()=>socket.write(JSON.stringify({op:'settings',modId:'slack-layout',patch:{railHome:true,sidebarMode:'auto-hide'}})+'\n'));socket.on('data',chunk=>chunks.push(chunk));socket.on('end',()=>{try{const response=JSON.parse(chunks.join(''));assert.equal(response.ok,true);assert.equal(response.result.modSettings['slack-layout'].railHome,true);resolve();}catch(error){reject(error);}});socket.on('error',reject);});
 assert.ok(cdp.evaluations.some(item=>item.expression.includes('__PME_SLACK_LAYOUT__')&&item.expression.includes('"railHome":true')));assert.equal(cdp.commands.some(item=>item.method.startsWith('Network.')||item.method==='Runtime.addBinding'),false);
 await runtime.dispose();assert.equal(await fs.stat(path.join(runtimeDir,'shell.sock')).catch(()=>null),null);
});
test('appearance-only runtime applies settings live without starting Slack Companion or observation',async t=>{
 const cdp=new FakeCDP(),entry={targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},sessions=new Map([['one',entry]]),runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'appearance-runtime-'));t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true}));
 await fs.writeFile(path.join(runtimeDir,'mods.json'),JSON.stringify({disabled:['sender-tints','state-observer','history-reader','mark-read','native-reply','triage-surface','quote-reply','message-polish','custom-css','personal-emoji','sidebar-productivity','slack-layout']}));
 const runtime=await createRuntime({cdp,contextGuard:cdp.contextGuard,sessions,root,runtimeDir});t.after(()=>runtime.dispose());await runtime.attach(entry);
 assert.equal(runtime.status().mode,'renderer-only');assert.equal(runtime.status().companion,false);assert.equal(runtime.status().mods.pages[0].modules['slack-appearance'],'active');assert.equal(await fs.stat(path.join(runtimeDir,'shell.sock')).catch(()=>null),null);
 await runtime.configure('slack-appearance',{preset:'custom',systemNavigation:'#010203',selectedItems:'#112233',presenceIndication:'#445566',notifications:'#778899'});
 assert.ok(cdp.evaluations.some(item=>item.expression.includes('__PME_SLACK_APPEARANCE__')&&item.expression.includes('"systemNavigation":"#010203"')));assert.equal(cdp.commands.some(item=>item.method.startsWith('Network.')||item.method==='Runtime.addBinding'),false);
});
test('Sidebar Productivity alone stays renderer-only and adds no host binding, network observation, or companion',async t=>{
 const cdp=new FakeCDP(),entry={targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},sessions=new Map([['one',entry]]),runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'sidebar-productivity-runtime-'));t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true}));
 await fs.writeFile(path.join(runtimeDir,'mods.json'),JSON.stringify({disabled:['sender-tints','history-reader','mark-read','native-reply','triage-surface','quote-reply','message-polish','slack-appearance','custom-css','personal-emoji','slack-layout']}));
 const runtime=await createRuntime({cdp,contextGuard:cdp.contextGuard,sessions,root,runtimeDir});t.after(()=>runtime.dispose());await runtime.attach(entry);const status=runtime.status();assert.equal(status.mode,'renderer-only');assert.equal(status.companion,false);assert.equal(status.mods.pages[0].modules['state-observer'],'active');assert.equal(status.mods.pages[0].modules['sidebar-productivity'],'active');assert.equal(await fs.stat(path.join(runtimeDir,'shell.sock')).catch(()=>null),null);
 await runtime.configure('slack-sidebar-productivity',{hoverDelay:700,replyAction:false});assert.ok(cdp.evaluations.some(item=>item.expression.includes('__PME_SIDEBAR_PRODUCTIVITY__')&&item.expression.includes('"hoverDelay":700')&&item.expression.includes('"replyAction":false')));assert.equal(cdp.commands.some(item=>item.method.startsWith('Network.')||item.method==='Runtime.addBinding'),false);
});
