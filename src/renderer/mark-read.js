// Explicit conversation read-cursor mutation, separate from the read-only adapter.
(function installMarkRead(){
  if(window.top!==window||location.origin!=='https://app.slack.com'||window.__PME_MARK_READ__)return;
  const lifetime=new AbortController(),pending=new Set();let cooldownUntil=0;
  const timestamp=t=>typeof t==='string'&&/^\d{1,20}\.\d{1,20}$/.test(t);
  const compare=(a,b)=>{const parts=t=>{const [s,f]=t.split('.');return s.padStart(20,'0')+f.padEnd(20,'0');};return parts(a)<parts(b)?-1:parts(a)>parts(b)?1:0;};
  const knownErrors=new Set(['not_authed','invalid_auth','token_revoked','account_inactive','channel_not_found','not_in_channel','missing_scope','access_denied','ratelimited','invalid_timestamp','not_allowed_token_type','workspace_changed','workspace_mismatch','cursor_unavailable']);
  function context(workspaceId){
    if(lifetime.signal.aborted||location.origin!=='https://app.slack.com'||!/^\/client\/[TE][A-Z0-9]+(?:\/|$)/.test(location.pathname))throw Error('workspace_changed');
    const team=JSON.parse(localStorage.getItem('localConfig_v2')||'{}').teams?.[workspaceId];
    if(team?.id!==workspaceId||typeof team.token!=='string'||!team.token||!/^[UW][A-Z0-9]+$/.test(team.user_id||''))throw Error('not_authed');
    return team;
  }
  function rowFrom(body,channelId){
    if(!body?.ok)return null;
    for(const group of ['channels','ims','mpims']){
      const r=Array.isArray(body[group])?body[group].find(r=>r.id===channelId):null;
      if(r&&timestamp(r.last_read))return {group,row:{id:channelId,last_read:r.last_read,
        ...(typeof r.has_unreads==='boolean'?{has_unreads:r.has_unreads}:{}),
        ...(timestamp(r.latest)?{latest:r.latest}:{}),
        ...Object.fromEntries(['dm_count','unread_count','unread_count_display','mention_count'].filter(k=>Number.isInteger(r[k])&&r[k]>=0).map(k=>[k,r[k]]))}};
    }return null;
  }
  window.__PME_MARK_READ__={
    async mark({workspaceId,channelId,ts,threadTs=null}={}){
      if(!/^[TE][A-Z0-9]+$/.test(workspaceId||'')||!/^[CDG][A-Z0-9]+$/.test(channelId||'')||!timestamp(ts)||threadTs!==null)return {ok:false,error:'invalid_request'};
      const key=`${workspaceId}:${channelId}`;
      if(pending.has(key)||pending.size>=2)return {ok:false,error:'busy'};
      if(Date.now()<cooldownUntil)return {ok:false,error:'ratelimited',retryAfter:Math.ceil((cooldownUntil-Date.now())/1000)};
      pending.add(key);const signal=AbortSignal.any([lifetime.signal,AbortSignal.timeout(8000)]);let attempted=false,accepted=false;
      try{
        const team=context(workspaceId),token=team.token,user=team.user_id,rendererPath=location.pathname;
        const api=async(method,fields={})=>{
          if(!['auth.test','client.counts','conversations.mark'].includes(method))throw Error('invalid_request');
          const current=context(workspaceId);if(current.token!==token||current.user_id!==user||location.pathname!==rendererPath)throw Error('workspace_changed');
          signal.throwIfAborted();if(method==='conversations.mark')attempted=true;
          const response=await fetch(`/api/${method}`,{method:'POST',credentials:'same-origin',redirect:'error',body:new URLSearchParams({token,_x_team_id:workspaceId,...fields}),signal});
          if(response.status===429){const seconds=Math.min(3600,Math.max(1,Number(response.headers.get('retry-after'))||60));cooldownUntil=Date.now()+seconds*1000;return {ok:false,error:'ratelimited',retryAfter:seconds};}
          if(!response.ok)throw Error('request_failed');
          const text=await response.text();if(text.length>4*1024*1024)throw Error('request_failed');const body=JSON.parse(text);
          if(body.error==='ratelimited'){cooldownUntil=Date.now()+60000;return {ok:false,error:'ratelimited',retryAfter:60};}return body;
        };
        // Fresh identity verification for every explicit mutation, with the same
        // credential checked immediately before each request.
        const identity=await api('auth.test');if(!identity.ok||identity.team_id!==workspaceId||identity.user_id!==user)throw Error('workspace_mismatch');
        const before=await api('client.counts',{thread_counts_by_channel:'true'});
        if(!before.ok)return {ok:false,error:knownErrors.has(before.error)?before.error:'request_failed',retryAfter:before.retryAfter};
        const existing=rowFrom(before,channelId);if(!existing)throw Error('cursor_unavailable');
        if(compare(existing.row.last_read,ts)>=0)return {ok:true,through:ts,alreadyRead:true,confirmed:true,counts:existing};
        const result=await api('conversations.mark',{channel:channelId,ts});
        if(!result.ok)return {ok:false,error:knownErrors.has(result.error)?result.error:'outcome_unknown',retryAfter:result.retryAfter};
        accepted=true;
        const after=rowFrom(await api('client.counts',{thread_counts_by_channel:'true'}),channelId);
        const confirmed=!!after&&compare(after.row.last_read,ts)>=0;
        return {ok:true,through:ts,confirmed,counts:confirmed?after:null};
      }catch(error){
        // After a write/timeout the result may be unknown. Never repeat the write.
        if(accepted)return {ok:true,through:ts,confirmed:false};
        return {ok:false,error:attempted?'outcome_unknown':knownErrors.has(error.message)?error.message:signal.aborted?'timeout':'request_failed'};
      }finally{pending.delete(key);}
    },
    dispose(){lifetime.abort();delete window.__PME_MARK_READ__;}
  };
})();
