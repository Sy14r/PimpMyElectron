import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const start=source.indexOf("document.addEventListener('keydown',")+"document.addEventListener('keydown',".length;
const end=source.indexOf('},{capture:true,signal:abort.signal});',start)+1;
assert.ok(start>0&&end>start);
function escape({mode='reply',nativeEditable=false,triageFocus=false,composing=false,handled=false}={}){
 const transitions=[],host={},native={closest:()=>nativeEditable?{}:null},target=triageFocus?host:native;
 const env={mode,host,document:{activeElement:target},lastInteraction:0,Date,detailMode:()=>mode==='reply'||mode==='reading',restMode:()=>'strip',transition:next=>transitions.push(next)};
 const listener=vm.runInNewContext(`(${source.slice(start,end)})`,env);
 let prevented=false,stopped=false;
 listener({key:'Escape',code:'Escape',isComposing:composing,defaultPrevented:handled,composedPath:()=>[target],preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
 return {transitions,prevented,stopped};
}
test('Escape outside the native editor closes the detail pane and retains the inbox',()=>{
 for(const triageFocus of [false,true])assert.deepEqual(escape({triageFocus}),{transitions:['queue'],prevented:true,stopped:true});
});
test('Escape in native text entry, during composition or already handled remains with Slack',()=>{
 for(const options of [{nativeEditable:true},{composing:true},{handled:true}])assert.deepEqual(escape(options),{transitions:[],prevented:false,stopped:false});
});
test('Escape in queue retains its collapse behavior and standard Slack is untouched',()=>{
 assert.deepEqual(escape({mode:'queue',triageFocus:true}),{transitions:['strip'],prevented:true,stopped:true});
 assert.deepEqual(escape({mode:'stock'}),{transitions:[],prevented:false,stopped:false});
});
