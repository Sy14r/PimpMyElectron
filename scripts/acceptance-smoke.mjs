import net from 'node:net';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {until} from './control.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
function control(request){return new Promise((resolve,reject)=>{const s=net.createConnection(path.join(root,'.lab/dev/control.sock'));s.setEncoding('utf8');s.setTimeout(15000,()=>s.destroy(new Error('timeout')));let data='';s.on('connect',()=>s.write(JSON.stringify(request)+'\n'));s.on('data',d=>data+=d);s.on('error',reject);s.on('end',()=>{try{const r=JSON.parse(data);if(!r.ok)throw Error(r.error);resolve(r.result);}catch(e){reject(e);}});});}
const inspect=expression=>control({op:'inspect',expression});
await until('window.__PME_TRIAGE__?.status().items>0');
await inspect(`(async()=>{await __PME_TRIAGE__.transition('queue');const s=document.querySelector('#pme-live-triage').shadowRoot;const p=s.getElementById('workspace-picker');p.value='*';p.dispatchEvent(new Event('change'));s.querySelector('[data-filter="all"]').click();window.__pmeAcceptancePath=location.pathname;})()`);
await new Promise(r=>setTimeout(r,1800));
const beforeMethods=(await control({op:'status'})).feature.methods;
const keys=await inspect(`(()=>{const s=document.querySelector('#pme-live-triage').shadowRoot;return [...s.querySelectorAll('.row')].filter(r=>r.querySelector('.unread')&&!r.dataset.key.split(':')[2]).map(r=>r.dataset.key);})()`);
const reports=[];
for(const key of keys.slice(0,12)){
 const result=await inspect(`(async()=>{const key=${JSON.stringify(key)},s=document.querySelector('#pme-live-triage').shadowRoot;__PME_TRIAGE__.open(key,{reader:true});
   for(let n=0;n<60;n++){await new Promise(r=>setTimeout(r,150));if(s.querySelector('.row.selected')?.dataset.key===key&&s.getElementById('history-status').textContent.startsWith('Loaded without'))return{loaded:true,messages:s.querySelectorAll('.message').length,threads:[...s.querySelectorAll('[data-thread]')].map(b=>b.dataset.thread)};}return {loaded:false};})()`);
 assert.equal(result.loaded,true);reports.push({workspace:key.split(':')[0],messages:result.messages,threads:result.threads});
 for(const thread of result.threads.slice(0,2)){
  const opened=await inspect(`(async()=>{const s=document.querySelector('#pme-live-triage').shadowRoot;__PME_TRIAGE__.open(${JSON.stringify(thread)},{reader:true});for(let n=0;n<60;n++){await new Promise(r=>setTimeout(r,150));if(s.querySelector('.row.selected')?.dataset.key===${JSON.stringify(thread)}&&s.getElementById('history-status').textContent.startsWith('Loaded without'))return {loaded:true,messages:s.querySelectorAll('.message').length};}return {loaded:false};})()`);
  assert.equal(opened.loaded,true);reports.push({workspace:thread.split(':')[0],thread:true,messages:opened.messages,threads:[]});
 }
}
const unchanged=await inspect('location.pathname===window.__pmeAcceptancePath');assert.equal(unchanged,true);
const afterMethods=(await control({op:'status'})).feature.methods;
const sendCalls=(afterMethods['chat.postMessage']||0)-(beforeMethods['chat.postMessage']||0),markCalls=(afterMethods['conversations.mark']||0)-(beforeMethods['conversations.mark']||0);
assert.equal(sendCalls,0);assert.equal(markCalls,0);assert.equal(new Set(reports.map(r=>r.workspace)).size,2);assert.ok(reports.filter(r=>r.thread).length>=2);
const output={sendCalls,markCalls,checkedAt:new Date().toISOString(),workspaceCount:new Set(reports.map(r=>r.workspace)).size,conversationsLoaded:reports.filter(r=>!r.thread).length,threadsLoaded:reports.filter(r=>r.thread).length,messageCounts:reports.map(r=>r.messages),underlyingConversationUnchanged:unchanged};
await fs.writeFile(path.join(root,'evidence/multi-workspace-checks.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
