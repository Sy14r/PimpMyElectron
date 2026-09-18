import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createRuntime} from '../src/live-runtime.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
class FakeCDP extends EventEmitter {
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
  const sessions=new Map(entries.map(e=>[e.targetId,e]));const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-test-'));t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true}));const runtime=await createRuntime({cdp,sessions,root,runtimeDir});
  t.after(()=>runtime.dispose());for(const e of entries)await runtime.attach(e);
  const event=(method,params,sessionId='s1')=>cdp.emit('event',{method,params,sessionId});
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
  await runtime.dispose();assert.equal(cdp.listenerCount('event'),0);assert.equal(runtime.status().messages,0);
  assert.equal(cdp.commands.filter(c=>c.method==='Page.removeScriptToEvaluateOnNewDocument').length,10);
});

test('cache snapshots hydrate authorized background workspaces and reject stale renderer attribution without API calls',async t=>{
  const cdp=new FakeCDP(),entry={targetId:'one',sessionId:'s1',url:'https://app.slack.com/client/TONE/CONE'},sessions=new Map([['one',entry]]);
  const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'cache-runtime-'));const runtime=await createRuntime({cdp,sessions,root,runtimeDir});
  t.after(async()=>{await runtime.dispose();await fs.rm(runtimeDir,{recursive:true,force:true});});await runtime.attach(entry);
  const snapshot={rendererWorkspaceId:'TONE',workspaceId:'TTWO',knownWorkspaces:[{id:'TONE',name:'One'},{id:'TTWO',name:'Two'}],channels:[{id:'DTWO',is_im:true,has_unreads:true}],messages:[{channel:'DTWO',ts:'100.000001',text:'cached background'}]};
  const emit=r=>cdp.emit('event',{sessionId:'s1',method:'Runtime.bindingCalled',params:{name:'__pmeClientState',payload:JSON.stringify(r)}});
  emit(snapshot);assert.equal(runtime.status().clientStateSnapshots,1);assert.equal(runtime.status().messages,1);
  emit({...snapshot,rendererWorkspaceId:'TTWO'});emit({...snapshot,workspaceId:'TUNKNOWN',knownWorkspaces:[]});
  assert.equal(runtime.status().clientStateSnapshots,1);assert.equal(runtime.status().messages,1);
  assert.equal(cdp.evaluations.some(e=>e.expression.startsWith('window.__PME_READS__?.activity(')),false);
  assert.equal(runtime.status().customApi.requests,0);
});
