// Reads existing Redux snapshots; never dispatches, invokes selectors or loads data.
(function installStateObserver(){
  if(window.top!==window||location.origin!=='https://app.slack.com'||window.__PME_OBSERVER__)return;
  let disposed=false,scanTimer=null;const watches=new Map();
  const health={workspaces:0,snapshots:0,errors:0,truncated:false,lastSnapshot:0};
  const teamId=v=>typeof v==='string'&&/^[TE][A-Z0-9]+$/.test(v);
  const channelId=v=>typeof v==='string'&&/^[CDG][A-Z0-9]+$/.test(v);
  const userId=v=>typeof v==='string'&&/^[UW][A-Z0-9]+$/.test(v);
  const ts=v=>typeof v==='string'&&/^\d{1,20}\.\d{1,20}$/.test(v)?v:undefined;
  const str=(v,n)=>typeof v==='string'?v.slice(0,n):undefined;
  const compare=(a,b)=>{const p=v=>{const [s,f]=v.split('.');return s.padStart(20,'0')+f.padEnd(20,'0');};return p(a)<p(b)?-1:p(a)>p(b)?1:0;};
  const count=v=>Number.isInteger(v)&&v>=0?v:undefined;
  // Slack's immutable dictionaries inherit entries from earlier versions.
  // Read data properties only, respecting own tombstones without invoking getters.
  function data(o,key){for(let depth=0;o&&typeof o==='object'&&depth<100;depth++,o=Object.getPrototypeOf(o)){
    const d=Object.getOwnPropertyDescriptor(o,key);if(d)return 'value' in d?d.value:undefined;
  }}
  function keys(o,limit){const out=[];if(!o||typeof o!=='object')return out;for(const k in o){out.push(k);if(out.length>=limit)break;}return out;}
  function accounts(){try{return Object.values(JSON.parse(localStorage.getItem('localConfig_v2')||'{}').teams||{}).filter(w=>teamId(w.id)).slice(0,12).map(w=>({id:w.id,name:str(w.name,180)||w.id,userId:userId(w.user_id)?w.user_id:undefined}));}catch{return [];}}
  function message(raw,channel){if(!raw||!ts(raw.ts)||raw.no_display===true)return null;return {channel,ts:raw.ts,user:userId(raw.user)?raw.user:undefined,text:str(raw.text,4000),
    username:str(raw.username||raw.bot_profile?.name,160),thread_ts:ts(raw.thread_ts),latest_reply:ts(raw.latest_reply),reply_count:count(raw.reply_count),
    files:raw.files?.length?[{}]:[],attachments:raw.attachments?.length?[{}]:[]};}
  function project(state,known){
    const workspaceId=state.selfTeamIds?.teamId;
    if(!teamId(workspaceId)||!known.some(w=>w.id===workspaceId)||!state.channels||!state.channelCursors||!state.channelLatests)return null;
    const account=known.find(w=>w.id===workspaceId);
    if(account.userId&&state.bootData?.user_id&&account.userId!==state.bootData.user_id)return null;
    const result={rendererWorkspaceId:location.pathname.match(/^\/client\/([TE][A-Z0-9]+)/)?.[1],workspaceId,knownWorkspaces:known.map(({id,name})=>({id,name})),
      channels:[],users:[],messages:[],threads:[],truncated:false};
    const ids=keys(state.channels,601).filter(channelId);if(ids.length>600)result.truncated=true;
    for(const id of ids.slice(0,600)){
      const c=data(state.channels,id);if(!c||c.id!==id||c.isUnknown||c.isNonExistent)continue;
      const current=data(state.unreadCounts?.countsPerChannel,id),initial=data(state.unreadCounts?.initialUnreads,id),unreads=c.unreads,highlights=c.unread_highlights;
      // Slack updates countsPerChannel even when startup counts and the channel's
      // unread arrays stay unchanged. A live zero must also override stale positives.
      const currentCount=count(current?.unreadCnt),currentMentions=count(current?.unreadHighlightCnt);
      const initialCount=count(initial?.unreadCnt),initialMentions=count(initial?.unreadHighlightCnt);
      const knownUnread=initialCount!==undefined&&Array.isArray(unreads);
      const knownMentions=initialMentions!==undefined&&Array.isArray(highlights);
      result.channels.push({id,name:str(c.name||c.name_normalized,180),user:userId(c.user)?c.user:undefined,
        is_im:c.is_im===true,is_mpim:c.is_mpim===true,is_archived:c.is_archived===true,
        has_unreads:currentCount!==undefined?currentCount>0:initialCount>0||Array.isArray(unreads)&&unreads.length>0?true:knownUnread?false:undefined,
        // Preserve unknown exact counts instead of presenting a guessed total.
        mentionObserved:currentMentions!==undefined?currentMentions>0:initialMentions>0||Array.isArray(highlights)&&highlights.length>0?true:knownMentions?false:undefined,
        latest:ts(data(state.channelLatests,id)),last_read:ts(data(state.channelCursors,id))});
    }
    const peers=result.channels.map(c=>c.user).filter(Boolean),names=[...new Set([...peers,...keys(state.members,1201).filter(userId)])];
    if(names.length>1200)result.truncated=true;
    for(const id of names.slice(0,1200)){const u=data(state.members,id);if(u?.id===id)result.users.push({id,name:str(u.profile?.display_name||u.profile?.real_name||u.real_name||u.name,160)});}
    // Latest activity first, bounded independently of workspace size.
    const messageChannels=keys(state.messages,601).filter(channelId);if(messageChannels.length>100)result.truncated=true;
    const messages=[];
    for(const channel of messageChannels.slice(0,100)){
      const rows=data(state.messages,channel),stamps=keys(rows,2001).filter(ts).sort(compare).reverse();if(stamps.length>2000)result.truncated=true;
      for(const stamp of stamps.slice(0,200))messages.push({channel,stamp,raw:data(rows,stamp)});
      messages.sort((a,b)=>compare(b.stamp,a.stamp));if(messages.length>200){result.truncated=true;messages.length=200;}
    }
    result.messages=messages.map(m=>message(m.raw,m.channel)).filter(Boolean);
    for(const key of keys(state.threadSub,201)){
      const match=key.match(/^([CDG][A-Z0-9]+)-(\d+\.\d+)$/),sub=data(state.threadSub,key);if(!match||!sub||sub.id!==key)continue;
      const root=message(data(data(state.messages,match[1]),match[2]),match[1]);
      result.threads.push({channel:match[1],ts:match[2],last_read:ts(sub.lastRead),subscribed:sub.subscribed===true,root});
      if(result.threads.length===200){result.truncated=true;break;}
    }
    return result;
  }
  function publish(watch,force=false){
    watch.timer=null;if(disposed)return;
    try{
      const state=watch.store.getState(),known=accounts(),parts=['channels','channelCursors','channelLatests','unreadCounts','members','messages','threadSub'].map(k=>state[k]);
      const scope=JSON.stringify([location.pathname,known]);
      if(!force&&watch.parts&&parts.every((p,i)=>p===watch.parts[i])&&watch.scope===scope&&Date.now()-watch.at<30000)return;
      const snapshot=project(state,known);if(!snapshot||typeof window.__pmeClientState!=='function')return;
      let serialized=JSON.stringify(snapshot);
      // The local binding has a fixed ceiling. Never export raw store state.
      for(const field of ['messages','users','channels','threads'])while(serialized.length>300000&&snapshot[field].length){snapshot[field].length=Math.floor(snapshot[field].length*0.75);snapshot.truncated=true;serialized=JSON.stringify(snapshot);}
      if(serialized.length>300000)return;
      watch.parts=parts;watch.scope=scope;
      if(!force&&serialized===watch.last&&Date.now()-watch.at<30000)return;
      window.__pmeClientState(serialized);watch.last=serialized;watch.at=Date.now();
      health.snapshots++;health.lastSnapshot=watch.at;health.truncated=snapshot.truncated;
    }catch{health.errors++;}
  }
  function readState(request){
    // Resolve an explicit keyboard action from the already-mounted workspace
    // store, without navigation, selectors, dispatch or a network request.
    if(disposed||!teamId(request?.workspaceId)||!channelId(request?.channelId)||request.threadTs&&!ts(request.threadTs))return null;
    const watch=watches.get(request.workspaceId);if(!watch)return null;
    try{
      const snapshot=project(watch.store.getState(),accounts());if(!snapshot)return null;
      // A socket event can invalidate the host's state after our last identical
      // snapshot. Republish even if ordinary background deduplication would skip.
      clearTimeout(watch.timer);publish(watch,true);
      if(!request.threadTs)return snapshot.channels.find(c=>c.id===request.channelId)?.has_unreads??null;
      const thread=snapshot.threads.find(t=>t.channel===request.channelId&&t.ts===request.threadTs);
      if(!thread?.last_read)return null;
      const stamps=[thread.root?.ts,thread.root?.latest_reply,...snapshot.messages.filter(m=>m.channel===request.channelId&&m.thread_ts===request.threadTs).map(m=>m.ts)].filter(ts);
      const latest=stamps.sort(compare).at(-1);
      return latest?compare(latest,thread.last_read)>0:null;
    }catch{health.errors++;return null;}
  }
  function schedule(watch){if(!disposed&&!watch.timer)watch.timer=setTimeout(()=>publish(watch),500);}
  function discover(){
    if(disposed)return;
    try{
      const known=accounts(),allowed=new Set(known.map(w=>w.id)),queue=[],seen=new Set(),subscriptions=new Set(),found=new Map();
      for(const node of Array.from(document.body?.children||[]).slice(0,30)){
        const key=Object.getOwnPropertyNames(node).find(k=>k.startsWith('__reactContainer$'));
        if(key){const root=node[key];queue.push(root?.stateNode?.current||root);}
      }
      for(let index=0;index<queue.length&&seen.size<3000;index++){
        const fiber=queue[index];if(!fiber||seen.has(fiber))continue;seen.add(fiber);
        for(const props of [fiber.memoizedProps,fiber.memoizedProps?.value]){
          const store=data(props,'store');if(!store||typeof store.getState!=='function'||typeof store.subscribe!=='function'||subscriptions.has(store.subscribe))continue;
          subscriptions.add(store.subscribe);const state=store.getState(),id=state?.selfTeamIds?.teamId;
          if(allowed.has(id)&&state.channels&&state.channelCursors&&state.channelLatests&&!found.has(id))found.set(id,store);
        }
        if(fiber.child)queue.push(fiber.child);if(fiber.sibling)queue.push(fiber.sibling);
      }
      for(const [id,watch] of watches)if(!found.has(id)||found.get(id).subscribe!==watch.store.subscribe){watch.unsubscribe();clearTimeout(watch.timer);watches.delete(id);}
      for(const [id,store] of found){
        let watch=watches.get(id);
        if(!watch){watch={store,last:null,at:0,timer:null};watch.unsubscribe=store.subscribe(()=>schedule(watch));watches.set(id,watch);}
        schedule(watch);
      }
      health.workspaces=watches.size;
    }catch{health.errors++;}
  }
  window.__PME_OBSERVER__={version:'0.14.2',readState,status:()=>({...health}),dispose(){disposed=true;clearInterval(scanTimer);for(const w of watches.values()){w.unsubscribe();clearTimeout(w.timer);}watches.clear();delete window.__PME_OBSERVER__;}};
  discover();scanTimer=setInterval(discover,10000);
})();
