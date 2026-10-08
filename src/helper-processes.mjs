import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {digest,verifyHelper} from './mod-packages.mjs';
const REQUEST_LIMIT=64*1024,RESPONSE_LIMIT=4*1024*1024,MAX_PENDING=8,REQUEST_TIMEOUT=15000;
// Foreground helper processes belong to the session, never to the manager UI.
export function helperProcesses({verify=verifyHelper,changed=()=>{}}={}){
 const children=[];let stopping=false,sequence=0;
 const status=()=>children.map(({id,state,reason})=>({id,state,reason}));
 const publish=()=>changed(status());
 const rejectPending=(item,reason)=>{for(const pending of item.pending?.values()||[]){clearTimeout(pending.timer);pending.reject(Error(reason));}item.pending?.clear();};
 function failService(item,reason){if(item.done||item.state==='failed')return;item.state='failed';item.reason=reason;rejectPending(item,reason);publish();if(item.child.pid)try{process.kill(-item.child.pid,'SIGTERM');}catch{}}
 function serviceData(item,chunk){
  item.buffer+=item.decoder.write(chunk);if(Buffer.byteLength(item.buffer)>RESPONSE_LIMIT&&!item.buffer.includes('\n')){failService(item,'Helper service response exceeded 4 MB');return;}
  for(let end;(end=item.buffer.indexOf('\n'))>=0;){const line=item.buffer.slice(0,end);item.buffer=item.buffer.slice(end+1);if(!line)continue;if(Buffer.byteLength(line)>RESPONSE_LIMIT){failService(item,'Helper service response exceeded 4 MB');return;}let response;try{response=JSON.parse(line);}catch{failService(item,'Helper service returned invalid JSON');return;}if(!response||typeof response.id!=='string'||typeof response.ok!=='boolean'){failService(item,'Helper service returned an invalid response');return;}const pending=item.pending.get(response.id);if(!pending)continue;item.pending.delete(response.id);clearTimeout(pending.timer);if(response.ok)pending.resolve(response.result);else pending.reject(Error(typeof response.error==='string'?response.error.slice(0,200):'Helper service request failed'));}
 }
 async function stop(){
  if(stopping)return;stopping=true;
  for(const item of children)rejectPending(item,'Helper session stopped');
  for(const item of children)if(!item.done&&item.child.pid)try{process.kill(-item.child.pid,'SIGTERM');}catch{}
  let timer;await Promise.race([Promise.all(children.map(item=>item.exited)),new Promise(r=>{timer=setTimeout(r,1800);})]);clearTimeout(timer);
  for(const item of children)if(!item.done&&item.child.pid)try{process.kill(-item.child.pid,'SIGKILL');}catch{}
  await Promise.all(children.map(item=>item.exited));
 }
 async function start(request){
  try{for(const h of request.helpers){
   if(stopping)return;const binary=await verify(h.root,h);if(stopping)return;
   const data=path.join(request.runtimeDir,'mod-data',digest(h.modId).slice(0,24));await fs.mkdir(data,{recursive:true,mode:0o700});
   const service=h.service?.operations?.length>0,env={PATH:'/usr/bin:/bin',...Object.fromEntries(['HOME','TMPDIR','USER','LOGNAME','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),PME_HELPER_API:'1',PME_MOD_ID:h.modId,PME_MOD_DATA_DIR:data,PME_APP_ID:'slack',PME_APP_PATH:request.appPath,PME_APP_PID:String(request.targetPID),...(service?{PME_HELPER_SERVICE:'json-lines-v1'}:{})};
   const child=spawn(binary,h.args,{cwd:h.root,env,stdio:service?['pipe','pipe','inherit']:['ignore','inherit','inherit'],detached:true}),item={id:h.modId+'/'+h.id,modId:h.modId,child,state:'starting',done:false,operations:new Set(h.service?.operations||[]),pending:new Map(),decoder:new StringDecoder('utf8'),buffer:''};children.push(item);if(service)child.stdout.on('data',chunk=>serviceData(item,chunk));
   item.exited=new Promise(resolve=>{child.once('exit',(code,signal)=>{item.done=true;rejectPending(item,'Helper service stopped');if(item.state!=='failed'){item.state='stopped';item.reason=`Exited (${signal||code})`;}publish();resolve();});child.once('error',()=>{item.done=true;item.state='failed';item.reason='Could not start helper';rejectPending(item,item.reason);publish();resolve();});});
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});item.state='running';publish();
  }}catch(e){await stop();throw e;}
 }
 function request(modId,operation,payload){
  if(stopping)throw Error('Helper session stopped');if(typeof modId!=='string'||typeof operation!=='string')throw Error('Invalid helper service request');const item=children.find(child=>child.modId===modId&&child.operations.has(operation));if(!item||item.state!=='running'||item.done||!item.child.stdin?.writable)throw Error('Private service is unavailable');if(item.pending.size>=MAX_PENDING)throw Error('Too many private service requests');
  const id='r'+(++sequence).toString(36);let encoded;try{encoded=JSON.stringify({id,operation,payload});}catch{throw Error('Private service payload must be JSON');}if(Buffer.byteLength(encoded)>REQUEST_LIMIT)throw Error('Private service payload is too large');
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{item.pending.delete(id);reject(Error('Private service request timed out'));},REQUEST_TIMEOUT);item.pending.set(id,{resolve,reject,timer});item.child.stdin.write(encoded+'\n','utf8',error=>{if(!error)return;clearTimeout(timer);item.pending.delete(id);reject(Error('Private service is unavailable'));});});
 }
 return {start,stop,status,request};
}
