import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
const parser=source.slice(source.indexOf('  function slackLinkDestination('),source.indexOf('  function linkAction('));
const triage=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const handler=triage.slice(triage.indexOf('  async function nativeLinkAction('),triage.indexOf("  window.addEventListener('pme-native-link-action'"));
test('empty Slack popup remnants do not block shortcuts but visible dialogs do',()=>{
  const fn=source.slice(source.indexOf('  function overlayOpen('),source.indexOf('  function findAuxiliary('));
  for(const [size,expected] of [[0,false],[2,false],[200,true]]){
    const env={conversationMenu:null,document:{querySelectorAll:()=>[{getBoundingClientRect:()=>({width:size,height:size})}]}};
    vm.runInNewContext(fn,env);assert.equal(env.overlayOpen(),expected);
    env.conversationMenu={};assert.equal(env.overlayOpen(),true);
  }
});
function parse(href,timestamp=false,inThread=timestamp){
  const env={URL,location:{href:'https://app.slack.com/client/TONE/DONE'},localStorage:{getItem:()=>JSON.stringify({teams:{one:{id:'TONE',url:'https://one.slack.com/'},two:{id:'TTWO',url:'https://two.slack.com/'}}})}};
  vm.runInNewContext(parser,env);
  return JSON.parse(JSON.stringify(env.slackLinkDestination({getAttribute:()=>href,hasAttribute:()=>timestamp,closest:()=>inThread?{}:null})));
}
test('Slack links resolve their signed-in workspace, exact channel, thread and message timestamp',()=>{
  assert.deepEqual(parse('https://two.slack.com/archives/CTWO/p1789733544991389?thread_ts=1789733536.233259'),{workspaceId:'TTWO',channelId:'CTWO',threadTs:'1789733536.233259',messageTs:'1789733544.991389'});
  assert.deepEqual(parse('https://one.slack.com/archives/CONE'),{workspaceId:'TONE',channelId:'CONE',threadTs:null,messageTs:null});
  assert.deepEqual(parse('https://app.slack.com/client/TONE/DONE'),{workspaceId:'TONE',channelId:'DONE',threadTs:null,messageTs:null});
});
test('native timestamp links preserve Open in channel semantics instead of reopening their thread',()=>{
  const destination=parse('https://one.slack.com/archives/DONE/p1789733544991389?thread_ts=1789733536.233259',true);
  assert.equal(destination.threadTs,null);assert.equal(destination.messageTs,'1789733544.991389');
});
test('search timestamps keep the thread destination even though they carry data-ts',()=>{
  const result=parse('https://one.slack.com/archives/DONE/p1789733544991389?thread_ts=1789733536.233259',true,false);
  assert.equal(result.threadTs,'1789733536.233259');
});
test('unknown workspaces, lookalike hosts, non-Slack links, member profiles and malformed targets remain native',()=>{
  for(const href of ['https://one.slack.com.evil.test/archives/CONE','http://one.slack.com/archives/CONE','https://one.slack.com:123/archives/CONE','https://user@one.slack.com/archives/CONE','https://unknown.slack.com/archives/CONE','https://app.slack.com/client/TUNKNOWN/CONE','https://one.slack.com/team/UONE','https://one.slack.com/files/UONE/FONE','https://one.slack.com/archives/CONE/pBAD','https://one.slack.com/archives/CONE?thread_ts=bad'])assert.equal(parse(href),null,href);
});
test('known message links preserve native message positioning; unknown conversations replay the original native navigation',async()=>{
  for(const cached of [true,false]){
    const opened=[],navigate=()=>{},target={key:'TONE:DONE:',workspaceId:'TONE',channelId:'DONE'};
    const env={mode:'reply',window:{__PME_REPLY__:{status:()=>({ready:true,target})}},items:()=>cached?[{workspaceId:'TONE',channelId:'CONE',key:'TONE:CONE:',name:'Channel',peer:undefined}]:[],notificationItems:()=>[],startReply:async(item,options)=>opened.push({item,options})};
    vm.runInNewContext(handler,env);
    const event={detail:{sourceKey:target.key,navigate,destination:{workspaceId:'TONE',channelId:'CONE',threadTs:null,messageTs:'100.000001'}}};
    await env.nativeLinkAction(event);assert.equal(opened.length,1);assert.equal(opened[0].item.messageTs,'100.000001');assert.equal(opened[0].options.preservePosition,true);
    assert.equal(opened[0].options.nativeNavigate,cached?null:navigate);assert.equal(opened[0].options.focusAfter,'messages');
    event.detail.sourceKey='stale';await env.nativeLinkAction(event);assert.equal(opened.length,1);
  }
});
test('native search metadata preserves a reply’s exact thread only when workspace, channel and timestamp agree',()=>{
 const env={};vm.runInNewContext(source.slice(source.indexOf('  function searchResultDestination('),source.indexOf('  function linkAction(')),env);
 const destination={workspaceId:'TONE',channelId:'CONE',messageTs:'200.000001',threadTs:null};
 const props={teamId:'TONE',channel:{id:'CONE'},msg:{ts:'200.000001',thread_ts:'100.000001'}};
 const result={__reactFiber$test:{memoizedProps:props}},anchor={closest:()=>result};
 assert.equal(env.searchResultDestination(anchor,destination).threadTs,'100.000001');
 for(const change of [{teamId:'TTWO'},{channel:{id:'COTHER'}},{msg:{ts:'201.000001',thread_ts:'100.000001'}}]){
 result.__reactFiber$test.memoizedProps={...props,...change};assert.equal(env.searchResultDestination(anchor,destination).threadTs,null);
 }
});
test('full-search result bodies and reply bars enter the same verified navigation path while profile buttons stay native',()=>{
 const events=[],destination={workspaceId:'TONE',channelId:'CONE',messageTs:'200.000001',threadTs:'100.000001'},anchor={hasAttribute:()=>false,getAttribute:()=>'/archives/CONE'};
 const row={querySelector:()=>anchor};let control='body';
 const node={closest:s=>s==='a[href]'?null:s==='[data-qa="reply_bar"]'?(control==='reply'?{}:null):s==='button,a,[role="button"]'?(control==='profile'?{}:null):s==='[data-qa="search_result"]'?row:null};
 const env={active:true,state:'ready',target:{kind:'search',key:'TONE:search'},auxiliary:null,pane:{contains:()=>true},auxiliaryReady:()=>false,verifiedPane:()=>true,slackLinkDestination:()=>destination,searchResultDestination:(_a,d)=>d,window:{__PME_TRIAGE__:{status:()=>({mode:'reply'})},dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}}};
 vm.runInNewContext(source.slice(source.indexOf('  function linkAction('),source.indexOf('  function threadAction(')),env);
 const event=()=>({type:'click',target:node,preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(env.linkAction(event()),true);control='reply';assert.equal(env.linkAction(event()),true);control='profile';assert.equal(env.linkAction(event()),false);
 assert.equal(events.length,2);assert.equal(events[1].detail.destination.threadTs,'100.000001');
});
