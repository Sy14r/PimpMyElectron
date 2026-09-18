// Authentication is used only inside the official renderer, for fixed read methods.
(function installReads() {
  if (window.top !== window || location.origin !== 'https://app.slack.com' || window.__PME_READS__) return;
  const lifetime = new AbortController(), users = new Map(), verified = new Map();
  let cooldownUntil = 0;
  const id = (value, pattern) => typeof value === 'string' && pattern.test(value);
  const str = (value, max = 4000) => typeof value === 'string' ? value.slice(0, max) : '';
  const errors = new Set(['not_authed','invalid_auth','token_revoked','account_inactive','channel_not_found',
    'not_in_channel','missing_scope','access_denied','thread_not_found','invalid_cursor','ratelimited']);
  function context(workspaceId) {
    if (lifetime.signal.aborted || location.origin !== 'https://app.slack.com' ||
      !location.pathname.match(/^\/client\/([TE][A-Z0-9]+)(?:\/|$)/)) throw Error('workspace_changed');
    const team = JSON.parse(localStorage.getItem('localConfig_v2') || '{}').teams?.[workspaceId];
    if (team?.id && team.id!==workspaceId || typeof team?.token !== 'string' || !team.token) throw Error('not_authed');
    return team;
  }
  async function api(workspaceId, method, fields, signal) {
    // No caller-controlled endpoint or Slack method. Do not broaden this casually.
    if (!['conversations.history','conversations.replies','users.info','users.conversations','client.counts','subscriptions.thread.getView','auth.test'].includes(method)) throw Error('unsupported_read');
    if (Date.now() < cooldownUntil) return {ok:false,error:'ratelimited',retryAfter:Math.ceil((cooldownUntil-Date.now())/1000)};
    const token = context(workspaceId).token;
    if(method!=='auth.test'&&verified.get(workspaceId)?.token!==token)throw Error('workspace_mismatch');
    const response = await fetch(`/api/${method}`, {method:'POST',credentials:'same-origin',redirect:'error',
      body:new URLSearchParams({token,_x_team_id:workspaceId,...fields}),signal});
    if (response.status === 429) {
      const seconds = Math.min(3600,Math.max(1,Number(response.headers.get('retry-after')) || 60));
      cooldownUntil = Date.now()+seconds*1000;return {ok:false,error:'ratelimited',retryAfter:seconds};
    }
    if (!response.ok) return {ok:false,error:'request_failed'};
    const text = await response.text();if (text.length > 4*1024*1024) return {ok:false,error:'response_too_large'};
    const body = JSON.parse(text);context(workspaceId);
    if (!body.ok) {
      const error=errors.has(body.error)?body.error:'request_failed';
      if(error==='ratelimited')cooldownUntil=Date.now()+60000;
      return {ok:false,error,...(error==='ratelimited'?{retryAfter:60}:{})};
    }
    return body;
  }
  async function verify(workspaceId,signal){
    const team=context(workspaceId),previous=verified.get(workspaceId);
    if(previous?.token===team.token&&Date.now()-previous.at<300000)return;
    const identity=await api(workspaceId,'auth.test',{},signal);
    if(identity.error==='ratelimited')throw Object.assign(Error('ratelimited'),{retryAfter:identity.retryAfter||60});
    if(!identity.ok||identity.team_id!==workspaceId||team.user_id&&identity.user_id!==team.user_id)throw Error('workspace_mismatch');
    verified.set(workspaceId,{token:team.token,at:Date.now()});
  }
  function message(m) {
    return {ts:str(m.ts,40),user:str(m.user,40),text:str(m.text),username:str(m.username,160),
      thread_ts:str(m.thread_ts,40),latest_reply:str(m.latest_reply,40),reply_count:Number.isInteger(m.reply_count)?m.reply_count:undefined,
      bot_profile:m.bot_profile?.name?{name:str(m.bot_profile.name,160)}:undefined,
      files:Array.isArray(m.files)&&m.files.length?[{}]:[],attachments:Array.isArray(m.attachments)&&m.attachments.length?[{}]:[]};
  }
  const conversation=r=>({id:str(r.id,40),name:str(r.name||r.name_normalized,180),user:str(r.user,40),
    is_im:r.is_im===true,is_mpim:r.is_mpim===true,is_archived:r.is_archived===true,
    has_unreads:r.has_unreads,dm_count:r.dm_count,unread_count_display:r.unread_count_display,unread_count:r.unread_count,
    mention_count:r.mention_count,mention_count_display:r.mention_count_display,
    latest:typeof r.latest==='string'?str(r.latest,40):r.latest?.ts?message(r.latest):undefined});
  window.__PME_READS__ = {
    async activity({workspaceId,cursor=null}={}){
      if(!id(workspaceId,/^[TE][A-Z0-9]+$/)||cursor!==null&&(typeof cursor!=='string'||cursor.length>2048))return {ok:false,error:'invalid_request'};
      const signal=AbortSignal.any([lifetime.signal,AbortSignal.timeout(8000)]);
      try{
        const rendererPath=location.pathname;await verify(workspaceId,signal);
        const listing=await api(workspaceId,'users.conversations',{types:'public_channel,private_channel,im,mpim',limit:'100',exclude_archived:'true',...(cursor?{cursor}:{})},signal);
        if(!listing.ok)return listing;
        const channels=Array.isArray(listing.channels)?listing.channels.slice(0,100).map(conversation):null;
        if(!channels)return {ok:false,error:'invalid_response'};
        const result={ok:true,channels,nextCursor:str(listing.response_metadata?.next_cursor,2048)||null};
        if(!cursor){
          const [counts,threads]=await Promise.all([
            api(workspaceId,'client.counts',{thread_counts_by_channel:'true'},signal).catch(()=>({ok:false})),
            api(workspaceId,'subscriptions.thread.getView',{limit:'20',fetch_threads_state:'true',priority_mode:'all'},signal).catch(()=>({ok:false}))]);
          if(counts.ok)result.counts={ok:true,...Object.fromEntries(['channels','ims','mpims'].map(k=>[k,Array.isArray(counts[k])?counts[k].slice(0,600).map(conversation):[]]))};
          result.countsAvailable=counts.ok===true;
          if(threads.ok&&Array.isArray(threads.threads))result.threads={ok:true,threads:threads.threads.slice(0,20).filter(t=>t.root_msg).map(t=>({root_msg:{...message(t.root_msg),channel:str(t.root_msg.channel,40)},unread_replies:t.unread_replies,mention_count:t.mention_count}))};
          result.threadsAvailable=!!result.threads;result.threadsPartial=threads.has_more!==false;
        }
        const peers=[...new Set(channels.map(c=>c.user).filter(u=>id(u,/^[UW][A-Z0-9]+$/)))];
        const missing=peers.filter(u=>!users.has(`${workspaceId}:${u}`)).slice(0,10);
        await Promise.all([0,1].map(async()=>{while(missing.length&&!signal.aborted){const userId=missing.shift();try{
          const found=await api(workspaceId,'users.info',{user:userId},signal);if(found.ok&&found.user?.id===userId){const u=found.user;users.set(`${workspaceId}:${userId}`,{id:userId,name:str(u.profile?.display_name||u.real_name||u.name,160)});if(users.size>1200)users.delete(users.keys().next().value);}
        }catch{}}}));
        result.users=peers.map(u=>users.get(`${workspaceId}:${u}`)).filter(Boolean);
        if(Date.now()<cooldownUntil)result.retryAfter=Math.ceil((cooldownUntil-Date.now())/1000);
        context(workspaceId);if(location.pathname!==rendererPath)throw Error('workspace_changed');return result;
      }catch(error){return {ok:false,error:error.message==='ratelimited'?'ratelimited':signal.aborted?'timeout':'request_failed',...(error.retryAfter?{retryAfter:error.retryAfter}:{})};}
    },
    async read({workspaceId,channelId,threadTs=null,cursor=null}={}) {
      if(!id(workspaceId,/^[TE][A-Z0-9]+$/)||!id(channelId,/^[CDG][A-Z0-9]+$/)||
        threadTs!==null&&!id(threadTs,/^\d+\.\d+$/)||cursor!==null&&(typeof cursor!=='string'||cursor.length>2048)) return {ok:false,error:'invalid_request'};
      const signal=AbortSignal.any([lifetime.signal,AbortSignal.timeout(8000)]);
      try {
        const rendererPath=location.pathname;await verify(workspaceId,signal);
        const fields={channel:channelId,limit:'40',...(threadTs?{ts:threadTs}:{}),...(cursor?{cursor}:{})};
        const body=await api(workspaceId,threadTs?'conversations.replies':'conversations.history',fields,signal);
        if(!body.ok)return body;
        if(!Array.isArray(body.messages))return {ok:false,error:'invalid_response'};
        const messages=body.messages.slice(0,40).filter(m=>m&&id(m.ts,/^\d+\.\d+$/)).map(message);
        const authors=[...new Set(messages.map(m=>m.user).filter(u=>id(u,/^[UW][A-Z0-9]+$/)))];
        const pending=authors.filter(u=>!users.has(`${workspaceId}:${u}`)).slice(0,5);
        // Name lookups share this read's deadline, at most two at a time.
        await Promise.all([0,1].map(async()=>{while(pending.length&&!signal.aborted){
          const userId=pending.shift();try {
            const result=await api(workspaceId,'users.info',{user:userId},signal);
            if(result.ok&&result.user?.id===userId){const u=result.user;
              users.set(`${workspaceId}:${userId}`,{id:userId,name:str(u.profile?.display_name||u.real_name||u.name,160)});
              if(users.size>1200)users.delete(users.keys().next().value);
            }
          }catch{/* Names are optional; message content is still useful. */}
        }}));
        context(workspaceId);
        if(location.pathname!==rendererPath)throw Error('workspace_changed');
        const nextCursor=str(body.response_metadata?.next_cursor,2048)||null;
        return {ok:true,messages,users:authors.map(u=>users.get(`${workspaceId}:${u}`)).filter(Boolean),
          hasMore:body.has_more===true||!!nextCursor,nextCursor};
      }catch(error){return {ok:false,error:lifetime.signal.aborted?'cancelled':
        signal.aborted?'timeout':['workspace_changed','workspace_mismatch','not_authed','ratelimited'].includes(error.message)?error.message:'request_failed',...(error.retryAfter?{retryAfter:error.retryAfter}:{})};}
    },
    dispose(){lifetime.abort();users.clear();verified.clear();delete window.__PME_READS__;}
  };
})();
