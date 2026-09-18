// Explicit test-workspace read-state experiment; no sending or native navigation.
import {inspect,control,until,root} from './control.mjs';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
if(!process.argv.includes('--mark-test-dms'))throw Error('This marks the two authorized test DMs read. Pass --mark-test-dms to run intentionally.');
const cases=[{workspace:'Personal Test',workspaceId:'T0C3P9VJUBA',channelId:'D0C2DJ1HK63'},{workspace:'haxx',workspaceId:'TAAP373B6',channelId:'D0C2X6JU7CH'}];
const records=async()=>JSON.stringify(JSON.parse(await fs.readFile(path.join(root,'.lab/dev/triage-state.json'),'utf8')).records);
const originalRecords=await records(),reports=[];
const originalPath=await inspect('location.pathname');
const initialMethods=(await control({op:'status'})).feature.methods;
try{
  await until('window.__PME_TRIAGE__?.status().items>0&&!!window.__PME_MARK_READ__');
  for(const c of cases){
    const key=`${c.workspaceId}:${c.channelId}:`;
    const before=await inspect(`(async()=>{const w=JSON.parse(localStorage.getItem('localConfig_v2')).teams[${JSON.stringify(c.workspaceId)}];if(w.name!==${JSON.stringify(c.workspace)})throw Error('Not an authorized test workspace');const a=await __PME_READS__.activity({workspaceId:${JSON.stringify(c.workspaceId)}});const row=[...(a.counts?.channels||[]),...(a.counts?.ims||[]),...(a.counts?.mpims||[])].find(n=>n.id===${JSON.stringify(c.channelId)});return {ok:a.ok,unread:row?.has_unreads};})()`);
    assert.equal(before.ok,true);assert.equal(before.unread,true,`${c.workspace} needs a fresh unread DM; no mark was attempted for it.`);
    await inspect(`(async()=>{await __PME_TRIAGE__.transition('queue');const s=document.querySelector('#pme-live-triage').shadowRoot;if(__PME_TRIAGE__.status().workspace!=='*'){const p=s.getElementById('workspace-picker');p.value='*';p.dispatchEvent(new Event('change'));}s.querySelector('[data-filter="all"]').click();})()`);
    await until(`(()=>{const s=document.querySelector('#pme-live-triage').shadowRoot;return [...s.querySelectorAll('.row')].some(n=>n.dataset.key===${JSON.stringify(key)});})()`);
    await inspect(`(()=>{const s=document.querySelector('#pme-live-triage').shadowRoot;__PME_TRIAGE__.open(${JSON.stringify(key)},{reader:true})})()`);
    await until(`(()=>{const s=document.querySelector('#pme-live-triage').shadowRoot;return !s.getElementById('mark-read').disabled&&s.getElementById('history-status').textContent.startsWith('Loaded');})()`);
    assert.equal(await inspect('location.pathname'),originalPath);
    // Recheck that reading alone did not clear unread.
    const readOnlyUnread=await inspect(`(async()=>{const r=await __PME_READS__.activity({workspaceId:${JSON.stringify(c.workspaceId)}});return r.counts?.ims.find(n=>n.id===${JSON.stringify(c.channelId)})?.has_unreads;})()`);assert.equal(readOnlyUnread,true);
    const writesBefore=(await control({op:'status'})).feature.methods['conversations.mark']||0;
    await inspect(`document.querySelector('#pme-live-triage').shadowRoot.getElementById('mark-read').click()`);
    const result=await until(`(()=>{const s=document.querySelector('#pme-live-triage').shadowRoot,t=s.getElementById('mark-status').textContent;return t.startsWith('Slack read through')?{confirmed:true}:(!s.getElementById('mark-read').disabled&&t&&!t.startsWith('Saving')?{error:t}:null);})()`);
    assert.equal(result.confirmed,true,result.error);
    const unreadAfter=await inspect(`(async()=>{const r=await __PME_READS__.activity({workspaceId:${JSON.stringify(c.workspaceId)}});return r.counts?.ims.find(n=>n.id===${JSON.stringify(c.channelId)})?.has_unreads;})()`);assert.equal(unreadAfter,false);
    assert.equal((await control({op:'status'})).feature.methods['conversations.mark']-writesBefore,1);
    assert.equal(await inspect('location.pathname'),originalPath);assert.equal(await records(),originalRecords);
    reports.push({workspace:c.workspace,unreadBefore:true,readerKeptUnread:true,markReadConfirmed:true,unreadAfter:false,markRequests:1,localDecisionsUnchanged:true,nativeRouteUnchanged:true});
    await fs.writeFile(path.join(root,'evidence/mark-read-checks.json'),JSON.stringify({checkedAt:new Date().toISOString(),complete:reports.length===cases.length,cases:reports},null,2)+'\n');console.log(reports.at(-1));
  }
  const after=(await control({op:'status'})).feature.methods;assert.equal(after['chat.postMessage']||0,initialMethods['chat.postMessage']||0);
}finally{await inspect(`__PME_TRIAGE__?.command('rest')`).catch(()=>{});}
