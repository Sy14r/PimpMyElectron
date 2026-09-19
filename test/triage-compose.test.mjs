import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const start=source.indexOf('  function startCompose('),end=source.indexOf('  function renderReply()',start);
function run({scope='*',chosen=null,online=true,disabled=false,directory=[{id:'TONE',connected:true},{id:'TTWO',connected:true}]}={}){
 const replies=[],pickers=[];
 const context={connected:()=>online,$:()=>({disabled}),viewTeam:()=>scope,snapshot:{workspaceDirectory:directory},openWorkspacePicker:p=>pickers.push(p),startReply:r=>replies.push(r)};
 const compose=vm.runInNewContext(`(${source.slice(start,end).trim()})`,context);compose(chosen);
 return {replies:JSON.parse(JSON.stringify(replies)),pickers};
}
test('All workspaces Compose asks for an explicit destination without opening an editor',()=>{
 assert.deepEqual(run(),{replies:[],pickers:['compose']});
});
test('a selected workspace opens its native composer while the All workspaces scope stays unchanged',()=>{
 const r=run({chosen:'TTWO'});assert.deepEqual(r,{pickers:[],replies:[{kind:'compose',workspaceId:'TTWO',key:'TTWO:compose',name:'New message'}]});
});
test('single-workspace Compose still opens directly',()=>{
 assert.equal(run({scope:'TONE'}).replies[0].workspaceId,'TONE');assert.deepEqual(run({scope:'TONE'}).pickers,[]);
});
test('disconnected, disabled, unknown and stale destinations never open native compose',()=>{
 for(const options of [{online:false},{disabled:true},{chosen:'TUNKNOWN'},{chosen:'*'},{chosen:'TTWO',directory:[{id:'TTWO',connected:false}]}])assert.deepEqual(run(options),{replies:[],pickers:[]});
});
