import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pillPreview} from '../src/pill-preview.mjs';
const request={key:'TONE:DONE:',edge:'left',anchor:{x:4,y:500,width:32,height:32}};
const message=(ts,text)=>({ts,text,author:'Alex'});
const item={key:request.key,name:'Alex',kind:'dm',unread:true,lastRead:'100.000001',triage:{state:'active'},messages:[message('100.000001','Already read'),message('100.000002','New content')]};
const preview=(patch={},r=request)=>pillPreview([{id:'TONE',name:'One',items:[{...item,...patch}]}],r);
test('preview leads with unread content and never includes earlier read messages',()=>{
 const p=preview();assert.equal(p.label,'New message');assert.deepEqual(p.messages,[{author:'Alex',text:'New content'}]);
 assert.equal(p.subtitle,'One · DM');assert.equal(JSON.stringify(p).includes('Already read'),false);
});
test('multiple new messages keep the latest three in conversation order',()=>{
 const p=preview({messages:Array.from({length:6},(_,i)=>message(`100.00000${i+1}`,`Message ${i+1}`))});
 assert.equal(p.label,'Showing latest 3 of 5 cached new messages');assert.deepEqual(p.messages.map(m=>m.text),['Message 4','Message 5','Message 6']);
});
test('missing new content is explicit rather than falling back to an old read message',()=>{
 const p=preview({lastRead:'100.000002'});assert.equal(p.messages[0].text,'New message content is not cached yet.');
 assert.equal(JSON.stringify(p).includes('Already read'),false);
});
test('unknown read cursor labels the latest cached preview honestly',()=>{
 const p=preview({lastRead:null});assert.match(p.label,/unread boundary unknown/);assert.equal(p.messages[0].text,'New content');
});
test('preview uses resolved plain text, bounds output, and renders attachment-only messages',()=>{
 assert.equal(preview({messages:[{...message('100.000002','<@UONE>'),parts:[{type:'mention',text:'@Alex'}]}]}).messages[0].text,'@Alex');
 assert.equal(preview({messages:[message('100.000002','x'.repeat(1000))]}).messages[0].text.length,600);
 assert.equal(preview({messages:[{...message('100.000002',''),hasAttachments:true}]}).messages[0].text,'Attachment');
});
test('read, Done, Later, unknown keys and unscoped workspaces never produce previews',()=>{
 assert.equal(preview({unread:false}),null);
 for(const state of ['done','later'])assert.equal(preview({triage:{state}}),null);
 assert.equal(preview({}, {...request,key:'TTWO:DOTHER:'}),null);assert.equal(pillPreview([],request),null);
});
test('invalid native anchor coordinates are rejected',()=>{
 for(const patch of [{x:Infinity},{width:0},{height:500},{y:100001}])assert.equal(preview({}, {...request,anchor:{...request.anchor,...patch}}),null);
 assert.equal(preview({}, {...request,edge:'top'}),null);
});

test('personal alias titles preserve conversation context and new-message content',()=>{
 const p=preview({kind:'thread',triage:{state:'active',alias:'Launch blockers'}});
 assert.equal(p.title,'Launch blockers');assert.equal(p.subtitle,'One · Thread · Alex');assert.equal(p.messages[0].text,'New content');
});
