import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../src/renderer/read-api.js',import.meta.url),'utf8');
function setup(respond,{teams={TONE:{token:'test-credential-only'}},identity,clock=Date,storage=new Map()}={}){
  const calls=[],location={origin:'https://app.slack.com',pathname:'/client/TONE/CONE'};
  const metrics=[],window={__pmeApiMetric:value=>metrics.push(JSON.parse(value))};window.top=window;
  const context={window,location,AbortController,AbortSignal,URLSearchParams,Date:clock,
    sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    localStorage:{getItem:()=>JSON.stringify({teams})},
    fetch:async(url,options)=>{calls.push({url,options});return url==='/api/auth.test'?response(typeof identity==='function'?identity():identity||{ok:true,team_id:options.body.get('_x_team_id'),user_id:'UONE'}):respond(url,options);}};
  vm.runInNewContext(source,context);return{api:window.__PME_READS__,calls,location,metrics};
}
const response=(body,status=200,headers={})=>({ok:status===200,status,headers:{get:k=>headers[k]},text:async()=>JSON.stringify(body)});
test('history adapter sends only fixed reads and returns sanitized messages/names, never credentials',async()=>{
  const {api,calls}=setup(url=>url.endsWith('users.info')?response({ok:true,user:{id:'UONE',name:'Person',email:'private@example.test'}}):
    response({ok:true,messages:[{ts:'100.000001',user:'UONE',text:'<script>test</script>',secret:'DO NOT EXPORT',files:[{private_url:'private'}]}],response_metadata:{next_cursor:'next-page'},has_more:true,token:'DO NOT EXPORT'}));
  const result=await api.read({workspaceId:'TONE',channelId:'CONE',method:'chat.postMessage'});
  assert.equal(result.ok,true);assert.equal(result.messages[0].text,'<script>test</script>');assert.equal(result.users[0].name,'Person');
  assert.equal(result.nextCursor,'next-page');assert.equal(result.hasMore,true);
  assert.deepEqual(calls.map(c=>c.url),['/api/auth.test','/api/conversations.history','/api/users.info']);
  assert.equal(calls[0].options.body.get('token'),'test-credential-only');
  assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.redirect,'error');
  assert.equal(/test-credential|DO NOT EXPORT|private@example|private_url/.test(JSON.stringify(result)),false);
  api.dispose();assert.equal((await api.read({workspaceId:'TONE',channelId:'CONE'})).error,'cancelled');
});
test('background workspace reads verify identity and isolate credentials without navigating',async()=>{
  const teams={TONE:{id:'TONE',token:'one'},TTWO:{id:'TTWO',user_id:'UONE',token:'two'}};
  const env=setup(()=>response({ok:true,messages:[]}),{teams});
  assert.equal((await env.api.read({workspaceId:'TTWO',channelId:'CTWO'})).ok,true);
  assert.equal(env.location.pathname,'/client/TONE/CONE');
  assert.deepEqual(env.calls.map(c=>[c.url,c.options.body.get('token'),c.options.body.get('_x_team_id')]),[['/api/auth.test','two','TTWO'],['/api/conversations.history','two','TTWO']]);
  teams.TTWO.token='rotated';await env.api.read({workspaceId:'TTWO',channelId:'CTWO'});
  assert.equal(env.calls.filter(c=>c.url==='/api/auth.test').length,2);env.api.dispose();
  for(const identity of [{ok:true,team_id:'TONE',user_id:'UONE'},{ok:true,team_id:'TTWO',user_id:'UWRONG'}]){
    const mismatch=setup(()=>{throw Error('History must not be fetched');},{teams,identity});
    assert.equal((await mismatch.api.read({workspaceId:'TTWO',channelId:'CTWO'})).error,'workspace_mismatch');
    assert.deepEqual(mismatch.calls.map(c=>c.url),['/api/auth.test']);mismatch.api.dispose();
  }
});
test('activity keeps its conversation list when optional unread/thread reads fail and strips private fields',async()=>{
  const env=setup(url=>url.endsWith('users.conversations')?response({ok:true,channels:[{id:'CONE',name:'test',secret:'PRIVATE'}],response_metadata:{next_cursor:'next'}}):response({ok:false,error:'missing_scope',secret:'PRIVATE'}));
  const result=await env.api.activity({workspaceId:'TONE'});
  assert.equal(result.ok,true);assert.equal(result.channels[0].name,'test');assert.equal(result.nextCursor,'next');
  assert.equal(result.countsAvailable,false);assert.equal(result.threadsAvailable,false);
  assert.equal(result.counts,undefined);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
  assert.deepEqual(env.calls.map(c=>c.url),['/api/auth.test','/api/users.conversations','/api/client.counts','/api/subscriptions.thread.getView']);
  env.calls.length=0;await env.api.activity({workspaceId:'TONE',cursor:'next'});
  assert.deepEqual(env.calls.map(c=>c.url),['/api/users.conversations']);env.api.dispose();
});
test('adapter rejects wrong workspace, malicious identifiers, and foreign origins before requests',async()=>{
  const {api,calls,location}=setup(()=>{throw Error('must not fetch');});
  for(const input of [{workspaceId:'TTWO',channelId:'CONE'},{workspaceId:'TONE',channelId:'CONE/../../chat.postMessage'},
    {workspaceId:'TONE',channelId:'CONE',threadTs:'oops'},{workspaceId:'TONE',channelId:'CONE',cursor:'x'.repeat(2049)}])assert.equal((await api.read(input)).ok,false);
  location.origin='https://evil.test';assert.equal((await api.read({workspaceId:'TONE',channelId:'CONE'})).error,'workspace_changed');
  assert.equal(calls.length,0);api.dispose();
});
test('thread pagination uses only replies; HTTP 429 blocks subsequent requests',async()=>{
  const {api,calls}=setup(()=>response({},429,{'retry-after':'120'}));
  const result=await api.read({workspaceId:'TONE',channelId:'CONE',threadTs:'100.000001',cursor:'page'});
  assert.equal(calls[1].url,'/api/conversations.replies');assert.equal(calls[1].options.body.get('ts'),'100.000001');assert.equal(calls[1].options.body.get('cursor'),'page');
  assert.equal(result.error,'ratelimited');assert.equal(result.retryAfter,120);
  assert.equal((await api.read({workspaceId:'TONE',channelId:'CONE'})).error,'ratelimited');assert.equal(calls.length,2);api.dispose();
});
test('workspace switch during a response discards content and does not expose server errors',async()=>{
  let env;env=setup(()=>{env.location.pathname='/client/TTWO/CONE';return response({ok:true,messages:[{ts:'100.000001',text:'old workspace'}]});});
  const result=await env.api.read({workspaceId:'TONE',channelId:'CONE'});assert.equal(result.ok,false);assert.equal(result.error,'workspace_changed');env.api.dispose();
  const second=setup(()=>response({ok:false,error:'SECRET SERVER DIAGNOSTICS'}));
  assert.equal((await second.api.read({workspaceId:'TONE',channelId:'CONE'})).error,'request_failed');second.api.dispose();
});
test('identity throttling exposes a bounded retry delay without attempting activity reads',async()=>{
  const env=setup(()=>{throw Error('must not read');},{identity:{ok:false,error:'ratelimited'}});
  const result=await env.api.activity({workspaceId:'TONE'});assert.equal(result.error,'ratelimited');assert.equal(result.retryAfter,60);assert.equal(env.calls.length,1);env.api.dispose();
});
test('discovery caches directory for 15 minutes and never fans out into name lookups',async()=>{
  let time=1000;const env=setup(url=>url.endsWith('users.conversations')?response({ok:true,channels:Array.from({length:100},(_,i)=>({id:`D${i}`,user:`U${i}`,is_im:true,has_unreads:true})),response_metadata:{next_cursor:'page2'}}):response({ok:true,threads:[],channels:[]}),{clock:{now:()=>time}});
  await env.api.activity({workspaceId:'TONE'});time+=60000;
  const result=await env.api.activity({workspaceId:'TONE'});
  assert.equal(env.calls.filter(c=>c.url.endsWith('users.conversations')).length,1);
  assert.equal(env.calls.filter(c=>c.url.endsWith('users.info')).length,0);
  // A cached directory must not reassert stale read/unread observations.
  assert.equal(result.channels[0].has_unreads,undefined);
  time+=900000;await env.api.activity({workspaceId:'TONE'});
  assert.equal(env.calls.filter(c=>c.url.endsWith('users.conversations')).length,2);env.api.dispose();
});
test('concurrent explicit reads share identity verification',async()=>{
  const env=setup(()=>response({ok:true,messages:[]}));
  await Promise.all(['CONE','CTWO'].map(channelId=>env.api.read({workspaceId:'TONE',channelId})));
  assert.equal(env.calls.filter(c=>c.url.endsWith('auth.test')).length,1);env.api.dispose();
});
test('auth rejection stops all subsequent custom reads until the credential changes',async()=>{
  const teams={TONE:{token:'old'}},env=setup(()=>response({ok:true,messages:[]}),{teams,identity:()=>teams.TONE.token==='old'?{ok:false,error:'token_revoked'}:{ok:true,team_id:'TONE'}});
  for(let i=0;i<20;i++)assert.equal((await env.api.activity({workspaceId:'TONE'})).error,'token_revoked');
  assert.equal((await env.api.read({workspaceId:'TONE',channelId:'CONE'})).error,'token_revoked');assert.equal(env.calls.length,1);
  teams.TONE.token='new';assert.equal((await env.api.read({workspaceId:'TONE',channelId:'CONE'})).ok,true);assert.equal(env.calls.length,3);
  assert.equal(env.metrics.filter(m=>m.event==='auth_failed').length,1);assert.equal(JSON.stringify(env.metrics).includes('token'),false);env.api.dispose();
});
test('denied optional methods and failed author lookups are not repeatedly fetched',async()=>{
  const env=setup(url=>response(url.endsWith('users.conversations')?{ok:true,channels:[]}:
    url.endsWith('conversations.history')?{ok:true,messages:[{ts:'100.000001',user:'UONE',text:'test'}]}:{ok:false,error:'missing_scope'}));
  await env.api.activity({workspaceId:'TONE'});await env.api.activity({workspaceId:'TONE'});
  for(const name of ['client.counts','subscriptions.thread.getView'])assert.equal(env.calls.filter(c=>c.url.endsWith(name)).length,1);
  await env.api.read({workspaceId:'TONE',channelId:'CONE'});await env.api.read({workspaceId:'TONE',channelId:'CONE'});
  assert.equal(env.calls.filter(c=>c.url.endsWith('users.info')).length,1);env.api.dispose();
});
test('optional 429 stops the remaining batch and persists the full cooldown across adapter reloads',async()=>{
  let time=1000;const storage=new Map(),clock={now:()=>time};
  const env=setup(url=>url.endsWith('users.conversations')?response({ok:true,channels:[]}):response({},429,{'retry-after':'7200'}),{storage,clock});
  const result=await env.api.activity({workspaceId:'TONE'});assert.equal(result.retryAfter,7200);
  assert.deepEqual(env.calls.map(c=>c.url),['/api/auth.test','/api/users.conversations','/api/client.counts']);env.api.dispose();
  const next=setup(()=>response({ok:true,messages:[]}),{storage,clock});
  time+=3600000;assert.equal((await next.api.read({workspaceId:'TONE',channelId:'CONE'})).error,'ratelimited');assert.equal(next.calls.length,0);
  time+=3600000;assert.equal((await next.api.read({workspaceId:'TONE',channelId:'CONE'})).ok,true);assert.equal(next.calls.length,2);next.api.dispose();
});
