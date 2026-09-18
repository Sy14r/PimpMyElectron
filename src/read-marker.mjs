// Host gate: mutations can only acknowledge an explicitly selected, loaded message.
export function createReadMarker({store,mark,onResult=()=>{},now=Date.now}){
  const states=new Map(),pending=new Map();let disposed=false;
  return {
    state:key=>states.get(key)||null,
    mark(workspaceId,key,ts){
      const item=store.workspaces.get(workspaceId)?.items.get(key);
      if(disposed||!item||item.threadTs||!item.messages.has(ts))return Promise.resolve(false);
      if(pending.has(key))return pending.get(key);
      const previous=states.get(key);if(previous?.retryAt>now())return Promise.resolve(false);
      // Copy the timestamp, never substitute item.latest after an async read.
      const request={workspaceId,channelId:item.channelId,ts};
      states.set(key,{status:'pending',through:ts});store.revision++;
      const task=Promise.resolve().then(()=>mark(request)).then(result=>{
        if(disposed||store.workspaces.get(workspaceId)?.items.get(key)!==item)return false;
        if(!result?.ok){states.set(key,{status:result?.error==='outcome_unknown'?'uncertain':'error',through:ts,error:result?.error||'request_failed',retryAt:result?.retryAfter?now()+Math.min(3600,Math.max(1,result.retryAfter))*1000:0});return false;}
        states.set(key,{status:result.confirmed?'success':'saved',through:ts,alreadyRead:result.alreadyRead===true});
        if(result.counts?.row?.id===item.channelId&&['channels','ims','mpims'].includes(result.counts.group))store.ingest({method:'client.counts',workspaceId},{ok:true,[result.counts.group]:[result.counts.row]});
        return true;
      }).catch(()=>{if(!disposed)states.set(key,{status:'uncertain',through:ts,error:'outcome_unknown'});return false;})
      .finally(()=>{pending.delete(key);if(!disposed){store.revision++;onResult(workspaceId);while(states.size>4800)states.delete(states.keys().next().value);}});
      pending.set(key,task);return task;
    },
    dispose(){disposed=true;states.clear();pending.clear();}
  };
}
