import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const start=source.indexOf("document.addEventListener('keydown',")+"document.addEventListener('keydown',".length;
const end=source.indexOf('},{capture:true,signal:abort.signal});',start)+1;
assert.ok(start>0&&end>start);
function escape({mode='reply',quickReply=null,nativeEditable=false,triageFocus=false,composing=false,handled=false,composer=false,repeat=false,presses=1,popup=false,nativeOverlay=false,auxiliary=false,filterFocus=false}={}){
 const transitions=[],host={},body={closest:()=>null};let blurred=false,popupClosed=false,auxiliaryClosed=false,filterReleased=false;
 const native={closest:selector=>selector.includes('data-pme-native-reply-pane')?(composer?native:null):(nativeEditable||composer?native:null),blur(){blurred=true;env.document.activeElement=body;}},target=triageFocus||filterFocus?host:native;
 const env={shadow:{activeElement:filterFocus?{matches:()=>true}:null},focusInbox(){filterReleased=true;env.shadow.activeElement={matches:()=>false};},densityKey:()=>false,mode,quickReply,host,window:{__PME_REPLY__:{overlayOpen:()=>nativeOverlay,status:()=>({auxiliary}),closeAuxiliary:()=>{auxiliaryClosed=true;}}},aliasDialog:{open:false},workspaceDialog:{open:popup},closeWorkspacePicker(){popupClosed=true;env.workspaceDialog.open=false;},document:{activeElement:target},lastInteraction:0,touch(){},Date,detailMode:()=>mode==='reply'||mode==='reading',restMode:()=>'strip',transition:next=>transitions.push(next)};
 const listener=vm.runInNewContext(`(${source.slice(start,end)})`,env);
 let prevented=false,stopped=false;
 for(let i=0;i<presses;i++)listener({key:'Escape',code:'Escape',repeat,isComposing:composing,defaultPrevented:handled,composedPath:()=>[env.document.activeElement],preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
 return {transitions,prevented,stopped,...(filterFocus?{filterReleased}:{}),...(composer?{blurred}: {}),...(popup?{popupClosed}: {}),...(auxiliary?{auxiliaryClosed}: {})};
}
test('Escape outside the native editor closes the detail pane and retains the inbox',()=>{
 for(const triageFocus of [false,true])assert.deepEqual(escape({triageFocus}),{transitions:['queue'],prevented:true,stopped:true});
});
test('Escape in other native text fields, during composition or already handled remains with Slack',()=>{
 for(const options of [{nativeEditable:true},{composing:true},{handled:true}])assert.deepEqual(escape(options),{transitions:[],prevented:false,stopped:false});
});
test('Escape in queue retains its collapse behavior and standard Slack is untouched',()=>{
 assert.deepEqual(escape({mode:'queue',triageFocus:true}),{transitions:['strip'],prevented:true,stopped:true});
 assert.deepEqual(escape({mode:'stock'}),{transitions:[],prevented:false,stopped:false});
});

test('First Escape blurs the native composer, second Escape returns to queue',()=>{
 assert.deepEqual(escape({composer:true}),{transitions:[],prevented:true,stopped:true,blurred:true});
 assert.deepEqual(escape({composer:true,presses:2}),{transitions:['queue'],prevented:true,stopped:true,blurred:true});
});
test('Repeated Escape does not blur or close the native pane',()=>{
 assert.deepEqual(escape({composer:true,repeat:true}),{transitions:[],prevented:true,stopped:true,blurred:false});
 assert.deepEqual(escape({repeat:true}),{transitions:[],prevented:true,stopped:true});
});
test('Composition and already-handled Escape do not blur the composer',()=>{
 for(const options of [{composing:true},{handled:true}])assert.deepEqual(escape({composer:true,...options}),{transitions:[],prevented:false,stopped:false,blurred:false});
});

test('Escape closes the workspace popup without collapsing the queue or closing native chat',()=>{
 for(const mode of ['queue','reply'])assert.deepEqual(escape({mode,popup:true}),{transitions:[],prevented:true,stopped:true,popupClosed:true});
});

test('Escape from quick reply returns to the pill after blurring the composer',()=>{
 assert.deepEqual(escape({quickReply:{},composer:true,presses:2}),{transitions:['cluster'],prevented:true,stopped:true,blurred:true});
});


test('Escape belongs to native popovers before either profile dismissal or inbox collapse',()=>{
 assert.deepEqual(escape({nativeOverlay:true}),{transitions:[],prevented:false,stopped:false});
 assert.deepEqual(escape({nativeOverlay:true,auxiliary:true}),{transitions:[],prevented:false,stopped:false,auxiliaryClosed:false});
});
test('Escape in profile or scoped search returns to the conversation and respects composition',()=>{
 assert.deepEqual(escape({auxiliary:true}),{transitions:[],prevented:true,stopped:true,auxiliaryClosed:true});
 for(const options of [{composing:true},{handled:true}])assert.deepEqual(escape({auxiliary:true,...options}),{transitions:[],prevented:false,stopped:false,auxiliaryClosed:false});
 assert.deepEqual(escape({auxiliary:true,repeat:true}),{transitions:[],prevented:true,stopped:true,auxiliaryClosed:false});
});

test('Escape leaves the filter text field before closing details or collapsing the inbox',()=>{
 for(const mode of ['queue','reply','reading']){
  assert.deepEqual(escape({mode,filterFocus:true}),{transitions:[],prevented:true,stopped:true,filterReleased:true});
  assert.deepEqual(escape({mode,filterFocus:true,presses:2}),{transitions:[mode==='queue'?'strip':'queue'],prevented:true,stopped:true,filterReleased:true});
 }
});
test('held Escape and composition cannot collapse the inbox from its text filter',()=>{
 assert.deepEqual(escape({mode:'queue',filterFocus:true,repeat:true}),{transitions:[],prevented:true,stopped:true,filterReleased:false});
 for(const options of [{composing:true},{handled:true}])assert.deepEqual(escape({mode:'queue',filterFocus:true,...options}),{transitions:[],prevented:false,stopped:false,filterReleased:false});
 assert.deepEqual(escape({mode:'queue',triageFocus:true,repeat:true}),{transitions:[],prevented:true,stopped:true});
});
