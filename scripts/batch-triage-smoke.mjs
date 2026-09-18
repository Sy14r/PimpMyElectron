// Local state/UI only. Each changed decision is restored through Undo.
import {inspect,control,until,root} from './control.mjs';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const file=path.join(root,'.lab/dev/triage-state.json'),read=async()=>JSON.parse(await fs.readFile(file,'utf8')).records;
const records=await read(),before=(await control({op:'status'})).feature.methods;
const selected=`document.querySelector('#pme-live-triage').shadowRoot.querySelector('.row.selected')?.dataset.key`;
const click=id=>inspect(`document.querySelector('#pme-live-triage').shadowRoot.getElementById(${JSON.stringify(id)}).click()`);
const press=(key,id='back')=>inspect(`(()=>{const n=document.querySelector('#pme-live-triage').shadowRoot.getElementById(${JSON.stringify(id)});n.focus();n.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,composed:true,cancelable:true}));})()`);
let needsUndo=false;
try{
  await until('__PME_TRIAGE__?.status().items>1');
  await inspect(`(async()=>{await __PME_TRIAGE__.transition('queue');const s=document.querySelector('#pme-live-triage').shadowRoot;s.querySelector('[data-filter="all"]').click();})()`);
  const keys=await inspect(`[...document.querySelector('#pme-live-triage').shadowRoot.querySelectorAll('.row')].map(n=>n.dataset.key)`);assert.ok(keys.length>1);
  await inspect(`__PME_TRIAGE__.open(document.querySelector('#pme-live-triage').shadowRoot.querySelector('.row').dataset.key,{reader:true})`);
  await until(`__PME_TRIAGE__.status().mode==='reading'`);
  await until(`document.querySelector('#pme-live-triage').shadowRoot.getElementById('history-status').textContent.startsWith('Loaded')`);
  const nextKey=()=>inspect(`document.querySelector('#pme-live-triage').shadowRoot.querySelector('.row.selected')?.nextElementSibling?.dataset.key`);
  let next=await nextKey();assert.ok(next);needsUndo=true;await press('e');await until(`${selected}===${JSON.stringify(next)}`);
  assert.equal((await read())[keys[0]].state,'done');
  await click('undo');await until(`${selected}===${JSON.stringify(keys[0])}`);assert.deepEqual(await read(),records);needsUndo=false;
  await inspect(`document.querySelector('#pme-live-triage').shadowRoot.getElementById('snooze').value='15'`);
  next=await nextKey();assert.ok(next);const started=Date.now();needsUndo=true;await press('l');await until(`${selected}===${JSON.stringify(next)}`);
  const later=(await read())[keys[0]];assert.equal(later.state,'later');assert.ok(later.until>=started+900000&&later.until<=Date.now()+900000);
  await click('undo');await until(`${selected}===${JSON.stringify(keys[0])}`);assert.deepEqual(await read(),records);needsUndo=false;
  await press('e','search');await new Promise(r=>setTimeout(r,1700));assert.deepEqual(await read(),records);assert.equal(await inspect(selected),keys[0]);
  // The duration select owns its arrow keys; the queue selection stays put.
  await press('ArrowDown','snooze');assert.equal(await inspect(selected),keys[0]);
  await inspect(`(()=>{const s=document.querySelector('#pme-live-triage').shadowRoot,n=document.createElement('option');n.value='5';n.textContent='test invalid duration';n.dataset.pmeTest='';s.getElementById('snooze').append(n);s.getElementById('snooze').value='5';})()`);
  await press('l');await until(`document.querySelector('#pme-live-triage').shadowRoot.getElementById('notice').textContent.startsWith('Could not save that decision')`);
  assert.equal(await inspect(selected),keys[0]);assert.deepEqual(await read(),records);
  const after=(await control({op:'status'})).feature.methods;
  for(const method of ['chat.postMessage','conversations.mark'])assert.equal(after[method]||0,before[method]||0);
  const result={checkedAt:new Date().toISOString(),doneKeyboardAdvancesAfterSave:true,laterKeyboardAdvancesAfterSave:true,snooze15Minutes:true,undoRestoresDecisionAndReader:true,typingDoesNotTriggerActions:true,selectArrowDoesNotNavigateQueue:true,rejectedSaveDoesNotAdvance:true,slackWrites:0,decisionsRestored:true};
  await fs.writeFile(path.join(root,'evidence/batch-triage-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{
  if(needsUndo){await click('undo').catch(()=>{});await new Promise(r=>setTimeout(r,1800));}
  await inspect(`(()=>{const s=document.querySelector('#pme-live-triage')?.shadowRoot;s?.querySelector('[data-pme-test]')?.remove();if(s){s.getElementById('snooze').value='60';s.getElementById('notice').textContent='';}return __PME_TRIAGE__?.command('rest');})()`).catch(()=>{});
}
