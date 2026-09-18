// Opens native test conversations; never types or sends. Native Slack may mark them read.
import {inspect,until,control,root} from './control.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const personal='T0C3P9VJUBA:D0C2DJ1HK63:',thread=personal+'1789733536.233259',haxx='TAAP373B6:D0C2X6JU7CH:',channelThread='TAAP373B6:CAA9C7T16:1789733569.029729';
const shadow=`document.querySelector('#pme-live-triage').shadowRoot`;
const click=id=>inspect(`${shadow}.getElementById(${JSON.stringify(id)}).click()`);
const choose=key=>inspect(`${shadow}.querySelector('[data-key="${key}"]').click()`);
const ready=key=>until(`__PME_REPLY__.status().ready&&__PME_REPLY__.status().target.key===${JSON.stringify(key)}&&${shadow}.getElementById('reply-placeholder').hidden`);
const read=async()=>JSON.parse(await fs.readFile(path.join(root,'.lab/dev/triage-state.json'),'utf8')).records;
const records=await read(),before=(await control({op:'status'})).feature.methods;let needsUndo=false;
try{
  await until(`__PME_TRIAGE__.status().connected&&__PME_TRIAGE__.status().items>=15`);
  await inspect(`(async()=>{await __PME_TRIAGE__.transition('queue');${shadow}.querySelector('[data-filter="all"]').click();if(!window.__pmeHistoryOriginal)window.__pmeHistoryOriginal=window.__pmeLoadHistory;window.__pmeHistoryCount=0;window.__pmeLoadHistory=x=>{window.__pmeHistoryCount++;return window.__pmeHistoryOriginal(x);};})()`);
  for(const key of [personal,thread,channelThread,haxx]){await choose(key);await ready(key);}
  assert.equal(await inspect('window.__pmeHistoryCount'),0,'Native opening must not request custom history');
  // Last click wins even while earlier geometry/navigation is still pending.
  await inspect(`(()=>{const s=${shadow};for(const key of ${JSON.stringify([personal,haxx,thread,haxx,personal])})s.querySelector('[data-key="'+key+'"]').click();})()`);
  await ready(personal);
  await inspect(`window.__pmeDefaultDraft=document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_input"]').textContent`);
  await inspect(`__PME_TRIAGE__.command('rest')`);await inspect(`__PME_TRIAGE__.command('toggle')`);await ready(personal);
  assert.equal(await inspect(`document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_input"]').textContent===window.__pmeDefaultDraft`),true);
  assert.equal(await inspect(`${shadow}.getElementById('done').closest('#reply-chrome')!==null&&${shadow}.getElementById('done').getClientRects().length>0`),true);
  needsUndo=true;await click('done');await ready(thread);assert.equal((await read())[personal].state,'done');
  await click('undo');await ready(personal);assert.deepEqual(await read(),records);needsUndo=false;
  await inspect(`${shadow}.getElementById('snooze').value='15'`);
  needsUndo=true;await click('later');await ready(thread);assert.equal((await read())[personal].state,'later');
  await click('undo');await ready(personal);assert.deepEqual(await read(),records);needsUndo=false;
  await click('reply-back');await until(`__PME_TRIAGE__.status().mode==='reading'&&window.__pmeHistoryCount===1`);
  assert.equal(await inspect('__PME_REPLY__.status().active'),false);
  await until(`${shadow}.getElementById('history-status').textContent.startsWith('Loaded')`);
  // Option-click explicitly chooses the reader without opening native chat.
  await inspect(`${shadow}.querySelector('[data-key="${haxx}"]').dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true,altKey:true}))`);
  await until(`__PME_TRIAGE__.status().mode==='reading'&&window.__pmeHistoryCount===2`);
  assert.equal(await inspect('__PME_REPLY__.status().active'),false);
  // Simulate the unread-count refresh arriving while the native pane is open.
  // This fixture changes renderer display data only, never Slack or local records.
  await inspect(`(()=>{window.__pmeDefaultUpdate=__PME_TRIAGE__.update;__PME_TRIAGE__.update=value=>{window.__pmeDefaultSnapshot=value;return window.__pmeDefaultUpdate(value);};})()`);
  await until(`!!window.__pmeDefaultSnapshot`);
  await inspect(`(async()=>{__PME_TRIAGE__.update=window.__pmeDefaultUpdate;await __PME_TRIAGE__.transition('queue');const value=structuredClone(window.__pmeDefaultSnapshot),item=value.workspaces.flatMap(w=>w.items).find(i=>i.key===${JSON.stringify(personal)});item.unread=true;item.triage={...item.triage,state:'active',needsAction:true};__PME_TRIAGE__.update(value);${shadow}.querySelector('[data-filter="attention"]').click();${shadow}.querySelector('[data-key="${personal}"]').click();})()`);
  await ready(personal);
  assert.equal(await inspect(`(()=>{const value=structuredClone(window.__pmeDefaultSnapshot),item=value.workspaces.flatMap(w=>w.items).find(i=>i.key===${JSON.stringify(personal)});item.unread=false;item.triage={...item.triage,state:'active',needsAction:false};__PME_TRIAGE__.update(value);return ${shadow}.querySelector('.row.selected')?.dataset.key===${JSON.stringify(personal)};})()`),true);
  await inspect(`__PME_TRIAGE__.update(window.__pmeDefaultSnapshot)`);
  const after=(await control({op:'status'})).feature.methods;
  assert.equal(after['chat.postMessage']||0,before['chat.postMessage']||0);
  const result={checkedAt:new Date().toISOString(),singleClickDestinations:4,customHistoryRequestsBeforeFallback:0,rapidSelectionLastWins:true,collapsePreservesExistingDraft:true,nativeToolbarVisible:true,doneLaterAdvanceNative:true,undoRestoresNativeDestinationAndDecision:true,explicitReadOnlyFallback:true,optionClickReadOnly:true,selectedRowSurvivesSimulatedReadRefresh:true,automatedSends:0};
  await fs.writeFile(path.join(root,'evidence/native-default-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
}catch(error){console.error(await inspect(`({triage:__PME_TRIAGE__.status(),native:__PME_REPLY__.status(),path:location.pathname,selected:${shadow}.querySelector('.row.selected')?.dataset.key,placeholder:${shadow}.getElementById('reply-placeholder').textContent})`));throw error;}finally{
  if(needsUndo){await click('undo').catch(()=>{});await new Promise(r=>setTimeout(r,1800));}
  await inspect(`(()=>{if(window.__pmeHistoryOriginal){window.__pmeLoadHistory=window.__pmeHistoryOriginal;delete window.__pmeHistoryOriginal;}delete window.__pmeHistoryCount;delete window.__pmeDefaultDraft;if(window.__pmeDefaultUpdate){__PME_TRIAGE__.update=window.__pmeDefaultUpdate;if(window.__pmeDefaultSnapshot)__PME_TRIAGE__.update(window.__pmeDefaultSnapshot);}delete window.__pmeDefaultUpdate;delete window.__pmeDefaultSnapshot;${shadow}.getElementById('snooze').value='60';return __PME_TRIAGE__.command('rest');})()`).catch(()=>{});
}
