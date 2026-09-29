import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('  const stockBoundsKey='),source.indexOf('  let lastObservation ='));
function fixture(storage=new Map()){
 const env={localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},mode:'stock',original:null,disposed:false,startupResult:{ok:true},transitionEpoch:0,window:{}};
 vm.runInNewContext(helpers,env);return {env,storage};
}
test('full Slack geometry survives a new renderer and rejects corrupt or pill-sized values',()=>{
 const f=fixture(),bounds={x:-1100,y:40,width:1000,height:780};f.env.saveStockBounds(bounds);
 const next=fixture(f.storage);assert.deepEqual(JSON.parse(JSON.stringify(next.env.storedStockBounds())),bounds);
 for(const b of [{x:0,y:0,width:12,height:100},{...bounds,x:Infinity},{...bounds,width:'1000'}])next.env.saveStockBounds(b);
 assert.deepEqual(JSON.parse(JSON.stringify(next.env.storedStockBounds())),bounds);
 f.storage.set('__pme_stock_bounds_v1','invalid');assert.equal(next.env.storedStockBounds(),null);
});
test('restoring after a monitor disconnect keeps the full window on a connected work area',()=>{
 const f=fixture(),area={x:0,y:25,width:1440,height:875};
 const bounds=f.env.fitStockBounds({x:-1800,y:40,width:1600,height:1000},[{workArea:area}]);
 assert.deepEqual(JSON.parse(JSON.stringify(bounds)),{x:0,y:25,width:1440,height:875});
 const left={x:-1440,y:0,width:1440,height:900},position={x:-1200,y:30,width:900,height:700};
 assert.deepEqual(JSON.parse(JSON.stringify(f.env.fitStockBounds(position,[{workArea:area},{workArea:left}]))),position);
});
test('late native measurements cannot overwrite saved geometry after triage opens',async()=>{
 const f=fixture();let finish;f.env.window.desktop={window:{getWindowId:async()=>1,callBrowserWindowMethod:()=>new Promise(r=>finish=r)}};
 const pending=f.env.rememberStockBounds();await new Promise(r=>setImmediate(r));f.env.mode='queue';f.env.transitionEpoch++;
 finish({x:0,y:0,width:420,height:900});await pending;assert.equal(f.env.storedStockBounds(),null);
});

test('a settled native full-window measurement is saved before shutdown',async()=>{
 const f=fixture(),bounds={x:230,y:140,width:940,height:740};f.env.window.desktop={window:{getWindowId:async()=>1,callBrowserWindowMethod:async()=>bounds}};
 await f.env.rememberStockBounds();assert.deepEqual(JSON.parse(JSON.stringify(f.env.storedStockBounds())),bounds);
});
