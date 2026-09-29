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
