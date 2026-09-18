// Explicitly authorized test workspaces only. Native Slack sends; never auto-retry.
import {inspect,until,root} from './control.mjs';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
if(!process.argv.includes('--send-test-messages'))throw Error('This experiment sends four labeled messages. Pass --send-test-messages only for the authorized test run.');
const cases=[
  {key:'T0C3P9VJUBA:D0C2DJ1HK63:',workspace:'Personal Test',kind:'dm'},
  {key:'T0C3P9VJUBA:D0C2DJ1HK63:1789733536.233259',workspace:'Personal Test',kind:'dm-thread'},
  {key:'TAAP373B6:D0C2X6JU7CH:',workspace:'haxx',kind:'dm'},
  {key:'TAAP373B6:CAA9C7T16:1789733569.029729',workspace:'haxx',kind:'channel-thread'}
];
async function ready(key){for(let i=0;i<90;i++){
  try{const s=await inspect(`window.__PME_REPLY__?.status()`);if(s?.target?.key===key){if(s.state==='error')throw Error(s.reason);if(s.ready)return s;}}
  catch(e){if(!/context|session|No matching page|__PME_REPLY__/.test(e.message))throw e;}
  await new Promise(r=>setTimeout(r,200));
}throw Error('Native reply did not become ready');}
async function open(key){
  await until('window.__PME_TRIAGE__?.status().items>0');
  await inspect(`(async()=>{const s=document.querySelector('#pme-live-triage').shadowRoot;if(__PME_TRIAGE__.status().workspace!=='*'){const p=s.getElementById('workspace-picker');p.value='*';p.dispatchEvent(new Event('change'));}await __PME_TRIAGE__.transition('queue');s.querySelector('[data-filter="all"]').click();})()`);
  await until(`__PME_TRIAGE__.status().workspace==='*'`);
  await until(`(()=>{const s=document.querySelector('#pme-live-triage').shadowRoot;return [...s.querySelectorAll('.row')].some(r=>r.dataset.key===${JSON.stringify(key)});})()`);
  await inspect(`(()=>{const s=document.querySelector('#pme-live-triage').shadowRoot;[...s.querySelectorAll('.row')].find(r=>r.dataset.key===${JSON.stringify(key)}).click();})()`);
  return ready(key);
}
const reports=process.argv.includes('--resume-run')?JSON.parse(await fs.readFile(path.join(root,'evidence/native-reply-checks.json'),'utf8')).cases:[];
assert.ok(reports.every((r,i)=>r.deliveredOnce&&r.workspace===cases[i]?.workspace&&r.kind===cases[i]?.kind));
const completed=reports.length;
for(const [index,c] of cases.entries()){
  if(index<completed)continue;
  await open(c.key);
  const [workspaceId,channelId,threadTs]=c.key.split(':');
  let marker=`PME TEST: native triage ${c.kind} ${new Date().toISOString()}`;
  if(index===0&&process.argv.includes('--resume-test-draft')){
    const existing=await inspect(`document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_input"]')?.textContent`);
    if(typeof existing==='string'&&/^PME TEST: native triage dm \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(existing)&&Date.now()-Date.parse(existing.slice(-24))<3600000)marker=existing;
  }
  const inserted=await inspect(`(async()=>{const t=__PME_REPLY__.status(),team=JSON.parse(localStorage.getItem('localConfig_v2')).teams?.[${JSON.stringify(workspaceId)}];
    if(!t.ready||t.target.key!==${JSON.stringify(c.key)}||team?.name!==${JSON.stringify(c.workspace)})throw Error('Not the authorized test destination');
    const verified=await __PME_READS__.read({workspaceId:${JSON.stringify(workspaceId)},channelId:${JSON.stringify(channelId)},threadTs:${JSON.stringify(threadTs||null)}});if(!verified.ok)throw Error('Workspace identity/read verification failed');
    const e=document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_input"][contenteditable="true"]');if(e?.textContent===${JSON.stringify(marker)})return true;if(!e||e.textContent.trim())throw Error('Existing draft must not be overwritten');
    e.focus();document.execCommand('insertText',false,${JSON.stringify(marker)});return e.textContent===${JSON.stringify(marker)};})()`);
  assert.equal(inserted,true);
  let collapseDraft=false,workspaceDraft=false;
  if(index===0){
    await new Promise(r=>setTimeout(r,700));
    await inspect(`__PME_TRIAGE__.command('rest')`);await inspect(`__PME_TRIAGE__.command('toggle')`);await ready(c.key);
    collapseDraft=await inspect(`document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_input"]').textContent===${JSON.stringify(marker)}`);assert.equal(collapseDraft,true);
    await open(cases[2].key);await open(c.key);
    workspaceDraft=await inspect(`document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_input"]').textContent===${JSON.stringify(marker)}`);assert.equal(workspaceDraft,true);
  }
  await until(`(()=>{const b=document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_send_button"]');return !!b&&!b.disabled;})()`);
  // Record attempt before clicking. Verification below never repeats a send.
  await fs.writeFile(path.join(root,'.lab/dev/native-reply-send-attempt.json'),JSON.stringify({key:c.key,marker,at:Date.now()}),{mode:0o600});
  await inspect(`(()=>{const s=__PME_REPLY__.status(),pane=document.querySelector('[data-pme-native-reply-pane]'),e=pane?.querySelector('[data-qa="texty_input"]');if(!s.ready||s.target.key!==${JSON.stringify(c.key)}||e?.textContent!==${JSON.stringify(marker)})throw Error('Destination or draft changed before send');if(pane.querySelector('[data-qa="threads_footer_broadcast_checkbox"]')?.checked)throw Error('Thread broadcast must be off');const send=pane.querySelector('[data-qa="texty_send_button"]');if(!send||send.disabled)throw Error('Native Send unavailable');send.click();return true;})()`);
  const delivered=await until(`(async()=>{const r=await __PME_READS__.read({workspaceId:${JSON.stringify(workspaceId)},channelId:${JSON.stringify(channelId)},threadTs:${JSON.stringify(threadTs||null)}});return r.ok&&r.messages.filter(m=>m.text===${JSON.stringify(marker)}&&(!${JSON.stringify(threadTs)}||m.thread_ts===${JSON.stringify(threadTs)})).length===1;})()`,{attempts:8,delay:1000});
  reports.push({workspace:c.workspace,kind:c.kind,deliveredOnce:delivered,...(index===0?{draftSurvivedCollapse:collapseDraft,draftSurvivedWorkspaceSwitch:workspaceDraft}:{})});
  await fs.writeFile(path.join(root,'evidence/native-reply-checks.json'),JSON.stringify({checkedAt:new Date().toISOString(),complete:reports.length===cases.length,customSendAPI:false,cases:reports},null,2)+'\n');
  console.log(reports.at(-1));
}
await inspect(`__PME_TRIAGE__.command('rest')`);
