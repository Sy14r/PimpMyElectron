// Authentication is used only inside the official renderer, for fixed read methods.
(function installReads() {
  if (window.top !== window || location.origin !== 'https://app.slack.com' || window.__PME_READS__) return;
  const lifetime = new AbortController(), users = new Map(), verified = new Map(), verifying = new Map(), blocked = new Map(), denied = new Map(), listings = new Map(), missingUsers = new Set();
  let cooldownUntil = 0;
  // Only a deadline is persisted; no credentials, names or message content.
  const cooldownKey='pme:read-cooldown:v1';
  try{const saved=Number(sessionStorage.getItem(cooldownKey));if(Number.isFinite(saved)&&saved>0)cooldownUntil=saved;}catch{}
  function cooldown(seconds){cooldownUntil=Math.max(cooldownUntil,Date.now()+seconds*1000);try{sessionStorage.setItem(cooldownKey,String(cooldownUntil));}catch{}}
  const authErrors=new Set(['not_authed','invalid_auth','token_revoked','account_inactive','workspace_mismatch']);
  const permissionErrors=new Set(['missing_scope','access_denied','not_allowed_token_type']);
  function metric(method,event){try{window.__pmeApiMetric?.(JSON.stringify({adapter:'read',method,event}));}catch{}}
  const safeError=error=>errors.has(error.message)||['workspace_changed','workspace_mismatch'].includes(error.message)?error.message:'request_failed';
  const id = (value, pattern) => typeof value === 'string' && pattern.test(value);
  const str = (value, max = 4000) => typeof value === 'string' ? value.slice(0, max) : '';
  const errors = new Set(['not_authed','invalid_auth','token_revoked','account_inactive','channel_not_found',
    'not_in_channel','missing_scope','access_denied','not_allowed_token_type','thread_not_found','invalid_cursor','ratelimited']);
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
    const stopped=blocked.get(workspaceId);if(stopped?.token===token)return {ok:false,error:stopped.error};
    const refused=denied.get(`${workspaceId}:${method}`);if(refused?.token===token)return {ok:false,error:refused.error};
    if(method!=='auth.test'&&verified.get(workspaceId)?.token!==token)throw Error('workspace_mismatch');
    signal.throwIfAborted();metric(method,'request');
    const response = await fetch(`/api/${method}`, {method:'POST',credentials:'same-origin',redirect:'error',
      body:new URLSearchParams({token,_x_team_id:workspaceId,...fields}),signal});
    if (response.status === 429) {
      const delay=Number(response.headers.get('retry-after'));const seconds=Number.isFinite(delay)&&delay>0?delay:60;
      cooldown(seconds);metric(method,'ratelimited');return {ok:false,error:'ratelimited',retryAfter:seconds};
    }
    if (!response.ok) return {ok:false,error:'request_failed'};
    const text = await response.text();if (text.length > 4*1024*1024) return {ok:false,error:'response_too_large'};
    const body = JSON.parse(text);if(context(workspaceId).token!==token)throw Error('workspace_changed');
    if (!body.ok) {
      const error=errors.has(body.error)?body.error:'request_failed';
      if(error==='ratelimited'){cooldown(60);metric(method,'ratelimited');}
      if(authErrors.has(error)){blocked.set(workspaceId,{token,error});verified.delete(workspaceId);metric(method,'auth_failed');}
      if(permissionErrors.has(error))denied.set(`${workspaceId}:${method}`,{token,error});
      return {ok:false,error,...(error==='ratelimited'?{retryAfter:60}:{})};
    }
    return body;
  }
  async function verify(workspaceId,signal){
    const team=context(workspaceId),previous=verified.get(workspaceId);
    if(previous?.token===team.token&&Date.now()-previous.at<300000)return;
    const inFlight=verifying.get(workspaceId);
    if(inFlight?.token===team.token)return inFlight.promise;
    const promise=(async()=>{
      const identity=await api(workspaceId,'auth.test',{},signal);
      if(!identity.ok)throw Object.assign(Error(identity.error||'request_failed'),{retryAfter:identity.retryAfter});
      if(context(workspaceId).token!==team.token)throw Error('workspace_changed');
      if(identity.team_id!==workspaceId||team.user_id&&identity.user_id!==team.user_id){
        blocked.set(workspaceId,{token:team.token,error:'workspace_mismatch'});throw Error('workspace_mismatch');
      }
      verified.set(workspaceId,{token:team.token,at:Date.now()});
    })();
    verifying.set(workspaceId,{token:team.token,promise});
    try{await promise;}finally{if(verifying.get(workspaceId)?.promise===promise)verifying.delete(workspaceId);}
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
        const token=context(workspaceId).token,cached=listings.get(workspaceId);
        const listing=!cursor&&cached?.token===token&&Date.now()-cached.at<900000?cached.body:
          await api(workspaceId,'users.conversations',{types:'public_channel,private_channel,im,mpim',limit:'100',exclude_archived:'true',...(cursor?{cursor}:{})},signal);
        if(!listing.ok)return listing;
        const channels=Array.isArray(listing.channels)?listing.channels.slice(0,100).map(conversation):null;
        if(!channels)return {ok:false,error:'invalid_response'};
        if(!cursor&&listing!==cached?.body)listings.set(workspaceId,{token,at:Date.now(),body:{ok:true,channels:channels.map(c=>Object.fromEntries(['id','name','user','is_im','is_mpim','is_archived'].map(k=>[k,c[k]]))),response_metadata:{next_cursor:str(listing.response_metadata?.next_cursor,2048)}}});
        const result={ok:true,channels,nextCursor:str(listing.response_metadata?.next_cursor,2048)||null};
        if(!cursor){
          // Sequential so a 429/auth failure prevents the remaining request.
          const counts=await api(workspaceId,'client.counts',{thread_counts_by_channel:'true'},signal);
          const threads=await api(workspaceId,'subscriptions.thread.getView',{limit:'20',fetch_threads_state:'true',priority_mode:'all'},signal);
          if(counts.ok)result.counts={ok:true,...Object.fromEntries(['channels','ims','mpims'].map(k=>[k,Array.isArray(counts[k])?counts[k].slice(0,600).map(conversation):[]]))};
          result.countsAvailable=counts.ok===true;
          if(threads.ok&&Array.isArray(threads.threads))result.threads={ok:true,threads:threads.threads.slice(0,20).filter(t=>t.root_msg).map(t=>({root_msg:{...message(t.root_msg),channel:str(t.root_msg.channel,40)},unread_replies:t.unread_replies,mention_count:t.mention_count}))};
          result.threadsAvailable=!!result.threads;result.threadsPartial=threads.has_more!==false;
        }
        // Discovery must not fan out into one users.info request per unknown DM.
        // The passive store already learns names from Slack's own responses/DOM.
        result.users=[];
        if(Date.now()<cooldownUntil)result.retryAfter=Math.ceil((cooldownUntil-Date.now())/1000);
        context(workspaceId);if(location.pathname!==rendererPath)throw Error('workspace_changed');return result;
      }catch(error){return {ok:false,error:signal.aborted?'timeout':safeError(error),...(error.retryAfter?{retryAfter:error.retryAfter}:{})};}
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
        const pending=authors.filter(u=>!users.has(`${workspaceId}:${u}`)&&!missingUsers.has(`${workspaceId}:${u}`)).slice(0,5);
        // Name lookups share this read's deadline, at most two at a time.
        await Promise.all([0,1].map(async()=>{while(pending.length&&!signal.aborted){
          const userId=pending.shift();missingUsers.add(`${workspaceId}:${userId}`);if(missingUsers.size>1200)missingUsers.delete(missingUsers.values().next().value);try {
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
        signal.aborted?'timeout':safeError(error),...(error.retryAfter?{retryAfter:error.retryAfter}:{})};}
    },
    dispose(){lifetime.abort();users.clear();verified.clear();verifying.clear();blocked.clear();denied.clear();listings.clear();missingUsers.clear();delete window.__PME_READS__;}
  };
})();
