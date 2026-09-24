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

test('inbox density defaults to expanded, persists each choice and rejects unknown renderers',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'triage-density-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'state.json'),state=await new TriageState(file).load();assert.equal(state.settings.inboxDensity,'expanded');
 for(const inboxDensity of ['cozy','compact','expanded']){await state.configure({inboxDensity});const restored=await new TriageState(file).load();assert.equal(restored.settings.inboxDensity,inboxDensity);}
 await state.configure({inboxDensity:'compact'});await state.configure({inboxDensity:'invalid'});assert.equal(state.settings.inboxDensity,'compact');
});

test('thread aliases persist independently of attention state and are isolated by workspace and root',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'triage-alias-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'state.json'),state=await new TriageState(file).load();
 const thread={key:'TONE:CONE:100.000001',unread:false};
 assert.equal(await state.setAlias(thread.key,'  Launch blockers  '),true);
 assert.equal(state.project(thread).alias,'Launch blockers');assert.equal(state.project(thread).needsAction,false);assert.equal(state.project(thread).explicit,false);
 assert.equal(state.project({...thread,key:'TTWO:CONE:100.000001'}).alias,null);assert.equal(state.project({...thread,key:'TONE:CONE:100.000002'}).alias,null);
 await state.act(thread,'done');await state.setAlias(thread.key,'Updated name');await state.act(thread,'undo');
 assert.equal(state.project(thread).alias,'Updated name');assert.equal(state.project(thread).state,'active');
 const loaded=await new TriageState(file).load();assert.equal(loaded.project(thread).alias,'Updated name');
 await loaded.setAlias(thread.key,'');assert.equal((await new TriageState(file).load()).project(thread).alias,null);
});
test('alias validation and failed writes preserve prior names',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'triage-alias-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const state=await new TriageState(path.join(dir,'state.json')).load(),key='TONE:CONE:100.000001';
 await state.setAlias(key,'Existing');
 for(const [k,value] of [[item.key,'No'],['bad','No'],[key,'x'.repeat(121)],[key,'line\nbreak'],[key,null]])assert.equal(await state.setAlias(k,value),false);
 state.error='read failure';await assert.rejects(state.setAlias(key,'New'));assert.equal(state.aliases.get(key),'Existing');
});

test('global shortcuts and activity expansion migrate, persist, and reject duplicate assignments',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'triage-shortcuts-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'state.json');await fs.writeFile(file,JSON.stringify({version:1,settings:{shortcut:'option-space'},records:{}}));
 const state=await new TriageState(file).load();assert.equal(state.settings.stockShortcut,'cmd-shift-u');assert.equal(state.settings.expandOnActivity,true);
 await state.configure({stockShortcut:'ctrl-option-space',expandOnActivity:false});const loaded=await new TriageState(file).load();assert.equal(loaded.settings.stockShortcut,'ctrl-option-space');assert.equal(loaded.settings.expandOnActivity,false);
 await loaded.configure({shortcut:'ctrl-option-space'});assert.equal(loaded.settings.shortcut,'option-space');
 await loaded.configure({shortcut:'ctrl-option-space',stockShortcut:'option-space'});assert.equal(loaded.settings.shortcut,'ctrl-option-space');assert.equal(loaded.settings.stockShortcut,'option-space');
 await loaded.configure({stockShortcut:'invalid',expandOnActivity:'yes'});assert.equal(loaded.settings.stockShortcut,'option-space');assert.equal(loaded.settings.expandOnActivity,false);
});

test('inbox background opacity migrates to 28%, persists endpoints and rejects malformed values',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-opacity-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'state.json'),state=await new TriageState(file).load();
 assert.equal(state.settings.inboxOpacity,28);
 for(const inboxOpacity of [0,28,70,100]){await state.configure({inboxOpacity});assert.equal((await new TriageState(file).load()).settings.inboxOpacity,inboxOpacity);}
 for(const inboxOpacity of [-1,101,NaN,Infinity,12.5,'40',null,true]){await state.configure({inboxOpacity});assert.equal(state.settings.inboxOpacity,100);}
});

test('detail opacity boost persists separately and validates percentage points',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-detail-opacity-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'state.json'),state=await new TriageState(file).load();assert.equal(state.settings.detailOpacityBoost,35);
 await state.configure({inboxOpacity:45,detailOpacityBoost:20});const restored=await new TriageState(file).load();
 assert.equal(restored.settings.inboxOpacity,45);assert.equal(restored.settings.detailOpacityBoost,20);
 for(const detailOpacityBoost of [-1,101,NaN,'30',null]){await state.configure({detailOpacityBoost});assert.equal(state.settings.detailOpacityBoost,20);}
});
