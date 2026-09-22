import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function profileAction('),source.indexOf('  function threadAction('));
function setup(){
 const calls=[],events=[],close={click:()=>calls.push('close')},section={key:'UPEER:section:RECENT-recent-dms',memoizedProps:{section:{},memberId:'UPEER'}},link={key:'DONE',memoizedProps:{onClick:()=>calls.push('navigate')},return:section};
 const button={disabled:false,__reactFiber$test:link};const pane={isConnected:true,contains:b=>b===button,querySelector:()=>close};
 const env={active:true,state:'ready',auxiliary:{kind:'profile'},auxiliaryReady:()=>true,inWorkspace:()=>true,target:{key:'TONE:CONE:',workspaceId:'TONE'},pane,
 window:{__PME_TRIAGE__:{status:()=>({mode:'reply'})},dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}}};
 vm.runInNewContext(code,env);
 const event=extra=>({type:'click',target:{closest:()=>button},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
 return {env,calls,events,button,link,section,pane,event};
}
test('Recent DMs becomes an explicit destination; uncached replay closes the profile before invoking native navigation once',()=>{
 const e=setup(),click=e.event();assert.equal(e.env.profileAction(click),true);assert.ok(click.prevented&&click.stopped);assert.deepEqual(e.calls,[]);
 const request=e.events[0].detail;assert.equal(e.events[0].type,'pme-native-link-action');assert.equal(request.sourceKey,'TONE:CONE:');assert.equal(request.destination.workspaceId,'TONE');assert.equal(request.destination.channelId,'DONE');
 request.navigate();assert.deepEqual(e.calls,['close','navigate']);assert.throws(()=>request.navigate());
});
test('profile navigation never guesses names or intercepts unrelated controls and modified clicks',()=>{
 for(const mutate of [e=>{e.link.key='geoff';},e=>{e.section.key='unrelated';},e=>{e.section.memoizedProps.memberId='invalid';},e=>{e.env.auxiliary.kind='search';},e=>{e.env.auxiliaryReady=()=>false;},e=>{e.button.disabled=true;},e=>{e.env.window.__PME_TRIAGE__.status=()=>({mode:'stock'});},e=>{e.pane.contains=()=>false;}]){
  const e=setup();mutate(e);assert.equal(e.env.profileAction(e.event()),false);assert.equal(e.events.length,0);
 }
 for(const extra of [{metaKey:true},{ctrlKey:true},{altKey:true},{shiftKey:true},{button:2},{defaultPrevented:true}]){const e=setup();assert.equal(e.env.profileAction(e.event(extra)),false);}
});
test('a detached profile or changed workspace cannot replay its navigation',()=>{
 for(const mutate of [e=>{e.pane.isConnected=false;},e=>{e.env.inWorkspace=()=>false;}]){const e=setup();e.env.profileAction(e.event());mutate(e);assert.throws(()=>e.events[0].detail.navigate());assert.deepEqual(e.calls,[]);}
});
