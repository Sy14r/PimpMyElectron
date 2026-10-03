import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export async function startExternalHelpers({helpers,runtimeDir,appPath='',targetPID=0}){
 if(!helpers.length)return {status:()=>[],dispose:async()=>{}};
 const log=await fs.open(path.join(runtimeDir,'external-helpers.log'),'a',0o600);
 const host=spawn(process.execPath,[fileURLToPath(new URL('./external-helper-host.mjs',import.meta.url))],{stdio:['ignore',log.fd,log.fd,'ipc'],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('DYLD_')&&!['NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE'].includes(k)))});await log.close();
 let status=[],closed=false;const exited=new Promise(resolve=>{host.once('exit',()=>{closed=true;resolve();});host.once('error',()=>{closed=true;resolve();});});
 host.on('message',m=>{if(m.type==='status')status=m.helpers;});
 try{await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('External helpers did not finish starting')),60000);
  const done=error=>{clearTimeout(timeout);host.off('message',message);host.off('error',errorEvent);host.off('exit',exit);error?reject(error):resolve();};
  const message=m=>{if(m.type==='ready')done();else if(m.type==='error')done(Error(m.error));},errorEvent=()=>done(Error('Could not start external helper supervisor')),exit=()=>done(Error('External helper supervisor exited during startup'));
  host.on('message',message);host.once('error',errorEvent);host.once('exit',exit);host.send({helpers,runtimeDir,appPath,targetPID});
 });}catch(e){if(host.connected)host.disconnect();await exited;throw e;}
 host.on('error',()=>{status=[{state:'failed',reason:'Helper supervisor unavailable'}];});
 return {status:()=>closed?[{state:'stopped',reason:'Helper supervisor stopped'}]:status,dispose:async()=>{if(host.connected)host.disconnect();await exited;}};
}
