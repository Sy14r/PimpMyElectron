// Only accepts keys already known to this workspace. No generic API proxy.
export function createHistoryLoader({store,read,now=Date.now}) {
  let disposed=false,active=0,cooldownUntil=0;
  const queue=[],pending=new Map();
  const find=(workspaceId,key)=>store.workspaces.get(workspaceId)?.items.get(key);
  async function pump(){
    if(disposed||active>=2||!queue.length)return;
    const job=queue.shift();active++;
    const {workspaceId,key,action,resolve}=job,item=find(workspaceId,key);
    try{
      if(!item)return;
      if(now()<cooldownUntil){item.history={...item.history,status:'error',error:'ratelimited',retryAt:cooldownUntil};return;}
      const cursor=action==='older'?item.history?.nextCursor:null;
      item.history={...item.history,status:'loading',error:null,action};store.revision++;
      const result=await read({workspaceId,channelId:item.channelId,threadTs:item.threadTs,cursor});
      if(disposed||find(workspaceId,key)!==item)return;
      if(!result?.ok){
        if(result?.error==='ratelimited')cooldownUntil=now()+Math.min(3600,Math.max(1,result.retryAfter||60))*1000;
        item.history={...item.history,status:'error',error:result?.error||'request_failed',retryAt:cooldownUntil};return;
      }
      // Only explicit history loads alter paging state. Passive reads do not.
      store.ingest({method:item.threadTs?'conversations.replies':'conversations.history',workspaceId,
        channelId:item.channelId,threadTs:item.threadTs},{ok:true,messages:result.messages,users:result.users});
      const bounded=item.messages.size>=store.maxMessagesPerItem||store.status().messages>=store.maxMessages;
      item.history={status:'ready',error:null,loadedAt:now(),hasMore:result.hasMore===true,
        nextCursor:result.nextCursor||null,bounded,action};
    }catch{if(!disposed&&item)item.history={...item.history,status:'error',error:'request_failed'};}
    finally{active--;pending.delete(key);store.revision++;resolve();if(!disposed)void pump();}
  }
  return {
    load(workspaceId,key,action='open'){
      if(disposed||typeof key!=='string'||!['open','refresh','older'].includes(action))return Promise.resolve(false);
      const item=find(workspaceId,key);if(!item)return Promise.resolve(false);
      if(pending.has(key))return pending.get(key);
      if(action==='open'&&item.history?.status==='ready'&&now()-item.history.loadedAt<30000)return Promise.resolve(false);
      if(action==='older'&&(!item.history?.nextCursor||item.history?.bounded))return Promise.resolve(false);
      if(queue.length>=20)return Promise.resolve(false);
      const done=new Promise(resolve=>queue.push({workspaceId,key,action,resolve}));pending.set(key,done);
      item.history={...item.history,status:'queued',error:null};store.revision++;void pump();return done;
    },
    status:()=>({active,queued:queue.length,cooldownUntil}),
    dispose(){disposed=true;for(const job of queue.splice(0))job.resolve(false);pending.clear();}
  };
}
