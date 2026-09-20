import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {TriageState} from '../src/triage-state.mjs';
const item={key:'TONE:CONE:',latest:'100.000001',unread:true};
test('notification preferences and five-second collapse persist and reject malformed choices',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'triage-settings-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'state.json'),state=await new TriageState(file).load();
 assert.equal(state.settings.notificationMode,'all');
 await state.configure({notificationMode:'selected',notificationWorkspaces:['TONE','TTWO','TONE'],idleSeconds:5});
 const restored=await new TriageState(file).load();
 assert.equal(restored.settings.notificationMode,'selected');assert.deepEqual(restored.settings.notificationWorkspaces,['TONE','TTWO']);assert.equal(restored.settings.idleSeconds,5);
 await restored.configure({notificationMode:'invalid',notificationWorkspaces:['bad/id']});
 assert.equal(restored.settings.notificationMode,'selected');assert.deepEqual(restored.settings.notificationWorkspaces,['TONE','TTWO']);
 await restored.configure({notificationMode:'inbox'});assert.deepEqual(restored.settings.notificationWorkspaces,['TONE','TTWO']);
 await restored.configure({notificationMode:'selected',notificationWorkspaces:[]});assert.deepEqual(restored.settings.notificationWorkspaces,[]);
});
test('local Done persists without content and reopens only for activity after the decision',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'triage-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let now=200000;
 const s=await new TriageState(path.join(dir,'state.json'),{now:()=>now}).load();await s.act(item,'done');assert.equal(s.project(item).needsAction,false);
 assert.equal(s.project({...item,latest:'150.000001'}).state,'done');assert.equal(s.project({...item,latest:'201.000001'}).needsAction,true);
 const persisted=await new TriageState(s.file,{now:()=>now}).load();assert.equal(persisted.project(item).state,'done');assert.equal((await fs.readFile(s.file,'utf8')).includes('messages'),false);
 await s.act(item,'later');assert.equal(s.project(item).state,'later');now+=3600001;assert.equal(s.project(item).needsAction,true);
 await s.act(item,'reopen');await s.act(item,'pin');assert.equal(s.project(item).pinned,true);await s.act(item,'undo');assert.equal(s.project(item).pinned,false);
});
test('corrupt state is preserved and unknown keys/actions cannot be saved',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'triage-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'state.json');await fs.writeFile(file,'broken');
 const s=await new TriageState(file).load();assert.ok(s.error);await assert.rejects(s.act(item,'done'));assert.equal(await fs.readFile(file,'utf8'),'broken');
 assert.equal(await s.act({...item,key:'TONE:CONE:../../bad'},'done'),false);assert.equal(await s.act(item,'send'),false);
});
test('snooze durations expire at the saved boundary; unsupported values do not write',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'triage-snooze-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let now=200000;
 const state=await new TriageState(path.join(dir,'state.json'),{now:()=>now}).load();
 for(const minutes of [15,60,240,1440]){
  await state.act(item,'later',{minutes});const until=now+minutes*60000;assert.equal(state.project(item).until,until);
  const loaded=await new TriageState(state.file,{now:()=>now}).load();assert.equal(loaded.project(item).until,until);
  await state.act(item,'undo');assert.equal(state.records.has(item.key),false);
  now=until-1;assert.equal(loaded.project(item).state,'later');now++;assert.equal(loaded.project(item).state,'active');
 }
 const before=await fs.readFile(state.file,'utf8');for(const minutes of [-1,0,NaN,100000,'60'])assert.equal(await state.act(item,'later',{minutes}),false);
 assert.equal(await fs.readFile(state.file,'utf8'),before);
});
