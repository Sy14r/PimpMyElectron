import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
const lookup=source.slice(source.indexOf('  async function findMissingConversation('),source.indexOf('  function focus('));
function fixture({overlay=false,workspace=true,inputTeam='TONE',editable=true,results=['UOTHER','USLACKBOT'],channelId='DONE',peer='USLACKBOT',change}={}){
  let now=0,opened=0,closed=0,inserted=0,waits=0;const clicked=[];
  const modal={isConnected:true,querySelector:()=>({click(){closed++;}}),querySelectorAll:selector=>{assert.ok(selector.includes(`data-type="${channelId.startsWith('D')?'member':'channel'}"`));return results.map(id=>({getAttribute:()=>id,click(){clicked.push(id);}}));}};
  const field={isContentEditable:editable,textContent:'',getAttribute:()=>inputTeam,closest:()=>modal,focus(){env.document.activeElement=field;}};
  const env={target:{channelId,peer,workspaceId:'TONE',key:'TONE:DONE:',name:'Slackbot'},generation:1,disposed:false,active:true,cancelLookup:null,
    inWorkspace:()=>workspace,overlayOpen:()=>overlay,MouseEvent:class {constructor(type){this.type=type;}},Date:{now:()=>now},
    window:{getSelection:()=>({removeAllRanges(){},addRange(){}})},
    document:{querySelector(selector){return selector.includes('top_nav_search')?{dispatchEvent(e){assert.equal(e.type,'mousedown');opened++;}}:field;},
      createRange:()=>({selectNodeContents(){}}),execCommand(command,ui,text){assert.equal(command,'insertText');inserted++;field.textContent=text;return true;}},
    async waitForNativeChange(){waits++;now+=150;change?.({env,field,modal,waits});}};
  vm.runInNewContext(lookup,env);
  return {env,field,modal,run:()=>env.findMissingConversation(1),counts:()=>({opened,closed,inserted,waits}),clicked};
}

test('missing DM lookup waits for native editor and selects the cached member, not the first same-name result',async()=>{
  const f=fixture({editable:false,change:({field})=>{field.isContentEditable=true;}});
  assert.equal(await f.run(),true);assert.deepEqual(f.clicked,['USLACKBOT']);
  assert.deepEqual(f.counts(),{opened:1,closed:0,inserted:1,waits:1});assert.equal(f.env.cancelLookup,null);
});
test('missing DM lookup leaves an existing overlay and a different workspace untouched',async()=>{
  for(const options of [{overlay:true},{workspace:false}]){const f=fixture(options);assert.equal(await f.run(),false);assert.equal(f.counts().opened,0);}
  const f=fixture({inputTeam:'TTWO'});assert.equal(await f.run(),false);assert.equal(f.counts().inserted,0);assert.deepEqual(f.clicked,[]);
});
test('missing DM lookup never selects a different member and closes its own search after a bounded wait',async()=>{
  const f=fixture({results:['UOTHER']});assert.equal(await f.run(),false);assert.deepEqual(f.clicked,[]);
  assert.equal(f.counts().opened,1);assert.equal(f.counts().inserted,1);assert.equal(f.counts().closed,1);assert.equal(f.counts().waits,20);
});
test('superseded or cancelled lookup cannot navigate when results arrive',async()=>{
  for(const supersede of [true,false]){
    const results=[];const f=fixture({results,change:({env})=>{if(supersede)env.generation++;else env.cancelLookup();results.push('USLACKBOT');}});
    assert.equal(await f.run(),false);assert.deepEqual(f.clicked,[]);assert.equal(f.env.cancelLookup,null);
  }
});
test('user edits to the search query stop lookup without closing their search',async()=>{
  const results=[];const f=fixture({results,change:({field})=>{field.textContent='another person';results.push('USLACKBOT');}});
  assert.equal(await f.run(),false);assert.deepEqual(f.clicked,[]);assert.equal(f.counts().closed,0);
});


test('missing channel lookup selects its exact ID rather than another same-name channel',async()=>{
 for(const channelId of ['CCHANNEL','GPRIVATE']){
  const f=fixture({channelId,peer:null,results:['COTHER',channelId]});
  assert.equal(await f.run(),true);assert.deepEqual(f.clicked,[channelId]);
  assert.equal(f.counts().opened,1);assert.equal(f.counts().inserted,1);
 }
});
test('missing channel lookup never navigates to a mismatched channel',async()=>{
 const f=fixture({channelId:'CCHANNEL',peer:null,results:['COTHER']});
 assert.equal(await f.run(),false);assert.deepEqual(f.clicked,[]);assert.equal(f.counts().closed,1);
});
