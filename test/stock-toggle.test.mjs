import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  async function command('),source.indexOf('  function schedulePillCollapse('));
function setup({mode='stock',visible=true,minimized=false}={}){
 const calls=[],env={mode,nativeQueue:Promise.resolve(),resumeReply:false,desktop:{window:{getWindowId:async()=>7,callBrowserWindowMethod:async(id,method)=>{assert.equal(id,7);calls.push(method);if(method==='isVisible')return visible;if(method==='isMinimized')return minimized;if(method==='hide')visible=false;if(method==='show')visible=true;if(method==='restore')minimized=false;}}},reportShell:value=>calls.push(['report',!!value]),touch(){},transition:async next=>{calls.push(['transition',next]);env.mode=next;},restMode:()=>'strip'};
 vm.runInNewContext(code,env);return {env,calls};
}
test('normal Slack toggle hides without switching mode, then restores and focuses the same window',async()=>{
 const f=setup();const hidden=await f.env.command('stock-toggle');assert.equal(hidden.mode,'stock');assert.equal(hidden.returnFocus,true);assert.equal(f.env.mode,'stock');assert.ok(f.calls.includes('hide'));assert.equal(f.calls.includes('focus'),false);
 f.calls.length=0;const shown=await f.env.command('stock-toggle');assert.equal(shown.returnFocus,false);assert.ok(f.calls.includes('show'));assert.ok(f.calls.includes('focus'));assert.equal(f.calls.includes('hide'),false);
});
test('minimized normal Slack is restored, never hidden again',async()=>{
 const f=setup({minimized:true});await f.env.command('stock-toggle');assert.ok(f.calls.indexOf('restore')<f.calls.indexOf('show'));assert.ok(f.calls.includes('focus'));assert.equal(f.calls.includes('hide'),false);
});
test('every triage mode restores normal Slack first',async()=>{
 for(const mode of ['queue','reply','reading','cluster','strip','hidden']){const f=setup({mode});await f.env.command('stock-toggle');assert.equal(f.env.mode,'stock');assert.deepEqual(f.calls[0],['transition','stock']);assert.ok(f.calls.includes('focus'));assert.equal(f.calls.includes('hide'),false);}
});
const start=source.indexOf("  window.addEventListener('keydown',event=>{"),end=source.indexOf('},{capture:true,signal:abort.signal});',start)+'},{capture:true,signal:abort.signal});'.length;
test('focused-window shortcut fallback is suppressed while the global helper owns the key',()=>{
 let listener;const calls=[],env={document:{addEventListener(){}},settings:{},mode:'stock',snapshot:{nativeStockHotkey:false},window:{addEventListener:(_,fn)=>listener=fn},abort:{signal:{}},aliasDialog:{open:false},workspaceDialog:{open:false},densityMenu:{matches:()=>false},composeToggleKey:()=>false,inboxNavigationKey:()=>false,triageNavigationKey(){},command:op=>calls.push(op)};
 vm.runInNewContext(source.slice(source.indexOf('  function shortcutMatches('),end),env);
 const key=patch=>({key:'U',code:'KeyU',metaKey:true,shiftKey:true,preventDefault(){this.prevented=true;},stopImmediatePropagation(){},...patch});
 const event=key();listener(event);assert.equal(event.prevented,true);assert.deepEqual(calls,['stock-toggle']);listener(key({repeat:true}));assert.equal(calls.length,1);
 env.snapshot.nativeStockHotkey=true;listener(key());assert.equal(calls.length,1);
 env.snapshot.nativeStockHotkey=false;env.settings.stockShortcut='ctrl-option-space';listener(key());assert.equal(calls.length,1);
 listener(key({key:' ',code:'Space',metaKey:false,shiftKey:false,ctrlKey:true,altKey:true}));assert.equal(calls.at(-1),'stock-toggle');assert.equal(calls.length,2);
 env.settings.shortcut='option-space';listener(key({key:' ',code:'Space',metaKey:false,shiftKey:false,altKey:true}));assert.equal(calls.at(-1),'toggle');

});
