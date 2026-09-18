// Loads existing unread rows through our own UI. No Slack navigation or writes.
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
function control(request){return new Promise((resolve,reject)=>{
  const socket=net.createConnection(path.join(root,'.lab/dev/control.sock'));let data='';socket.setEncoding('utf8');
  socket.setTimeout(15000,()=>socket.destroy(new Error('Control timeout')));
  socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));socket.on('data',chunk=>{data+=chunk;});socket.on('error',reject);
  socket.on('end',()=>{try{const r=JSON.parse(data);if(!r.ok)throw Error(r.error);resolve(r.result);}catch(e){reject(e);}});
});}
const inspect=expression=>control({op:'inspect',expression});
const before=await control({op:'status'});
const keys=await inspect(`(()=>{
  const shadow=document.querySelector('#pme-live-triage')?.shadowRoot;if(!shadow)throw Error('Triage is not installed');
  const unread=()=>[...document.querySelectorAll('[data-qa="channel-sidebar-channel"]')].filter(r=>r.classList.contains('p-channel_sidebar__channel--unread')).map(r=>r.getAttribute('data-qa-channel-sidebar-channel-id')).sort();
  window.__pmeHistorySmoke={path:location.pathname,unread:unread()};
  return [...shadow.querySelectorAll('.row')].filter(r=>r.querySelector('.unread')).map(r=>r.dataset.key).slice(0,10);
})()`);
assert.ok(keys.length,'No visible unread rows to test; select All or Unread first');
const reads=[];
for(const key of keys){
  const result=await inspect(`(async()=>{
    const shadow=document.querySelector('#pme-live-triage').shadowRoot;
    __PME_TRIAGE__.open(${JSON.stringify(key)},{reader:true});
    for(let i=0;i<65;i++){
      await new Promise(r=>setTimeout(r,150));
      if(shadow.querySelector('.row.selected')?.dataset.key===${JSON.stringify(key)}&&shadow.getElementById('history-status').textContent.startsWith('Loaded without')){
        return {loaded:true,messages:shadow.querySelectorAll('.message').length,
          nonemptyMessages:[...shadow.querySelectorAll('.body')].filter(n=>n.textContent&&n.textContent!=='[No text content]').length};
      }
    }return {loaded:false};
  })()`);
  reads.push(result);assert.equal(result.loaded,true);
}
const unchanged=await inspect(`(()=>{
  const unread=[...document.querySelectorAll('[data-qa="channel-sidebar-channel"]')].filter(r=>r.classList.contains('p-channel_sidebar__channel--unread')).map(r=>r.getAttribute('data-qa-channel-sidebar-channel-id')).sort();
  const result={underlyingConversationUnchanged:location.pathname===window.__pmeHistorySmoke.path,
    nativeUnreadIndicatorsUnchanged:JSON.stringify(unread)===JSON.stringify(window.__pmeHistorySmoke.unread)};
  delete window.__pmeHistorySmoke;return result;
})()`);
assert.equal(unchanged.underlyingConversationUnchanged,true);assert.equal(unchanged.nativeUnreadIndicatorsUnchanged,true);
const after=await control({op:'status'});
const delta=method=>(after.feature.methods[method]||0)-(before.feature.methods[method]||0);
const network={historyReads:delta('conversations.history'),nameReads:delta('users.info'),markReadCalls:delta('conversations.mark'),sendCalls:delta('chat.postMessage')};
assert.equal(network.markReadCalls,0);assert.equal(network.sendCalls,0);
const report={checkedAt:new Date().toISOString(),source:'scripts/history-smoke.mjs',conversationsTested:reads.length,reads,...unchanged,network};
await fs.writeFile(path.join(root,'evidence/history-loading-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
