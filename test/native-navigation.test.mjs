import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../src/renderer/native-navigation.js',import.meta.url),'utf8');
const bootstrapSource=await fs.readFile(new URL('../src/renderer/reply-window-bootstrap.js',import.meta.url),'utf8');

function setup({popupAllowed=true,softRoute=false}={}){
 const sidebar={},row={id:'virtual-row',getAttribute:key=>key==='data-item-key'?'channel-DTARGET':null,querySelector:()=>null};
 let clicks=0,focused=false,detachedFocused=false,childFocused=false,childClicks=0,childClosed=false,softClicks=0,activeChild='DTARGET';const opened=[],routes=[],forwarders=[],windowCalls=[];
 const channel={isConnected:true,getAttribute:key=>key==='data-qa-channel-sidebar-channel-id'?'DTARGET':key==='aria-label'?'Target person':null,closest(selector){if(selector==='[data-qa="channel-sidebar"]')return sidebar;if(selector==='[data-qa="virtual-list-item"]')return row;return null;},querySelector(selector){return selector.startsWith('.p-channel_sidebar__name')?{textContent:'Target person'}:null;},click(){clicks++;}};
 const wrong={...channel,getAttribute:key=>key==='data-qa-channel-sidebar-channel-id'?'DWRONG':null,click(){throw Error('wrong destination clicked');}};
 const child={closest:selector=>selector==='[data-qa="channel-sidebar-channel"]'?channel:null};
 const view={isConnected:true};
 const editor={isConnected:true,closest:selector=>selector==='.p-view_contents'?view:null,focus(){focused=true;document.activeElement=editor;}};
 const wrongEditor={isConnected:true,closest:selector=>selector==='.p-view_contents'?view:null,focus(){throw Error('wrong composer focused');}};
 const box=(id,input)=>({getAttribute:key=>key==='data-channel-id'?id:null,querySelector:()=>input});
 const detachedEditor={isConnected:true,focus(){detachedFocused=true;}},detachedSecondEditor={isConnected:true,focus(){detachedFocused=true;}};
 const popupSidebar={},popupChannel={isConnected:true,getAttribute:key=>key==='data-qa-channel-sidebar-channel-id'?'DSECOND':null,closest(selector){return selector==='[data-qa="channel-sidebar"]'?popupSidebar:null;},click(){childClicks++;activeChild='DSECOND';popupLocation.pathname='/client/TONE/DSECOND';}};
 const popupDocument={body:{append(){}},createElement(){if(!softRoute)throw Error('soft routing unavailable');return {href:'',hidden:false,setAttribute(){},click(){softClicks++;popupLocation.href=this.href;popupLocation.pathname=new URL(this.href).pathname;activeChild=popupLocation.pathname.split('/').filter(Boolean).at(-1);},remove(){}};},querySelectorAll(selector){if(selector==='[data-qa="channel-sidebar-channel"]')return [popupChannel];if(selector==='[data-qa="message_input"][data-channel-id]')return [box(activeChild,activeChild==='DSECOND'?detachedSecondEditor:detachedEditor)];return [];}};
 const popupLocation={pathname:'',href:'',replace(url){routes.push(url);this.href=url;this.pathname=new URL(url).pathname;activeChild=this.pathname.split('/').filter(Boolean).at(-1);}};
 const popup={closed:false,name:'',location:popupLocation,document:popupDocument,desktop:{window:{async getWindowId(){return 42;},async callBrowserWindowMethod(id,method){windowCalls.push({id,method,source:'child'});}}},focus(){childFocused=true;},close(){this.closed=true;childClosed=true;}};
 const team={getAttribute:key=>key==='data-team'?'TONE':null};
 const document={activeElement:null,querySelector:selector=>selector.includes('team_sidebar_item')?team:null,querySelectorAll(selector){if(selector==='[data-qa="channel-sidebar-channel"]')return [wrong,channel];if(selector==='[data-qa="message_input"][data-channel-id]')return [box('DWRONG',wrongEditor),box('DTARGET',editor)];return [];}};
 const location={origin:'https://app.slack.com',pathname:'/client/TONE/DTARGET',href:'https://app.slack.com/client/TONE/DTARGET'},window={desktop:{window:{registerWindowIdForwarder(channel){forwarders.push(channel);return Promise.resolve(42);},async callBrowserWindowMethod(id,method){windowCalls.push({id,method,source:'parent'});}}},open:(url,name,features)=>{opened.push({url,name,features});if(!popupAllowed)return null;popup.name=name;popup.location.href=url;popup.location.pathname=new URL(url).pathname;const token=name.match(/^frameId=pme-reply-[TE][A-Z0-9]+-[CDG][A-Z0-9]+-([^,]+)/)?.[1];popup.__PME_REPLY_BOOTSTRAP__={prepared:token,target:{workspaceId:'TONE',channelId:'DTARGET'},active:false};return popup;}};window.window=window;window.top=window;
 vm.runInNewContext(source,{window,document,location,URL,setTimeout,clearTimeout,Promise,Date});
 return {api:window.__PME_NATIVE_NAVIGATION__,child,clicks:()=>clicks,childClicks:()=>childClicks,childClosed:()=>childClosed,softClicks:()=>softClicks,focused:()=>focused,opened,routes,forwarders,windowCalls,detachedFocused:()=>detachedFocused,childFocused:()=>childFocused,popup};
}

const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

test('shared native navigation resolves authoritative sidebar IDs and focuses only the matching composer',async()=>{
 const env=setup(),destination=env.api.destination(env.child);
 assert.equal(destination.workspaceId,'TONE');assert.equal(destination.channelId,'DTARGET');assert.equal(destination.name,'Target person');
 assert.deepEqual({...env.api.current()},{workspaceId:'TONE',channelId:'DTARGET'});assert.equal(env.api.surface(destination).editor.isConnected,true);
 const result=await env.api.open(destination,{focusComposer:true});assert.deepEqual({...result},{ok:true,focused:true});assert.equal(env.clicks(),1);assert.equal(env.focused(),true);
 env.api.dispose();assert.equal(env.api.status().available,false);
});

test('shared native navigation rejects invalid destinations without clicking Slack',async()=>{
 const env=setup(),result=await env.api.open({workspaceId:'TONE',channelId:'bad'},{focusComposer:true});assert.equal(result.ok,false);assert.equal(env.clicks(),0);
});

test('Reply prepares a hidden blank child before its single Slack route and native reveal',async()=>{
 const env=setup(),destination=env.api.destination(env.child),first=env.api.openDetached(destination);
 assert.deepEqual({...first},{ok:true,detached:true,reused:false});assert.equal(env.clicks(),0);assert.equal(env.opened.length,1);
 assert.equal(env.opened[0].url,'about:blank');assert.match(env.opened[0].name,/^frameId=pme-reply-TONE-DTARGET-/);assert.match(env.opened[0].name,/idRequestChannel=WindowIdRequest-pme-/);assert.match(env.opened[0].name,/disposition=desktop-window/);assert.match(env.opened[0].features,/show=no/);assert.match(env.opened[0].features,/paintWhenInitiallyHidden=yes/);
 assert.equal(env.opened[0].features,env.opened[0].name.slice(env.opened[0].name.indexOf(',')+1));assert.equal(env.forwarders.length,1);
 assert.deepEqual(env.routes,['https://app.slack.com/client/TONE/DTARGET']);await settle();assert.ok(env.windowCalls.some(call=>call.method==='show'));assert.ok(env.windowCalls.some(call=>call.method==='focus'));
 assert.equal(env.childFocused(),true);assert.equal(env.detachedFocused(),true);
 assert.deepEqual({...env.api.openDetached(destination)},{ok:true,detached:true,reused:true});assert.equal(env.opened.length,1);assert.equal(env.api.status().detached,1);
});

test('Reply switches a warm workspace child through its mounted Slack sidebar instead of rebooting it',()=>{
 const env=setup(),first=env.api.destination(env.child);env.api.openDetached(first);
 const second={workspaceId:'TONE',channelId:'DSECOND',name:'Second person'};
 assert.deepEqual({...env.api.openDetached(second)},{ok:true,detached:true,reused:true});assert.equal(env.opened.length,1);assert.equal(env.routes.length,1);
 assert.equal(env.childClicks(),1);assert.equal(env.clicks(),0);assert.equal(env.popup.location.pathname,'/client/TONE/DSECOND');assert.equal(env.detachedFocused(),true);
});

test('opt-in prewarming boots the current conversation hidden and makes the first Reply reuse it',async()=>{
 const env=setup(),seed=env.api.destination(env.child);assert.deepEqual({...env.api.prewarm(seed)},{ok:true,reused:false,ready:false});await settle();
 assert.equal(env.opened.length,1);assert.deepEqual(env.routes,['https://app.slack.com/client/TONE/DTARGET']);assert.equal(env.windowCalls.some(call=>call.method==='show'),false);
 const reply={workspaceId:'TONE',channelId:'DSECOND',name:'Second person'};assert.deepEqual({...env.api.openDetached(reply)},{ok:true,detached:true,reused:true});await settle();
 assert.equal(env.childClicks(),1);assert.equal(env.opened.length,1);assert.ok(env.windowCalls.some(call=>call.method==='show'));
});

test('disabling prewarming closes only its hidden PME-created child',async()=>{
 const env=setup();env.api.prewarm(env.api.destination(env.child));await settle();assert.deepEqual({...env.api.releasePrewarm()},{released:1});assert.equal(env.childClosed(),true);assert.equal(env.api.status().detached,0);
});

test('an unmounted warm destination hides the child before its single fallback navigation',async()=>{
 const env=setup(),first=env.api.destination(env.child);env.api.openDetached(first);await settle();
 const next={workspaceId:'TONE',channelId:'DTHIRD',name:'Third person'};env.api.openDetached(next);await settle();await settle();
 assert.ok(env.windowCalls.some(call=>call.method==='hide'));assert.deepEqual(env.routes,['https://app.slack.com/client/TONE/DTARGET','https://app.slack.com/client/TONE/DTHIRD']);assert.match(env.popup.name,/^frameId=pme-reply-TONE-DTHIRD-/);assert.equal(env.opened.length,1);assert.equal(env.clicks(),0);
});

test('an unmounted destination first offers Slack its same-document link handoff',async()=>{
 const env=setup({softRoute:true}),first=env.api.destination(env.child);env.api.openDetached(first);await settle();
 env.api.openDetached({workspaceId:'TONE',channelId:'DTHIRD',name:'Third person'});await settle();
 assert.equal(env.softClicks(),1);assert.equal(env.popup.location.pathname,'/client/TONE/DTHIRD');assert.deepEqual(env.routes,['https://app.slack.com/client/TONE/DTARGET']);assert.ok(env.windowCalls.some(call=>call.method==='hide'));
});

test('a dedicated reply document stays covered until its exact composer is mounted',()=>{
 const frames=[],nodes=[];let connected=false,changed=()=>{};
 const element=tag=>({tag,id:'',textContent:'',isConnected:false,attributes:new Map(),children:[],setAttribute(key,value){this.attributes.set(key,value);},removeAttribute(key){this.attributes.delete(key);},hasAttribute(key){return this.attributes.has(key);},append(...items){this.children.push(...items);},remove(){this.isConnected=false;}});
 const root=element('html'),body=element('body');root.append=node=>{node.isConnected=true;nodes.push(node);};body.append=node=>{node.isConnected=true;nodes.push(node);};
 const editor={isConnected:true,closest:selector=>selector==='.p-view_contents'?{isConnected:true}:null,focus(){}};
 const box={getAttribute:key=>key==='data-channel-id'?'DTARGET':null,querySelector:()=>editor};
 const team={getAttribute:key=>key==='data-team'?'TONE':null};
 const document={body,documentElement:root,activeElement:null,createElement:element,getElementById:id=>nodes.find(node=>node.id===id&&node.isConnected)||null,querySelector:selector=>selector.includes('team_sidebar_item')?team:null,querySelectorAll(selector){if(selector==='[data-qa="message_input"][data-channel-id]')return connected?[box]:[];return [];}};
 class MutationObserver{constructor(callback){changed=callback;}observe(){}disconnect(){}}
 const window={name:'frameId=pme-reply-TONE-DTARGET-test,disposition=desktop-window',requestAnimationFrame:callback=>{frames.push(callback);return frames.length;}};window.window=window;window.top=window;
 vm.runInNewContext(source,{window,document,location:{origin:'https://app.slack.com',pathname:'/client/TONE/DTARGET'},URL,setTimeout,clearTimeout,Promise,Date,MutationObserver,requestAnimationFrame:window.requestAnimationFrame});
 assert.equal(window.__PME_NATIVE_NAVIGATION__.replyBoot.status().covered,true);assert.ok(nodes.some(node=>node.attributes?.has('data-pme-reply-boot')));assert.equal(root.hasAttribute('data-pme-reply-window'),true);
 const replyStyle=nodes.find(node=>node.id==='pme-reply-boot-style');assert.match(replyStyle.textContent,/\.p-ia4_top_nav/);assert.match(replyStyle.textContent,/channel-sidebar/);assert.match(replyStyle.textContent,/position:fixed!important;inset:0!important/);assert.match(replyStyle.textContent,/height:100vh/);assert.match(replyStyle.textContent,/grid-template-rows:minmax\(0,1fr\)/);assert.match(replyStyle.textContent,/\.p-view_contents--primary\{height:100%!important;max-height:none!important/);
 connected=true;changed();
 while(frames.length)frames.shift()();
 assert.equal(window.__PME_NATIVE_NAVIGATION__.replyBoot.status().revealed,true);assert.equal(nodes.find(node=>node.attributes?.has('data-pme-reply-boot')).isConnected,false);assert.equal(replyStyle.isConnected,true);assert.equal(root.hasAttribute('data-pme-reply-window'),true);window.__PME_NATIVE_NAVIGATION__.dispose();assert.equal(root.hasAttribute('data-pme-reply-window'),false);
});

test('the reply bootstrap marks the blank handshake and covers the first Slack document',()=>{
 const node=tag=>({tag,id:'',textContent:'',attributes:new Set(),setAttribute(key){this.attributes.add(key);},hasAttribute(key){return this.attributes.has(key);},append(child){child.isConnected=true;}}),root=node('html'),body=node('body'),document={documentElement:root,body,createElement:node};
 const blank={name:'frameId=pme-reply-TONE-DTARGET-token,disposition=desktop-window'};blank.window=blank;
 vm.runInNewContext(bootstrapSource,{window:blank,location:{origin:'null'},document,MutationObserver:class{}});assert.equal(blank.__PME_REPLY_BOOTSTRAP__.prepared,'token');assert.equal(blank.__PME_REPLY_BOOTSTRAP__.target.workspaceId,'TONE');assert.equal(blank.__PME_REPLY_BOOTSTRAP__.target.channelId,'DTARGET');assert.equal(blank.__PME_REPLY_BOOTSTRAP__.active,false);assert.equal(root.hasAttribute('data-pme-reply-bootstrap'),false);
 const slack={name:blank.name};slack.window=slack;vm.runInNewContext(bootstrapSource,{window:slack,location:{origin:'https://app.slack.com'},document,MutationObserver:class{}});
 assert.equal(slack.__PME_REPLY_BOOTSTRAP__.active,true);assert.equal(root.hasAttribute('data-pme-reply-bootstrap'),true);assert.equal(root.hasAttribute('data-pme-reply-window'),true);
});

test('a rejected child window fails closed without clicking or replacing the main view',()=>{
 const env=setup({popupAllowed:false}),result=env.api.openDetached(env.api.destination(env.child));
 assert.equal(result.ok,false);assert.match(result.error,/separate conversation window/);assert.equal(env.clicks(),0);assert.equal(env.api.current().channelId,'DTARGET');
});
