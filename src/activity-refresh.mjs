// Bounded, fair read-only refresh queue. Failed reads retain their last success.
export function createActivityRefresher({load,onData,now=Date.now}){
  const states=new Map(),jobs=new Map(),active=new Set();let disposed=false,online=true;
  const valid=id=>typeof id==='string'&&/^[TE][A-Z0-9]+$/.test(id);
  function state(id){if(!states.has(id))states.set(id,{status:'idle',at:0,attemptAt:null,nextAt:0,failures:0,discoveryPages:0});return states.get(id);}
  function request(id,{more=false,reason='event'}={}){
    if(disposed||!valid(id)||!states.has(id)&&states.size>=12)return false;
    const s=state(id);if(more&&!s.nextCursor)return false;
    const key=`${id}:${more?'more':'head'}`,existing=jobs.get(key);
    const due=Math.max(now(),s.retryAt||0,(s.attemptAt??-Infinity)+10000);
    jobs.set(key,{id,more,manual:reason==='manual'||existing?.manual===true,resume:reason==='resume'||existing?.resume===true,due:existing?Math.min(existing.due,due):due});
    pump();return true;
  }
  function pump(){
    if(disposed)return;
    for(const [key,job] of jobs){
      if(active.size>=2)break;
      const s=state(job.id);
      const backoff=!job.manual&&!job.resume&&['error','partial'].includes(s.status)?s.nextAt:0;
      if(active.has(job.id)||now()<Math.max(job.due,s.retryAt||0,backoff)||!online&&!job.manual)continue;
      jobs.delete(key);if(job.more&&!s.nextCursor)continue;
      const previous={...s},cursor=job.more?s.nextCursor:null;
      active.add(job.id);states.set(job.id,{...s,status:'loading',attemptAt:now(),error:null});
      void Promise.resolve().then(()=>load({workspaceId:job.id,cursor})).then(result=>{
        if(disposed)return;
        if(!result?.ok){const error=Object.assign(Error('refresh_failed'),{retryAfter:result?.retryAfter});throw error;}
        onData(job.id,result);
        const partial=job.more?previous.countsAvailable!==true||previous.threadsAvailable!==true:result.countsAvailable!==true||result.threadsAvailable!==true;
        const failures=job.more?previous.failures:partial?previous.failures+1:0;
        const backoff=partial?Math.min(120000,15000*2**Math.min(failures-1,3)):120000;
        const retryAt=result.retryAfter?now()+Math.min(3600,Math.max(1,result.retryAfter))*1000:0;
        // Periodic count refreshes must not reset the user's discovery cursor.
        const retainCursor=!job.more&&!job.manual&&previous.discoveryPages>1;
        states.set(job.id,{...state(job.id),status:partial?'partial':'ready',at:now(),nextAt:Math.max(job.more?previous.nextAt:now()+backoff,retryAt),retryAt,failures,error:null,
          ...(retainCursor?{}:{nextCursor:result.nextCursor||null,hasMore:!!result.nextCursor}),
          discoveryPages:job.more?previous.discoveryPages+1:retainCursor?previous.discoveryPages:1,
          ...(job.more?{}:{countsAvailable:result.countsAvailable===true,threadsAvailable:result.threadsAvailable===true,threadsPartial:result.threadsPartial!==false,
            countsAt:result.countsAvailable?now():previous.countsAt||0,threadsAt:result.threadsAvailable?now():previous.threadsAt||0})});
      }).catch(error=>{
        if(disposed)return;
        const failures=previous.failures+1,delay=Math.min(120000,5000*2**Math.min(failures-1,5));
        const retryAt=error.retryAfter?now()+Math.min(3600,Math.max(1,error.retryAfter))*1000:0;
        states.set(job.id,{...state(job.id),status:'error',failures,nextAt:Math.max(now()+delay,retryAt),retryAt,
          error:'Could not refresh Slack. Previous observations are retained.'});
      }).finally(()=>{active.delete(job.id);if(!disposed)pump();});
    }
  }
  return {
    request,
    tick(ids){for(const id of ids){if(!valid(id)||!states.has(id)&&states.size>=12)continue;const s=state(id);if(!active.has(id)&&now()>=s.nextAt&&!jobs.has(`${id}:head`))request(id,{reason:'periodic'});}pump();},
    setOnline(value){const resumed=!online&&value!==false;online=value!==false;if(resumed)for(const id of states.keys())request(id,{reason:'resume'});pump();},
    resume(){for(const id of states.keys())request(id,{reason:'resume'});},
    get:id=>{const s=states.get(id);return s?{...s,queued:[...jobs.values()].some(j=>j.id===id)}:{status:'idle'};},
    status:()=>({online,active:active.size,queued:jobs.size,workspaces:[...states.keys()].map(id=>({id,...states.get(id)}))}),
    dispose(){disposed=true;jobs.clear();states.clear();}
  };
}
