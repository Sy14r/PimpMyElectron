import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {digest,verifyHelper} from './mod-packages.mjs';
// Foreground helper processes belong to the session, never to the manager UI.
export function helperProcesses({verify=verifyHelper,changed=()=>{}}={}){
 const children=[];let stopping=false;
 const status=()=>children.map(({id,state,reason})=>({id,state,reason}));
 const publish=()=>changed(status());
 async function stop(){
  if(stopping)return;stopping=true;
  for(const item of children)if(!item.done&&item.child.pid)try{process.kill(-item.child.pid,'SIGTERM');}catch{}
  let timer;await Promise.race([Promise.all(children.map(item=>item.exited)),new Promise(r=>{timer=setTimeout(r,1800);})]);clearTimeout(timer);
  for(const item of children)if(!item.done&&item.child.pid)try{process.kill(-item.child.pid,'SIGKILL');}catch{}
  await Promise.all(children.map(item=>item.exited));
 }
 async function start(request){
  try{for(const h of request.helpers){
   if(stopping)return;const binary=await verify(h.root,h);if(stopping)return;
   const data=path.join(request.runtimeDir,'mod-data',digest(h.modId).slice(0,24));await fs.mkdir(data,{recursive:true,mode:0o700});
   const env={PATH:'/usr/bin:/bin',...Object.fromEntries(['HOME','TMPDIR','USER','LOGNAME','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),PME_HELPER_API:'1',PME_MOD_ID:h.modId,PME_MOD_DATA_DIR:data,PME_APP_ID:'slack',PME_APP_PATH:request.appPath,PME_APP_PID:String(request.targetPID)};
   const child=spawn(binary,h.args,{cwd:h.root,env,stdio:['ignore','inherit','inherit'],detached:true}),item={id:h.modId+'/'+h.id,child,state:'starting',done:false};children.push(item);
   item.exited=new Promise(resolve=>{child.once('exit',(code,signal)=>{item.done=true;item.state='stopped';item.reason=`Exited (${signal||code})`;publish();resolve();});child.once('error',()=>{item.done=true;item.state='failed';item.reason='Could not start helper';publish();resolve();});});
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});item.state='running';publish();
  }}catch(e){await stop();throw e;}
 }
 return {start,stop,status};
}
