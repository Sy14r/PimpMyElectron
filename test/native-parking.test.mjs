import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
const start=source.indexOf('  function activityDetailMounted('),end=source.indexOf('  function locateSearch(',start);
function setup({activity=false,remembered=true,closeAvailable=true,tabAvailable=true,cancel=false}={}){
 let now=1,route=activity?'activity-inbox':'CONE',detail=true,clicks=0,closes=0;
 const view={isConnected:true},title={closest:()=>view};
 const env={generation:0,active:false,disposed:false,parkingState:'idle',inWorkspace:()=>true,path:()=>['','client','TONE',route],notify(){},
   suspend(){env.generation++;},Date:{now:()=>now},pause:async ms=>{now+=ms;if(cancel)env.generation++;},
   document:{body:{setAttribute(){},removeAttribute(){}},querySelector(selector){
     if(selector==='[data-qa="tab_rail_activity_button"]')return tabAvailable?{click(){clicks++;route='activity-inbox';detail=remembered;}}:null;
     if(selector==='[data-qa="activity-inbox-sidebar-header-title"]')return route==='activity-inbox'?title:null;
     if(selector.startsWith('.p-view_contents--primary'))return route==='activity-inbox'&&detail&&closeAvailable?{click(){closes++;detail=false;}}:null;
     return selector.startsWith('[data-qa="message_input"]')&&detail?{}:null;
   }}};
 vm.runInNewContext(source.slice(start,end),env);
 return {env,state:()=>({route,detail,clicks,closes})};
}
test('parking closes the conversation remembered inside Activity, rather than merely changing tabs',async()=>{
 const f=setup();assert.equal((await f.env.park()).ok,true);
 assert.deepEqual(f.state(),{route:'activity-inbox',detail:false,clicks:1,closes:1});assert.equal(f.env.parkingState,'parked');
 assert.ok(f.env.locateActivity());await f.env.park();assert.equal(f.state().clicks,1);assert.equal(f.state().closes,1);
});
test('parking an already selected Activity tab still closes its remembered detail',async()=>{
 const f=setup({activity:true});assert.equal(f.env.locateActivity(),null);await f.env.park();
 assert.equal(f.state().clicks,0);assert.equal(f.state().closes,1);assert.ok(f.env.locateActivity());
});
test('missing native controls fail explicitly and never claim a conversation is safely parked',async()=>{
 for(const options of [{closeAvailable:false},{tabAvailable:false}]){
  const f=setup(options),result=await f.env.park();assert.equal(result.ok,false);assert.match(result.error,/could not leave/);
  assert.equal(f.env.parkingState,'failed');assert.equal(f.env.locateActivity(),null);
 }
});
test('a newer navigation cancels parking before it closes the newly selected detail',async()=>{
 const f=setup({cancel:true});const result=await f.env.park();assert.equal(result.cancelled,true);assert.equal(f.state().closes,0);
});

test('compact navigation uses Slack’s Activity entry in More when the rail button is absent',async()=>{
 const f=setup({tabAvailable:false}),query=f.env.document.querySelector;let more=false;
 f.env.document.querySelector=s=>s==='[data-qa="tab_rail_browse_button"]'?{click(){more=true;}}:
  s==='[data-qa="menu_item_button"][aria-describedby="activity-description"]'&&more?{click(){
   // Reuse the real simulated native tab destination, now exposed by More.
   const next=setup({activity:true,remembered:false});
   f.env.document.querySelector=next.env.document.querySelector;f.env.path=next.env.path;
  }}:query(s);
 const result=await f.env.park();assert.equal(more,true);assert.equal(result.ok,true);
});


test('already parked Activity does not suspend or wait again unless a conversation reappears',async()=>{
 const f=setup();await f.env.park();const generation=f.env.generation;
 f.env.pause=async()=>{throw Error('unexpected timer while already parked');};
 assert.equal((await f.env.park()).ok,true);assert.equal(f.env.generation,generation);
 // A stale parked flag alone is not sufficient: verify the mounted surface.
 const stale=setup({activity:true});stale.env.parkingState='parked';
 await stale.env.park();assert.equal(stale.state().closes,1);
});
