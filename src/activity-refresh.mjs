// Manual enrichment only. Slack's own responses/events supply background activity.
// There is deliberately no polling or automatic retry, even after reconnect.
export function createActivityRefresher({load,onData,now=Date.now}){
  const states=new Map(),jobs=new Map(),active=new Set();let disposed=false,online=true;
  const valid=id=>typeof id==='string'&&/^[TE][A-Z0-9]+$/.test(id);
  function state(id){if(!states.has(id))states.set(id,{status:'passive',at:0,attemptAt:null,nextAt:0,discoveryPages:0});return states.get(id);}
  function request(id,{more=false,reason='event'}={}){
    if(disposed||reason!=='manual'||!online||!valid(id)||!states.has(id)&&states.size>=12)return false;
    const s=state(id);
    // Ignore repeat clicks instead of scheduling surprise follow-up traffic.
    if(active.has(id)||jobs.has(id)||now()<s.nextAt||more&&!s.nextCursor)return false;
    jobs.set(id,{id,more});pump();return true;
  }
  function pump(){
    if(disposed||!online||active.size)return;
    const job=jobs.values().next().value;if(!job)return;
    jobs.delete(job.id);
    const previous={...state(job.id)},cursor=job.more?previous.nextCursor:null;
    active.add(job.id);states.set(job.id,{...previous,status:'loading',attemptAt:now(),nextAt:now()+60000,error:null});
    void Promise.resolve().then(()=>load({workspaceId:job.id,cursor})).then(result=>{
      if(disposed)return;
      const retryAt=Number.isFinite(result?.retryAfter)&&result.retryAfter>0?now()+result.retryAfter*1000:0;
      const nextAt=Math.max(state(job.id).nextAt,retryAt);
      if(!result?.ok){
        states.set(job.id,{...state(job.id),status:'error',nextAt,retryAt,
          error:'Could not refresh Slack. Previous observations are retained. No automatic retry.'});return;
      }
      onData(job.id,result);
      const partial=job.more?previous.countsAvailable!==true||previous.threadsAvailable!==true:result.countsAvailable!==true||result.threadsAvailable!==true;
      states.set(job.id,{...state(job.id),status:partial?'partial':'ready',at:now(),nextAt,retryAt,error:null,
        nextCursor:result.nextCursor||null,hasMore:!!result.nextCursor,
        discoveryPages:job.more?previous.discoveryPages+1:1,
        ...(job.more?{}:{countsAvailable:result.countsAvailable===true,threadsAvailable:result.threadsAvailable===true,threadsPartial:result.threadsPartial!==false,
          countsAt:result.countsAvailable?now():previous.countsAt||0,threadsAt:result.threadsAvailable?now():previous.threadsAt||0})});
    }).catch(()=>{
      if(!disposed)states.set(job.id,{...state(job.id),status:'error',error:'Could not refresh Slack. Previous observations are retained. No automatic retry.'});
    }).finally(()=>{active.delete(job.id);if(!disposed)pump();});
  }
  return {
    request,
    tick(ids){for(const id of ids)if(valid(id)&&(states.has(id)||states.size<12))state(id);pump();},
    setOnline(value){online=value!==false;if(!online)jobs.clear();},
    resume(){/* Observe Slack's recovery; never initiate enrichment here. */},
    get:id=>{const s=states.get(id);return s?{...s,queued:jobs.has(id)}:{status:'passive'};},
    status:()=>({mode:'passive',automaticPolling:false,online,active:active.size,queued:jobs.size,workspaces:[...states.keys()].map(id=>({id,...states.get(id)}))}),
    dispose(){disposed=true;jobs.clear();states.clear();}
  };
}
