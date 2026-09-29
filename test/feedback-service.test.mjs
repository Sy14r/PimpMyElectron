import {test} from 'node:test';import assert from 'node:assert/strict';
import worker,{FeedbackReports} from '../services/feedback/worker.mjs';
import {validateReport,issueURL} from '../services/feedback/protocol.mjs';
import {githubAPI,appJWT,githubToken} from '../services/feedback/github.mjs';
import {generateKeyPairSync,verify} from 'node:crypto';
const report=()=>({requestId:Date.now()+'-'+crypto.randomUUID(),title:'A report',body:'Reviewed description'});
const url='https://github.com/Sy14r/PimpMyElectron/issues/5';
function setup(connect){const map=new Map();let alarm=null,tail=Promise.resolve();const storage={get:async k=>map.get(k),put:async(k,v)=>typeof k==='string'?map.set(k,v):Object.entries(k).forEach(([k,v])=>map.set(k,v)),getAlarm:async()=>alarm,setAlarm:async v=>{alarm=v;},list:async()=>map,delete:async k=>map.delete(k),transaction(fn){const result=tail.then(()=>fn(storage));tail=result.catch(()=>{});return result;}};return {map,api:new FeedbackReports({storage},{},{connect})};}
const send=(api,r)=>api.fetch(new Request('https://internal/report',{method:'POST',body:JSON.stringify({report:r,client:'ip-hash'})}));
test('validates strict payload, request age, destinations and limits',()=>{
 const r=report();assert.deepEqual(validateReport(r),r);
 for(const invalid of [{...r,url:'https://evil.test'},{...r,title:'bad\ntitle'},{...r,body:'a'.repeat(6001)},{...r,requestId:'bad'},{...r,requestId:'1000000000000-'+crypto.randomUUID()}])assert.throws(()=>validateReport(invalid));
 assert.ok(issueURL(url));for(const bad of [url+'/comments',url+'?x=1','https://github.com/other/repo/issues/5',url.replace('https:','http:')])assert.equal(issueURL(bad),false);
});
test('concurrent retries create a single issue; changed reports conflict',async()=>{
 let posts=0,finish;const gate=new Promise(r=>finish=r),e=setup(async()=>({create:async()=>{posts++;await gate;return url;}})),r=report();
 const first=send(e.api,r);await new Promise(r=>setTimeout(r,5));
 const duplicate=await send(e.api,r);assert.equal(duplicate.status,202);finish();assert.deepEqual(await(await first).json(),{url});
 assert.deepEqual(await(await send(e.api,r)).json(),{url});assert.equal(posts,1);
 assert.equal((await send(e.api,{...r,title:'Changed'})).status,409);
 assert.ok(!JSON.stringify([...e.map]).includes(r.body));
});
test('ambiguous timeout never reposts and can recover issue URL using the marker',async()=>{
 let posts=0,finds=0;const e=setup(async()=>({create:async()=>{posts++;throw Error('timeout');},find:async()=>{finds++;return url;}})),r=report();
 assert.equal((await send(e.api,r)).status,202);
 e.map.get('report:'+r.requestId).at-=31000;
 assert.deepEqual(await(await send(e.api,r)).json(),{url});assert.equal(posts,1);assert.equal(finds,1);
});
test('token failures can safely retry and enforce a five-per-hour limit',async()=>{
 const e=setup(async()=>{throw Error('token');});
 for(let i=0;i<5;i++)assert.equal((await send(e.api,report())).status,503);
 assert.equal((await send(e.api,report())).status,429);
});
test('definite GitHub rejection can retry, but missing reconciliation results cannot',async()=>{
 let posts=0;const e=setup(async()=>({create:async()=>{posts++;if(posts===1)throw Object.assign(Error(),{definite:true});return url;}})),r=report();
 assert.equal((await send(e.api,r)).status,503);e.map.get('report:'+r.requestId).at-=31000;assert.equal((await send(e.api,r)).status,200);assert.equal(posts,2);
 const unknown=setup(async()=>({create:async()=>{throw Error();},find:async()=>null})),r2=report();await send(unknown.api,r2);unknown.map.get('report:'+r2.requestId).at-=31000;
 assert.equal((await send(unknown.api,r2)).status,202);
});
test('cleanup removes expired metadata but preserves valid idempotency records',async()=>{
 const e=setup(async()=>({create:async()=>url})),r=report();await send(e.api,r);
 e.map.set('report:1000000000000-old',{});e.map.set('rate:1:old',3);await e.api.alarm();assert.ok(e.map.has('report:'+r.requestId));assert.equal(e.map.has('report:1000000000000-old'),false);assert.equal(e.map.has('rate:1:old'),false);
});
test('public endpoint rejects browser origins, missing config, oversized and malformed input',async()=>{
 const env={GITHUB_APP_ID:'1',GITHUB_INSTALLATION_ID:'2',GITHUB_APP_PRIVATE_KEY:'key',IP_HASH_SECRET:'salt'};
 const req=(body,headers={})=>new Request('https://service/v1/reports',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'1.2.3.4',...headers},body});
 assert.equal((await worker.fetch(req('{}'),{})).status,503);
 assert.equal((await worker.fetch(req('{}',{Origin:'https://evil.test'}),env)).status,403);
 assert.equal((await worker.fetch(req('a'.repeat(30001)),env)).status,413);
 assert.equal((await worker.fetch(req('{}'),env)).status,400);
 let forwarded;env.REPORTS={idFromName:()=>1,get:()=>({fetch:async r=>{forwarded=await r.json();return Response.json({url});}})};
 const r=report();assert.equal((await worker.fetch(req(JSON.stringify(r)),env)).status,200);assert.deepEqual(forwarded.report,r);assert.match(forwarded.client,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(forwarded).includes('1.2.3.4'));
});
test('GitHub credentials use short JWTs and a repo/permission-limited installation token',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),env={GITHUB_APP_ID:'123',GITHUB_INSTALLATION_ID:'456',GITHUB_APP_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})};
 const jwt=await appJWT(env),parts=jwt.split('.'),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 assert.ok(verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),publicKey,Buffer.from(parts[2],'base64url')));assert.equal(claims.iss,'123');assert.equal(claims.exp-claims.iat,360);
 await githubToken(env,async(input,options)=>{assert.equal(input,'https://api.github.com/app/installations/456/access_tokens');assert.deepEqual(JSON.parse(options.body),{repositories:['PimpMyElectron'],permissions:{issues:'write'}});assert.equal(options.redirect,'manual');return Response.json({token:'not-real'});});
 const r=report(),api=githubAPI('not-real',async(input,options)=>{assert.equal(input,'https://api.github.com/repos/Sy14r/PimpMyElectron/issues');const body=JSON.parse(options.body);assert.equal(body.title,r.title);assert.ok(body.body.startsWith(r.body));assert.ok(body.body.endsWith(`<!-- pme-feedback:${r.requestId} -->`));return Response.json({html_url:url});});assert.equal(await api.create(r),url);
});

test('retrying an existing failed report does not consume new-report allowance and observes cooldown',async()=>{
 let connects=0;const e=setup(async()=>{connects++;if(connects<=5)throw Error('unavailable');return {create:async()=>url};}),reports=[];
 for(let i=0;i<5;i++){const r=report();reports.push(r);await send(e.api,r);}
 assert.equal((await send(e.api,reports[0])).status,503);assert.equal(connects,5);
 e.map.get('report:'+reports[0].requestId).at-=31000;
 assert.deepEqual(await(await send(e.api,reports[0])).json(),{url});assert.equal(connects,6);
 assert.equal((await send(e.api,report())).status,429);
});
test('Worker GitHub transport never follows redirects or forwards its token to redirected hosts',async()=>{
 let calls=0;const api=githubAPI('test-token',async(input,options)=>{calls++;assert.ok(input.startsWith('https://api.github.com/repos/Sy14r/PimpMyElectron/'));assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://evil.test'}});});
 await assert.rejects(api.create(report()));assert.equal(calls,1);
});
