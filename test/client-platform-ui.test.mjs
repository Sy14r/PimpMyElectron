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
