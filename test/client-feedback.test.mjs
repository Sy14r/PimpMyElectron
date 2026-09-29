import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../client/ui/app.js',import.meta.url),'utf8'),env={};
vm.runInNewContext(source.slice(source.indexOf('function feedbackReport('),source.indexOf('function openFeedback(')),env);
const state={clientVersion:'0.5.2',clientBuild:10,platform:'mac',dataDir:'/SECRET',apps:[{id:'slack',name:'Slack',selectedPath:'/SECRET/Slack.app',installations:[{path:'/SECRET/Slack.app',version:'4.52'}],selectedMods:['triage'],mods:[{id:'triage',name:'Triage',version:'0.20'}],runtime:{workspace:'SECRET',log:'SECRET'}}]};
test('feedback includes only the reviewed description and opt-in version details',()=>{
 const fields={kind:'bug',area:'slack',title:' Test ',description:' Steps to reproduce ',versions:true},r=env.feedbackReport(fields,state);
 assert.equal(r.title,'Test');assert.ok(r.body.includes('Steps to reproduce'));assert.ok(r.body.includes('Slack: 4.52'));assert.ok(r.body.includes('Triage: 0.20'));assert.ok(!r.body.includes('SECRET'));
 const plain=env.feedbackReport({...fields,versions:false},state);assert.ok(!plain.body.includes('0.5.2'));assert.ok(!plain.body.includes('Version details'));
});
test('client ideas work without an installed or selected application',()=>{
 const r=env.feedbackReport({kind:'idea',area:'client',title:'Idea',description:'Details',versions:false},null);
 assert.equal(r.body,'## Idea\nArea: PME client\n\nDetails');
});

import os from 'node:os';import path from 'node:path';import {submitFeedback} from '../client/core/feedback.mjs';
test('native submit sends the reviewed payload only, avoids redirects, and retains safe retry outcomes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pme-feedback-'));
 try{
  await fs.mkdir(path.join(root,'client'));await fs.writeFile(path.join(root,'client/feedback.json'),JSON.stringify({endpoint:'https://feedback.example/v1/reports'}));
  const report={title:'Test',body:'Description',requestId:Date.now()+'-'+crypto.randomUUID()},url='https://github.com/Sy14r/PimpMyElectron/issues/5';
  const r=await submitFeedback(root,report,{fetcher:async(input,opts)=>{assert.equal(input,'https://feedback.example/v1/reports');assert.deepEqual(JSON.parse(opts.body),report);assert.equal(opts.redirect,'error');assert.deepEqual(opts.headers,{'Content-Type':'application/json'});return Response.json({url});}});assert.deepEqual(r,{url});
  assert.deepEqual(await submitFeedback(root,report,{fetcher:async()=>Response.json({pending:true},{status:202})}),{pending:true});
  await assert.rejects(submitFeedback(root,report,{fetcher:async()=>{throw Error('offline');}}),/without creating a duplicate/);
  await assert.rejects(submitFeedback(root,report,{fetcher:async()=>Response.json({url:'https://evil.test'})}),/confirm submission/);
  await assert.rejects(submitFeedback(root,report,{fetcher:async()=>Response.json({error:'secret server detail'},{status:503})}),/temporarily unavailable/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
