// Navigation/layout checks only: never types, sends, or modifies a draft.
import {control,inspect,until,root} from './control.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const config=path.join(root,'.lab/dev/mods.json');
const previous=await fs.readFile(config,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
const disabled=previous?JSON.parse(previous).disabled:[];
if(disabled.includes('native-reply')||disabled.includes('triage-surface'))throw Error('Enable triage and native reply before this check.');
const initial=await inspect(`window.__PME_REPLY__?.status()`);
if(!initial?.target||!['TAAP373B6','T0C3P9VJUBA'].includes(initial.target.workspaceId))throw Error('A test-workspace reply destination is required.');
const before=(await control({op:'status'})).feature.methods['chat.postMessage']||0;
const open=async target=>{
  await inspect(`(async()=>{await __PME_TRIAGE__.transition('reply');return __PME_REPLY__.open(${JSON.stringify(target)});})()`);
  return until(`__PME_REPLY__?.status().ready&&__PME_REPLY__.status().target.key===${JSON.stringify(target.key)}`);
};
try{
  await open(initial.target);
  await inspect(`window.__pmeReplyCheck={editor:document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_input"]')};__pmeReplyCheck.text=__pmeReplyCheck.editor.textContent;true`);
  await fs.writeFile(config,JSON.stringify({disabled:[...disabled,'native-reply']}),{mode:0o600});
  await until(`!window.__PME_REPLY__&&!document.querySelector('[data-pme-native-reply-pane]')&&!document.querySelector('#pme-native-reply-style')`);
  assert.equal(await inspect(`__pmeReplyCheck.editor.isConnected&&__pmeReplyCheck.editor.textContent===__pmeReplyCheck.text`),true);
  await fs.writeFile(config,JSON.stringify({disabled}),{mode:0o600});
  await until(`window.__PME_REPLY__?.status().ready`);
  assert.equal(await inspect(`document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_input"]')===__pmeReplyCheck.editor&&__pmeReplyCheck.editor.textContent===__pmeReplyCheck.text`),true);
  await inspect(`__PME_TRIAGE__.command('rest')`);await inspect(`__PME_TRIAGE__.command('toggle')`);
  await until(`__PME_REPLY__?.status().ready`);
  assert.equal(await inspect(`document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_input"]').textContent===__pmeReplyCheck.text`),true);
  const other=initial.target.workspaceId==='TAAP373B6'?{workspaceId:'T0C3P9VJUBA',channelId:'D0C2DJ1HK63',workspaceName:'Personal Test',name:'Test DM'}:{workspaceId:'TAAP373B6',channelId:'D0C2X6JU7CH',workspaceName:'haxx',name:'Test DM'};
  other.key=`${other.workspaceId}:${other.channelId}:`;
  await open(other);await open(initial.target);
  assert.equal(await inspect(`document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_input"]').textContent===__pmeReplyCheck.text`),true);
  const after=(await control({op:'status'})).feature.methods['chat.postMessage']||0;assert.equal(after,before);
  const report={checkedAt:new Date().toISOString(),nativeModuleRemovalPreservesEditor:true,reenableRestoresReply:true,collapseReopen:true,workspaceRoundTrip:true,draftUnchanged:true,sends:0};
  await fs.writeFile(path.join(root,'evidence/native-reply-lifecycle.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{
  if(previous===null)await fs.rm(config,{force:true});else await fs.writeFile(config,previous,{mode:0o600});
  await inspect(`delete window.__pmeReplyCheck;__PME_TRIAGE__?.command('rest')`).catch(()=>{});
}
