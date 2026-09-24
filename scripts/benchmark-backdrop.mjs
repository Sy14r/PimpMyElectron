// Local opt-in experiment. Requires dev:debug and a window already initialized
// for native transparency. Does not send messages or invoke Slack read APIs.
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url)),dir=path.join(root,'.lab/dev');
function request(socket,body){return new Promise((resolve,reject)=>{
 const s=net.createConnection(path.join(dir,socket));let data='';s.setEncoding('utf8');
 s.setTimeout(20000,()=>s.destroy(new Error('Timed out')));s.on('error',reject);
 s.on('connect',()=>s.write(JSON.stringify(body)+'\n'));s.on('data',chunk=>data+=chunk);
 s.on('end',()=>{try{const r=JSON.parse(data);if(!r.ok)throw Error(r.error);resolve(r.result);}catch(e){reject(e);}});
});}
const control=body=>request('control.sock',body),shell=body=>request('shell.sock',body),inspect=expression=>control({op:'inspect',expression});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function cpu(){const results={};
 for(const line of execFileSync('/bin/ps',['-axo','pid=,time=,comm='],{encoding:'utf8'}).split('\n')){
  const m=line.trim().match(/^(\d+)\s+([\d:.]+)\s+(.+)$/);if(!m)continue;
  const type=m[3].endsWith('/WindowServer')?'windowServer':m[3].endsWith('/SlackTriage')?'triageHelper':m[3].includes('/Slack.app/Contents/')?(m[3].includes('(Renderer)')?'renderer':m[3].endsWith('/MacOS/Slack')?'main':'helpers'):null;
  if(type){const parts=m[2].split(':').map(Number),seconds=parts.reduce((a,b)=>a*60+b,0);results[m[1]]={type,seconds};}
 }return results;
}
async function measure(work){const before=cpu(),start=performance.now(),frames=await work(),elapsed=performance.now()-start,after=cpu(),percent={};
 for(const [pid,p] of Object.entries(after)){if(!before[pid])continue;percent[p.type]=(percent[p.type]||0)+(p.seconds-before[pid].seconds)/elapsed*100000;}
 return {elapsedMs:Math.round(elapsed),cpuPercent:Object.fromEntries(Object.entries(percent).map(([k,v])=>[k,Number(v.toFixed(2))])),...frames};
}
const status=await control({op:'status'});if(status.controlMode!=='development')throw Error('Run dev:debug first.');
const safe=await inspect("Object.keys(JSON.parse(localStorage.getItem('localConfig_v2')||'{}').teams||{}).every(id=>['TAAP373B6','T0C3P9VJUBA'].includes(id))");if(!safe)throw Error('Use only the authorized test workspaces.');
const before=await shell({op:'state'});if(!before.backdrop?.ready)throw Error('Enable translucent inbox and restart once before benchmarking.');
const results=[];
try{
 for(const enabled of [false,true]){
  await shell({op:'settings',patch:{inboxGlass:enabled}});
  for(const expanded of [false,true]){
   await shell({op:'queue'});if(expanded)await inspect('window.__PME_TRIAGE__.activity()');
   await wait(1800);
   const idle=await measure(async()=>{await wait(6000);return {};});
   const scroll=await measure(()=>inspect(`new Promise(resolve=>{const list=document.querySelector('#pme-live-triage').shadowRoot.querySelector('#list'),original=list.scrollTop,deltas=[];let start,last;function tick(t){start??=t;if(last)deltas.push(t-last);last=t;list.scrollTop=(1-Math.cos((t-start)/350))/2*Math.max(0,list.scrollHeight-list.clientHeight);if(t-start<6000)requestAnimationFrame(tick);else{list.scrollTop=original;deltas.sort((a,b)=>a-b);resolve({frames:deltas.length,p50:deltas[Math.floor(deltas.length*.5)],p95:deltas[Math.floor(deltas.length*.95)],over33ms:deltas.filter(n=>n>33.4).length});}}requestAnimationFrame(tick);})`));
   results.push({enabled,expanded,idle,scroll});console.log(JSON.stringify(results.at(-1)));
  }
 }
}finally{await shell({op:'settings',patch:{inboxGlass:before.settings.inboxGlass}});await shell({op:'queue'});}
const report={at:new Date().toISOString(),installation:status.installation,notes:'Single-machine short samples. WindowServer includes other apps. Helpers aggregate GPU and utility processes. Expanded case scrolls our inbox alongside native Activity. No typing, long-history, external-display or battery qualification.',results};
const output=path.join(dir,'backdrop-benchmark.json');await fs.writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`Saved ${output}`);
