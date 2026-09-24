import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createWindowBackdrop} from '../src/window-backdrop.mjs';
import {TriageState} from '../src/triage-state.mjs';
const entry={sessionId:'one'},sessions=new Map([['one',entry]]);
async function harness(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-glass-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const calls=[];let preference=false;
 const cdp={async evaluate(expression){calls.push(expression);
   if(expression.includes('getPreference'))return preference;
   if(expression.includes('setPreference')){preference=expression.includes('value:true');return;}
   return expression.includes('setInboxGlass(true');
 }};
 const options={cdp,file:path.join(dir,'native-appearance.json'),profile:'test',launchId:'first'};
 return {calls,cdp,options,get preference(){return preference;},set preference(v){preference=v;}};
}
test('translucency defaults off, persists booleans, rejects malformed settings',async t=>{
 const {options}=await harness(t),state=await new TriageState(options.file+'-settings').load();assert.equal(state.settings.inboxGlass,false);
 await state.configure({inboxGlass:true});assert.equal((await new TriageState(options.file+'-settings').load()).settings.inboxGlass,true);
 for(const value of [1,'true',null,{}]){await state.configure({inboxGlass:value});assert.equal(state.settings.inboxGlass,true);}
});
test('default-off never touches native preferences or window APIs',async t=>{
 const {options,calls}=await harness(t),b=createWindowBackdrop(options);
 await b.prepare(entry,false);await b.update(entry);await b.dispose(sessions);assert.deepEqual(calls,[]);
});
test('native transparency requires a real restart, preserves recovery across reloads, and restores on opt-out',async t=>{
 const h=await harness(t),b=createWindowBackdrop(h.options);
 assert.equal((await b.prepare(entry,true)).state,'restart-required');assert.equal(h.preference,true);
 await b.update(entry,{enabled:true,identity:1});assert.equal(b.status().active,false);
 const record=JSON.parse(await fs.readFile(h.options.file,'utf8')).profiles.test;assert.equal(record.original,false);
 const reload=createWindowBackdrop(h.options);assert.equal((await reload.prepare(entry,true)).state,'restart-required');
 const restarted=createWindowBackdrop({...h.options,launchId:'second'});
 assert.equal((await restarted.prepare(entry,true)).state,'ready');
 for(let i=0;i<20;i++)await restarted.update(entry,{enabled:true,identity:2});
 assert.equal(h.calls.filter(c=>c==='window.__PME_TRIAGE__?.setInboxGlass(true,false,false)').length,1);
 await restarted.prepare(entry,false);await restarted.update(entry,{enabled:false,identity:2});
 assert.equal(h.preference,false);assert.equal(restarted.status().active,false);
 assert.equal(JSON.parse(await fs.readFile(h.options.file,'utf8')).profiles.test.original,null);
 await restarted.dispose(sessions);
});
test('existing native transparency stays enabled when our effect is disabled',async t=>{
 const h=await harness(t);h.preference=true;const b=createWindowBackdrop(h.options);
 assert.equal((await b.prepare(entry,true)).state,'ready');
 await b.update(entry,{enabled:true,identity:1});await b.prepare(entry,false);await b.update(entry,{enabled:false,identity:1});
 assert.equal(h.preference,true);assert.ok(h.calls.includes('window.__PME_TRIAGE__?.setInboxGlass(false,true,false)'));
 assert.equal(h.calls.filter(c=>c.includes('setPreference')).length,0);
});
test('failed recovery record writes never mutate the native preference',async t=>{
 const h=await harness(t),b=createWindowBackdrop({...h.options,file:path.join(h.options.file,'missing','file')});
 assert.equal((await b.prepare(entry,true)).state,'unavailable');assert.equal(h.preference,false);
 assert.equal(h.calls.filter(c=>c.includes('setPreference')).length,0);
});
test('rapid enable/disable serializes native material calls and cleanup restores the surface',async t=>{
 const h=await harness(t);h.preference=true;const b=createWindowBackdrop(h.options);await b.prepare(entry,true);
 await Promise.all([b.update(entry,{enabled:true,identity:1}),b.update(entry,{enabled:false,identity:1}),b.update(entry,{enabled:true,identity:1})]);
 assert.deepEqual(h.calls.filter(c=>c.includes('setInboxGlass')).map(c=>c.includes('(true')),[true,false,true]);
 await b.dispose(sessions);assert.equal(h.calls.at(-1),'window.__PME_TRIAGE__?.setInboxGlass(false)');assert.equal(h.preference,true);
});
test('renderer scopes material, restores the original preference, and honors accessibility without opacity or filters',async()=>{
 const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
 const fragment=source.slice(source.indexOf('  const reducedTransparency='),source.indexOf('  const accentProperties='));
 const attrs=new Map(),calls=[],media={matches:false,addEventListener(){}};
 const node=()=>({toggleAttribute:(k,v)=>attrs.set(k,v),remove(){}});
 const env={window:{matchMedia:()=>media},document:{createElement:()=>node(),head:{append(){}},body:{classList:{contains:()=>true}},documentElement:node()},host:node(),abort:new AbortController(),disposed:false,mode:'queue',quickReply:null,reportShell(){},desktop:{window:{getWindowId:async()=>1,callBrowserWindowMethod:async(...args)=>{calls.push(args);return args[1]==='hasShadow'?true:undefined;}}}};env.window.desktop=env.desktop;
 vm.createContext(env);vm.runInContext(fragment,env);
 assert.equal(await env.setInboxGlass(true),false); // Unknown restoration state: stay opaque.
 assert.equal(await env.setInboxGlass(true,true),true);assert.deepEqual(calls.filter(c=>c[1]==='setVibrancy').at(-1),[1,'setVibrancy','hud']);assert.equal(attrs.get('data-inbox-glass'),true);
 await env.setInboxGlass(true,true);assert.equal(calls.length,4);
 await env.setInboxGlass(true,true,true);assert.deepEqual(calls.filter(c=>c[1]==='setVibrancy').at(-1),[1,'setVibrancy',null]);
 const readyCalls=calls.length;await env.setInboxGlass(true,true,true);assert.equal(calls.length,readyCalls);
 await env.setInboxGlass(true,true,false);assert.deepEqual(calls.filter(c=>c[1]==='setVibrancy').at(-1),[1,'setVibrancy','hud']);
 env.mode='stock';await env.setInboxGlass(true);assert.deepEqual(calls.filter(c=>c[1]==='setVibrancy').at(-1),[1,'setVibrancy','titlebar']);assert.deepEqual(calls.at(-1),[1,'setHasShadow',true]);assert.equal(attrs.get('data-inbox-glass'),false);
 env.mode='queue';await env.setInboxGlass(true);assert.deepEqual(calls.filter(c=>c[1]==='setVibrancy').at(-1),[1,'setVibrancy','hud']);assert.equal(attrs.get('data-inbox-glass'),true);
 env.mode='reply';env.quickReply={};assert.equal(await env.setInboxGlass(true),false);
 env.quickReply=null;media.matches=true;assert.equal(await env.setInboxGlass(true),false);
 media.matches=false;await env.setInboxGlass(true,false);await env.setInboxGlass(false);assert.equal(calls.filter(c=>c[1]==='setVibrancy').at(-1)[2],null);assert.deepEqual(calls.at(-1),[1,'setHasShadow',true]);
 assert.deepEqual(calls.filter(c=>c[1]==='setBackgroundColor').at(-1),[1,'setBackgroundColor','#1a1d21']);
 env.document.body.classList.contains=()=>false;await env.setInboxGlass(false);
 assert.deepEqual(calls.filter(c=>c[1]==='setBackgroundColor').at(-1),[1,'setBackgroundColor','#ffffff']);
 env.mode='queue';await env.setInboxGlass(true,false,true);
 assert.deepEqual(calls.filter(c=>c[1]==='setBackgroundColor').at(-1),[1,'setBackgroundColor','#00000000']);
 assert.doesNotMatch(fragment,/setOpacity|setPreference|backdrop-filter/);
});

test('detail opacity derives from inbox opacity, caps at opaque, and never changes text opacity',async()=>{
 const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
 const fragment=source.slice(source.indexOf('  function applyGlassOpacity('),source.indexOf('  function setInboxGlass('));
 const host=new Map(),body=new Map(),env={settings:{},host:{style:{setProperty:(k,v)=>host.set(k,v)}},document:{body:{style:{setProperty:(k,v)=>body.set(k,v)}}}};
 vm.runInNewContext(fragment,env);env.applyGlassOpacity();assert.equal(host.get('--pme-inbox-opacity'),'0.28');assert.equal(body.get('--pme-detail-opacity'),'0.63');
 for(const [inbox,boost,result] of [[35,35,'0.7'],[80,35,'1'],[0,10,'0.1'],[60,0,'0.6']]){env.settings={inboxOpacity:inbox,detailOpacityBoost:boost};env.applyGlassOpacity();assert.equal(body.get('--pme-detail-opacity'),result);assert.equal(host.get('--pme-detail-opacity'),result);}
 assert.equal([...host.keys(),...body.keys()].some(k=>k==='opacity'),false);
});
