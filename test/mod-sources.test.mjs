import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createModLoader} from '../src/mod-loader.mjs';
import {ModSources} from '../client/core/mod-sources.mjs';import {digest,validatePackage,readSource,verifyHelper,externalID,rendererSource} from '../src/mod-packages.mjs';import {loadExternalMods} from '../src/external-mods.mjs';import {ClientManager} from '../client/core/manager.mjs';import {resolveSelection} from '../client/core/catalog.mjs';
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'pme-sources-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));const source=path.join(base,'company'),dir=path.join(source,'mods/demo'),data=path.join(base,'data');await fs.mkdir(dir,{recursive:true});
 const code="window.ran=(window.ran||0)+1;api.onCleanup(()=>window.cleaned=true);";
 const manifest={schemaVersion:1,id:'demo',version:'1.0.0',apiVersion:1,name:'Private example',author:'Company',app:'slack',platforms:['mac'],description:'A private mod',access:'Renders local UI',requires:[],renderer:{script:'main.js'},helpers:[],files:{'main.js':{sha256:digest(code),executable:false}}};
 await fs.writeFile(path.join(dir,'main.js'),code);await fs.writeFile(path.join(dir,'mod.json'),JSON.stringify(manifest));await fs.writeFile(path.join(source,'catalog.json'),JSON.stringify({schemaVersion:1,id:'company',name:'Company collection',mods:['mods/demo']}));
 const store=await new ModSources(data).load();await store.add(source);const save=async()=>fs.writeFile(path.join(dir,'mod.json'),JSON.stringify(manifest));return {base,source,dir,data,store,manifest,code,save};
}
test('adding a source only reads metadata; reviewed snapshots install disabled and work offline',async t=>{
 const f=await fixture(t);assert.deepEqual(await f.store.mods(),[]);const [s]=await f.store.snapshot();assert.equal(s.installed,null);
 await f.store.install(s.id,s.available);const [mod]=await f.store.mods();assert.equal(mod.defaultEnabled,false);assert.equal(mod.id,externalID('company','demo'));
 await fs.rename(f.source,f.source+'-offline');await f.store.refresh();assert.match((await f.store.snapshot())[0].error,/unavailable/);assert.equal((await f.store.mods()).length,1);
 const again=await new ModSources(f.data).load();assert.equal((await again.mods())[0].version,'1.0.0');
});
test('incomplete syncs and changed reviews cannot replace the last complete installed version',async t=>{
 const f=await fixture(t);await f.store.install('company',(await f.store.snapshot())[0].available);const old=f.store.source('company').installed;
 f.manifest.version='1.0.1';f.manifest.files['main.js'].sha256=digest('next');await f.save();await f.store.refresh();const next=(await f.store.snapshot())[0].available;
 await assert.rejects(f.store.install('company',next),/incomplete/);assert.equal(f.store.source('company').installed,old);
 await fs.writeFile(path.join(f.dir,'main.js'),'next');f.manifest.version='1.0.2';await f.save();await assert.rejects(f.store.install('company',next),/changed after review/);
 await f.store.refresh();await f.store.install('company',(await f.store.snapshot())[0].available);assert.equal((await f.store.mods())[0].version,'1.0.2');
 await f.store.rollback('company');assert.equal((await f.store.mods())[0].version,'1.0.0');await f.store.remove('company');assert.deepEqual(await f.store.mods(),[]);assert.ok(await fs.stat(f.source));
});
test('rejects escaped paths, symlinks, namespace collision and overlapping package paths',async t=>{
 const f=await fixture(t);await assert.rejects(f.store.add(f.source),/already registered/);
 for(const name of ['../secret','/tmp/secret','a/../../secret','a\\b'])assert.throws(()=>validatePackage({...f.manifest,renderer:{script:name},files:{[name]:{sha256:digest(''),executable:false}}}),/paths/);
 await fs.rename(path.join(f.dir,'main.js'),path.join(f.base,'outside.js'));await fs.symlink(path.join(f.base,'outside.js'),path.join(f.dir,'main.js'));
 await assert.rejects(f.store.install('company',(await f.store.snapshot())[0].available),/symlinks/);
 await fs.writeFile(path.join(f.source,'catalog.json'),JSON.stringify({schemaVersion:1,id:'company',name:'Company',mods:['mods/demo','mods/demo/nested']}));await assert.rejects(readSource(f.source),/Duplicate package path/);
});
test('runtime loads only enabled pinned packages, installs once, and disposes external DOM work',async t=>{
 const f=await fixture(t);await f.store.install('company',(await f.store.snapshot())[0].available);const mods=await f.store.mods(),runtimeDir=path.join(f.base,'runtime');await fs.mkdir(runtimeDir);
 assert.deepEqual(await loadExternalMods(runtimeDir),{modules:[],helpers:[]});
 const plan=await f.store.launchPlan({mods},[mods[0].id]);await fs.writeFile(path.join(runtimeDir,'external-mods.json'),JSON.stringify(plan));const external=await loadExternalMods(runtimeDir);assert.equal(external.modules.length,1);
 const sandbox={document:{body:{}},location:{origin:'https://app.slack.com',pathname:'/client/TEXAMPLE/D123'},window:null};sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(external.modules[0].code,sandbox);vm.runInContext(external.modules[0].code,sandbox);assert.equal(sandbox.ran,1);sandbox[external.modules[0].global].dispose();assert.equal(sandbox.cleaned,true);
 await fs.writeFile(path.join(mods[0].packageRoot,mods[0].packagePath,'main.js'),'changed');await assert.rejects(loadExternalMods(runtimeDir),/incomplete or changed/);
});
test('manager merges private mods without exposing executable manifests to the UI and keeps selection across restart',async t=>{
 const f=await fixture(t),root=path.resolve('.');const m=await new ClientManager({root,dataDir:f.data,request:async()=>{throw Error('offline');}}).init();
 await m.dispatch({op:'source-refresh'});await m.dispatch({op:'source-install',sourceId:'company',digest:(await m.sources.snapshot())[0].available});
 let snapshot=await m.snapshot(),mod=snapshot.apps[0].mods.find(m=>m.source);assert.ok(mod);assert.equal(mod.packageRoot,undefined);assert.equal(mod.manifest,undefined);assert.equal(snapshot.apps[0].selectedMods.includes(mod.id),false);
 await m.select({appId:'slack',modIds:['slack-quote-reply',mod.id]});const next=await new ClientManager({root,dataDir:f.data,request:async()=>{throw Error('offline');}}).init();assert.deepEqual(next.config.apps.slack.selected,['slack-quote-reply',mod.id]);
 await next.dispatch({op:'source-remove',sourceId:'company'});assert.deepEqual(next.config.apps.slack.selected,['slack-quote-reply']);await assert.rejects(next.startLocked('slack',{modIds:[mod.id]}),/Unknown mod/);
});
test('external dependencies are source-qualified; unsupported adapters and helpers cannot be enabled',async t=>{
 const f=await fixture(t);f.manifest.requires=['slack-triage'];await f.save();await f.store.refresh();await f.store.install('company',(await f.store.snapshot())[0].available);
 const [mod]=await f.store.mods();const app={mods:[{id:'slack-triage',platforms:['mac'],requires:[]},mod]};assert.deepEqual(resolveSelection(app,[mod.id]),['slack-triage',mod.id]);
 assert.throws(()=>resolveSelection({mods:[mod]},[mod.id]),/Unknown mod/);mod.unavailableReason='Unsupported adapter';assert.throws(()=>resolveSelection(app,[mod.id]),/Unsupported adapter/);
});
test('helpers must have a pinned Developer ID team and pass Gatekeeper; no shell evaluation',async t=>{
 const f=await fixture(t),calls=[],h={id:'native-tool',platform:'mac',arch:'arm64',teamId:'ABCDEFGHIJ',executable:'main.js',args:[]};
 await verifyHelper(f.dir,h,{platform:'darwin',arch:'arm64',run:async(bin,args)=>{calls.push([bin,args]);return {};}});
 assert.equal(calls[0][0],'/usr/bin/codesign');assert.ok(calls[0][1][calls[0][1].indexOf('--test-requirement')+1].startsWith('=anchor apple'));assert.ok(calls[0][1].join(' ').includes('certificate leaf[subject.OU] = "ABCDEFGHIJ"'));assert.equal(calls[1][0],'/usr/sbin/spctl');
 await assert.rejects(verifyHelper(f.dir,h,{platform:'darwin',arch:'arm64',run:async()=>{throw Error('bad signature');}}),/Gatekeeper/);
 await assert.rejects(verifyHelper(f.dir,h,{platform:'darwin',arch:'x64',run:async()=>assert.fail()}),/does not support/);
});

test('helper service declarations are explicit, unique and require a renderer',async t=>{
 const f=await fixture(t),helper={id:'catalog-service',platform:'mac',arch:'arm64',teamId:'ABCDEFGHIJ',executable:'main.js',args:[],service:{operations:['themes.list','theme.get']}};
 const valid={...f.manifest,files:{'main.js':{...f.manifest.files['main.js'],executable:true}},helpers:[helper]};assert.doesNotThrow(()=>validatePackage(valid));
 assert.throws(()=>validatePackage({...valid,renderer:undefined}),/service declaration/);
 assert.throws(()=>validatePackage({...valid,helpers:[helper,{...helper,id:'second'}]}),/duplicate helper service operation/);
 assert.throws(()=>validatePackage({...valid,helpers:[{...helper,service:{operations:['Bad operation']}}]}),/service operation/);
});

test('renderer package service API admits only declared bounded calls and resolves through its private response method',async()=>{
 const body=`window.servicePromise=api.service.request('themes.list',{query:'dark'});window.unsupported=api.service.request('themes.write',{}).catch(error=>error.message);`,manifest={id:'demo',version:'1.0.0',renderer:{script:'main.js'},files:{'main.js':{}}},files={'main.js':Buffer.from(body)},binding='__pmeTestService',responseMethod='respond_secret';let request;
 const sandbox={document:{body:{},head:{append(){}},createElement:()=>({})},location:{origin:'https://app.slack.com',pathname:'/client/TEXAMPLE/D123'},setTimeout,clearTimeout,window:null};sandbox.window=sandbox;sandbox[binding]=payload=>{request=JSON.parse(payload);};vm.createContext(sandbox);vm.runInContext(rendererSource(manifest,'__PME_EXTERNAL_TEST__',files,{binding,responseMethod,operations:['themes.list']}),sandbox);
 assert.equal(request.operation,'themes.list');assert.deepEqual(request.payload,{query:'dark'});sandbox.__PME_EXTERNAL_TEST__[responseMethod](JSON.stringify({id:request.id,ok:true,result:{themes:['Midnight']}}));assert.equal(JSON.stringify(await sandbox.servicePromise),JSON.stringify({themes:['Midnight']}));assert.equal(await sandbox.unsupported,'Unsupported private service operation');sandbox.__PME_EXTERNAL_TEST__.dispose();
});

test('mod loader binds each external service to the trusted Slack context and routes only its declared operation',async t=>{
 const f=await fixture(t);f.store.helperVerifier=async()=>{};f.manifest.files['main.js'].executable=true;f.manifest.helpers=[{id:'catalog-service',platform:'mac',arch:'arm64',teamId:'ABCDEFGHIJ',executable:'main.js',args:[],service:{operations:['themes.list']}}];await f.save();await f.store.refresh();await f.store.install('company',(await f.store.snapshot())[0].available);const mods=await f.store.mods(),runtimeDir=path.join(f.base,'runtime');await fs.mkdir(runtimeDir);await fs.writeFile(path.join(runtimeDir,'external-mods.json'),JSON.stringify(await f.store.launchPlan({mods},[mods[0].id])));const bundled=JSON.parse(await fs.readFile('mods/runtime.json','utf8'));await fs.writeFile(path.join(runtimeDir,'mods.json'),JSON.stringify({disabled:bundled.modules.map(module=>module.id)}));
 const calls=[],requests=[],cdp=new EventEmitter();cdp.send=async(method,params,sessionId)=>{calls.push({method,params,sessionId});return method==='Page.addScriptToEvaluateOnNewDocument'?{identifier:'script'}:{};};cdp.evaluate=async(expression,sessionId)=>{calls.push({expression,sessionId});if(expression.includes('slackPage:'))return {slackPage:true,dom:true,windowBridge:false,sessionConfig:false,documentToken:1,assets:[]};if(expression.startsWith('!!window'))return true;return null;};const context={id:7,uniqueId:'trusted-7'},contextGuard={current:()=>context,allows:message=>message.params.executionContextId===context.id};let disposed=false;
 const loader=await createModLoader({cdp,contextGuard,root:path.resolve('.'),runtimeDir,slackVersion:'test',startHelpers:async({helpers})=>{assert.deepEqual(helpers[0].service.operations,['themes.list']);return {status:()=>[],request:async(modId,operation,payload)=>{requests.push({modId,operation,payload});return {themes:['Midnight']};},dispose:async()=>{disposed=true;}};}}),entry={sessionId:'page',url:'https://app.slack.com/client/TEXAMPLE/D123'};await loader.reconcile(entry);const binding=calls.find(call=>call.method==='Runtime.addBinding')?.params.name;assert.ok(binding);
 cdp.emit('event',{method:'Runtime.bindingCalled',sessionId:'page',params:{name:binding,executionContextId:7,payload:JSON.stringify({id:'request-1',operation:'themes.list',payload:{query:'dark'}})}});await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(requests,[{modId:mods[0].id,operation:'themes.list',payload:{query:'dark'}}]);assert.ok(calls.some(call=>call.expression?.includes('Midnight')));
 cdp.emit('event',{method:'Runtime.bindingCalled',sessionId:'page',params:{name:binding,executionContextId:8,payload:JSON.stringify({id:'request-2',operation:'themes.list',payload:{}})}});await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.length,1);await loader.dispose(new Map([['page',entry]]));assert.equal(disposed,true);
});

test('bundled and external renderer lifecycles coexist without enabling the triage suite',async t=>{
 const f=await fixture(t);await f.store.install('company',(await f.store.snapshot())[0].available);const mods=await f.store.mods(),runtimeDir=path.join(f.base,'runtime');await fs.mkdir(runtimeDir);
 await fs.writeFile(path.join(runtimeDir,'external-mods.json'),JSON.stringify(await f.store.launchPlan({mods},[mods[0].id])));
 const bundled=JSON.parse(await fs.readFile('mods/runtime.json','utf8'));await fs.writeFile(path.join(runtimeDir,'mods.json'),JSON.stringify({disabled:bundled.modules.filter(m=>m.id!=='quote-reply').map(m=>m.id)}));
 const calls=[];const cdp={send:async(method,params)=>{calls.push({method,params});return {identifier:String(calls.length)};},evaluate:async code=>{calls.push({code});if(code.includes('slackPage:'))return {slackPage:true,dom:true};if(code.startsWith('!!window'))return false;}};
 const loader=await createModLoader({cdp,root:process.cwd(),runtimeDir,slackVersion:'test'}),entry={sessionId:'test'};await loader.reconcile(entry);
 const state=loader.status().pages[0].modules;assert.equal(state[mods[0].id],'active');assert.equal(state['quote-reply'],'active');assert.equal(state['triage-surface'],'disabled');
 await loader.dispose(new Map([['test',entry]]));assert.equal(calls.filter(c=>c.method==='Page.removeScriptToEvaluateOnNewDocument').length,2);
});
