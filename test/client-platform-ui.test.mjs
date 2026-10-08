import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
test('mod list hides incompatible mods by default and shows them disabled when requested',async()=>{
 const root={innerHTML:'',querySelector:()=>null,addEventListener(){}},toast={classList:{add(){},remove(){}}};
 const ctx=vm.createContext({document:{querySelector:s=>s==='#app'?root:toast},window:{webkit:{messageHandlers:{pme:{postMessage(){}}}}},setInterval(){},setTimeout(){return 1;},clearTimeout(){},Map,Set});
 vm.runInContext(await fs.readFile(new URL('../client/ui/app.js',import.meta.url),'utf8'),ctx);
 ctx.fixture={id:'spotify',name:'Spotify',description:'Music',shortcuts:[],installations:[],selectedMods:[],runtime:{running:false},mods:[{id:'portable',name:'Portable mod',version:'1',author:'Test',platforms:['global'],compatible:true,features:[]},{id:'win',name:'Windows-only mod',version:'1',author:'Test',platforms:['windows'],compatible:false,compatibilityReason:'Requires Windows',features:[]}]};
 const hidden=vm.runInContext('busy=false;appView(fixture)',ctx);
 assert.match(hidden,/Portable mod/);assert.doesNotMatch(hidden,/Windows-only mod/);assert.match(hidden,/Show incompatible/);
 const visible=vm.runInContext('showIncompatible=true;appView(fixture)',ctx);
 assert.match(visible,/Windows-only mod/);assert.match(visible,/Requires Windows/);assert.match(visible,/data-mod="win" disabled/);assert.match(visible,/All platforms/);
});

test('Slack Companion has an independent switch and explains its Triage tradeoff',async()=>{
 const root={innerHTML:'',querySelector:()=>null,addEventListener(){}},toast={classList:{add(){},remove(){}}};
 const ctx=vm.createContext({document:{querySelector:s=>s==='#app'?root:toast},window:{webkit:{messageHandlers:{pme:{postMessage(){}}}}},setInterval(){},setTimeout(){return 1;},clearTimeout(){},Map,Set});
 vm.runInContext(await fs.readFile(new URL('../client/ui/app.js',import.meta.url),'utf8'),ctx);
 ctx.fixture={id:'slack',name:'Slack',description:'Chat',shortcuts:[],installations:[],selectedMods:['slack-triage'],companionEnabled:true,runtime:{running:false,triageEnabled:true,companionEnabled:false},mods:[]};
 let html=vm.runInContext('busy=false;appView(fixture)',ctx);assert.match(html,/Slack Companion/);assert.match(html,/data-companion/);assert.match(html,/aria-checked="true"/);assert.match(html,/Starts with Slack/);
 ctx.fixture.companionEnabled=false;html=vm.runInContext('appView(fixture)',ctx);assert.match(html,/aria-checked="false"/);assert.match(html,/>Off</);assert.match(html,/global shortcuts, previews, and native backdrop integration are unavailable/);
 ctx.fixture.companionEnabled=true;ctx.fixture.runtime={running:true,triageEnabled:true,companionEnabled:true};html=vm.runInContext('appView(fixture)',ctx);assert.match(html,/Running with Slack/);assert.match(html,/companion-settings/);
});

test('Slack app puts settings portability after shortcut management and supports exact undo',async()=>{
 const source=await fs.readFile(new URL('../client/ui/app.js',import.meta.url),'utf8'),native=await fs.readFile(new URL('../client/native/Client.swift',import.meta.url),'utf8');
 for(const fragment of ['Slack settings portability','Export settings…','Import settings…','Preview changes','settings-preview','settings-import','settings-undo','Undo last bulk change','profiles, paths, accounts, workspaces, messages, activity, or credentials'])assert.ok(source.includes(fragment),`missing settings transfer UI: ${fragment}`);
 for(const removed of ['Optional PME setup recipes','openPresetHelp','data-preset','openSettingsPreset','settings-preset-preview','settings-preset-apply'])assert.equal(source.includes(removed),false,`removed setup recipe remains in UI: ${removed}`);
 const appView=source.slice(source.indexOf('function appView'),source.indexOf('function aboutOverview'));assert.ok(appView.indexOf('Manage shortcuts')<appView.indexOf('Slack settings portability'),'settings portability must follow shortcut management');
 for(const fragment of ['"settings-export"','"settings-preview"','"settings-import"','"settings-undo"','text.utf8.count<=30000'])assert.ok(native.includes(fragment),`missing settings transfer bridge: ${fragment}`);
 for(const removed of ['"settings-preset-preview"','"settings-preset-apply"','Invalid productivity preset'])assert.equal(native.includes(removed),false,`removed setup recipe remains in native bridge: ${removed}`);
});

test('every bundled mod has complete card copy, a dedicated preview, and rich detail content',async()=>{
 const catalog=JSON.parse(await fs.readFile(new URL('../client/catalog.json',import.meta.url),'utf8')),source=await fs.readFile(new URL('../client/ui/app.js',import.meta.url),'utf8'),previews=new Set();
 for(const app of catalog.apps)for(const mod of app.mods){assert.ok(mod.summary?.length>=20,`${mod.id} needs a useful summary`);assert.ok(mod.description?.length>=40,`${mod.id} needs a detailed description`);assert.ok(mod.access?.length>=40,`${mod.id} needs an access explanation`);assert.ok(mod.features?.length>=3,`${mod.id} needs representative features`);assert.ok(mod.preview,`${mod.id} needs a preview`);previews.add(mod.preview);}
 assert.equal(previews.size,catalog.apps.flatMap(app=>app.mods).length,'bundled previews should be purpose-built rather than reused');
 for(const fragment of ['m.summary||m.description','modPreview(m)','openModDetails','What it does','Configure and use it','Data and access','setting-summary'])assert.ok(source.includes(fragment),`missing rich mod presentation: ${fragment}`);
});
