// Shared ordinary-Slack navigation for mounted sidebar destinations. This uses
// Slack's rendered controls only; it does not dispatch store actions or fetch.
(()=>{
  'use strict';
  if(window.__PME_NATIVE_NAVIGATION__||location.origin!=='https://app.slack.com')return;
  const SIDEBAR='[data-qa="channel-sidebar"]',CHANNEL='[data-qa="channel-sidebar-channel"]',ROW='[data-qa="virtual-list-item"]';
  let disposed=false,generation=0;
  const detached=new Map();
  const valid=request=>request&&/^[TE][A-Z0-9]+$/.test(request.workspaceId||'')&&/^[CDG][A-Z0-9]+$/.test(request.channelId||'');
  const route=()=>location.pathname.match(/^\/client\/([TE][A-Z0-9]+)(?:\/([CDG][A-Z0-9]+|dms|activity-inbox))?(?:\/|$)/);
  function idFrom(node){
    if(!node)return null;
    for(const value of [node.getAttribute?.('data-qa-channel-sidebar-channel-id'),node.getAttribute?.('data-channel-id'),node.getAttribute?.('data-item-key'),node.id]){
      const match=String(value||'').match(/(?:^|[-_:])([CDG][A-Z0-9]+)$/);if(match)return match[1];
    }
    return null;
  }
  function destination(node){
    const channel=node?.closest?.(CHANNEL);if(!channel||!channel.closest?.(SIDEBAR))return null;
    const row=channel.closest(ROW)||channel,link=channel.closest?.('a[href*="/client/"]')||channel.querySelector?.('a[href*="/client/"]')||row.querySelector?.('a[href*="/client/"]');
    let linked=null;try{linked=link&&new URL(link.getAttribute?.('href')||link.href,location.href).pathname.match(/^\/client\/([TE][A-Z0-9]+)\/([CDG][A-Z0-9]+)(?:\/|$)/);}catch{}
    const current=route(),workspaceId=linked?.[1]||current?.[1],channelId=linked?.[2]||idFrom(channel)||idFrom(row);if(!workspaceId||!channelId)return null;
    const named=channel.querySelector?.('.p-channel_sidebar__name,[data-qa^="channel_sidebar_name_"]');
    return {workspaceId,channelId,name:String(named?.textContent||channel.getAttribute?.('aria-label')||channelId).replace(/\s+/g,' ').trim().slice(0,120),row,control:channel};
  }
  function mounted(request){
    const exact=[...document.querySelectorAll(CHANNEL)].find(node=>idFrom(node)===request.channelId&&node.closest?.(SIDEBAR));
    if(exact)return exact;
    return request.control?.isConnected&&idFrom(request.control)===request.channelId&&request.control.closest?.(SIDEBAR)?request.control:null;
  }
  function inWorkspace(workspaceId){const active=document.querySelector('[data-qa="team_sidebar_item"][data-team-active="true"]')?.getAttribute('data-team');return route()?.[1]===workspaceId&&(!active||active===workspaceId);}
  function surface(request){
    if(!inWorkspace(request.workspaceId))return null;
    const boxes=[...document.querySelectorAll('[data-qa="message_input"][data-channel-id]')].filter(node=>node.getAttribute('data-channel-id')===request.channelId&&!node.getAttribute('data-thread-ts'));
    if(boxes.length!==1)return null;
    const editor=boxes[0].querySelector('[data-qa="texty_input"][contenteditable="true"]'),view=editor?.closest?.('.p-view_contents');
    return editor?.isConnected!==false&&view?.isConnected!==false?{box:boxes[0],editor,view}:null;
  }
  function layoutDiagnostics(){
    const root=document.documentElement;if(!root?.hasAttribute('data-pme-reply-window'))return null;
    const target=replyWindowTarget(),found=target&&surface(target),round=value=>Number.isFinite(value)?Math.round(value*10)/10:null;
    const label=node=>{if(node===root)return'html';if(node===document.body)return'body';for(const [name,selector] of [['composer','[data-qa="message_input"]'],['view-contents','.p-view_contents'],['workspace-tabpanel','.p-client_workspace__tabpanel'],['workspace-wrapper','.p-client_workspace_wrapper'],['ia4-client','.p-ia4_client'],['client-ui','#client-ui']])try{if(node?.matches?.(selector))return name;}catch{}return String(node?.tagName||'unknown').toLowerCase();};
    const describe=node=>{if(!node)return null;const rect=node.getBoundingClientRect?.(),css=getComputedStyle(node),classes=[...(node.classList||[])].filter(value=>/^(?:p|c|sk)-[a-z0-9_-]{1,80}$/i.test(value)).slice(0,12);return {node:label(node),classes,rect:rect&&{top:round(rect.top),bottom:round(rect.bottom),height:round(rect.height),left:round(rect.left),right:round(rect.right),width:round(rect.width)},display:css.display,position:css.position,height:css.height,minHeight:css.minHeight,maxHeight:css.maxHeight,gridTemplateRows:css.gridTemplateRows,flex:css.flex,overflow:css.overflow,overflowY:css.overflowY};};
    const chain=[];for(let node=found?.box||document.querySelector('[data-qa="message_input"]');node&&chain.length<24;node=node.parentElement)chain.push(describe(node));
    const bottom=[];for(let node=document.elementFromPoint?.(Math.max(0,innerWidth/2),Math.max(0,innerHeight-2));node&&bottom.length<10;node=node.parentElement)bottom.push(describe(node));
    return {viewport:{width:innerWidth,height:innerHeight,clientWidth:root.clientWidth,clientHeight:root.clientHeight,bodyClientHeight:document.body?.clientHeight||0,bodyScrollHeight:document.body?.scrollHeight||0},targetReady:!!found,chain,bottom};
  }
  function replyWindowTarget(){const marked=window.__PME_REPLY_BOOTSTRAP__?.target;if(valid(marked))return {workspaceId:marked.workspaceId,channelId:marked.channelId};const match=String(window.name||'').match(/(?:^|,)frameId=pme-reply-([TE][A-Z0-9]+)-([CDG][A-Z0-9]+)-[^,]+/);return match?{workspaceId:match[1],channelId:match[2]}:null;}
  function installReplyBoot(){
    const target=replyWindowTarget();if(!target)return null;
    const style=document.createElement('style'),cover=document.createElement('main'),mark=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span');
    let stopped=false,revealed=false,scheduled=false;
    style.id='pme-reply-boot-style';style.textContent='html[data-pme-reply-window] body :is(.p-ia4_top_nav,[data-qa="tab_rail_desktop"],.p-control_strip,.p-view_contents--sidebar:has([data-qa="channel-sidebar"]),.p-ia4_client__resizer--sidebar,[data-pme-layout-more],[data-pme-layout-menu]){display:none!important}html[data-pme-reply-window] body .p-ia4_client{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-height:100vh!important;max-height:100vh!important;grid-template-rows:minmax(0,1fr)!important}html[data-pme-reply-window] body .p-client_workspace_wrapper{height:100%!important;min-height:0!important;max-height:none!important}html[data-pme-reply-window] body .p-view_contents--primary{height:100%!important;max-height:none!important;flex:1 1 auto!important}html[data-pme-reply-window] body :is(.p-client_workspace__tabpanel,.p-client_workspace_wrapper){grid-template-columns:0 minmax(0,1fr)!important}[data-pme-reply-boot]{position:fixed!important;inset:0!important;z-index:2147483647!important;display:grid!important;place-content:center!important;gap:12px!important;box-sizing:border-box!important;padding:32px!important;background:#1a1d21!important;color:#f8f8f8!important;text-align:center!important;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}[data-pme-reply-boot] [data-pme-reply-mark]{width:36px;height:36px;margin:0 auto 4px;border-radius:10px;background:#611f69;box-shadow:0 8px 28px #0007}[data-pme-reply-boot] strong{font-size:18px;font-weight:650}[data-pme-reply-boot] span{color:#c9c9ca}';
    const root=document.documentElement;root.setAttribute('data-pme-reply-window','');
    cover.setAttribute('data-pme-reply-boot','');cover.setAttribute('role','status');cover.setAttribute('aria-live','polite');mark.setAttribute('data-pme-reply-mark','');title.textContent='Opening reply…';detail.textContent='Slack is preparing the conversation.';cover.append(mark,title,detail);root.append(style);document.body.append(cover);
    const finish=()=>{if(stopped||revealed)return;const found=surface(target);if(!found)return;revealed=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(stopped)return;root.removeAttribute('data-pme-reply-bootstrap');root.removeAttribute('data-pme-reply-delayed');cover.remove();try{found.editor.focus({preventScroll:true});}catch{}}));};
    const schedule=()=>{if(stopped||scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;finish();});};
    const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-channel-id','data-team-active']});
    const delayed=setTimeout(()=>{if(stopped||revealed)return;root.setAttribute('data-pme-reply-delayed','');title.textContent='Still preparing this reply…';detail.textContent='The window will remain private until the requested composer is ready.';},15000);finish();
    return {status:()=>({dedicated:true,covered:cover.isConnected&&!revealed,revealed,target:{...target}}),dispose(){if(stopped)return;stopped=true;clearTimeout(delayed);observer.disconnect();cover.remove();style.remove();root.removeAttribute('data-pme-reply-bootstrap');root.removeAttribute('data-pme-reply-delayed');root.removeAttribute('data-pme-reply-window');document.getElementById('pme-reply-bootstrap-style')?.remove();}};
  }
  function current(){const currentRoute=route(),workspaceId=currentRoute?.[1];if(!workspaceId)return null;const boxes=[...document.querySelectorAll('[data-qa="message_input"][data-channel-id]')].filter(node=>!node.getAttribute('data-thread-ts')),preferred=boxes.find(node=>node.getAttribute('data-channel-id')===currentRoute?.[2])||boxes.find(node=>node.querySelector?.('[data-qa="texty_input"][contenteditable="true"]')?.isConnected!==false),channelId=preferred?.getAttribute('data-channel-id');return /^[CDG][A-Z0-9]+$/.test(channelId||'')?{workspaceId,channelId}:null;}
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function open(request,{focusComposer=false}={}){
    if(disposed||!valid(request))return {ok:false,error:'Invalid Slack destination'};
    const run=++generation;await pause(0);if(disposed||run!==generation)return {ok:false,cancelled:true};
    const control=mounted(request);if(!control?.click)return {ok:false,error:'This Slack destination is no longer mounted'};
    control.click();
    if(!focusComposer)return {ok:true,focused:false};
    const deadline=Date.now()+5000;while(!disposed&&run===generation&&Date.now()<deadline){const found=surface(request);if(found){found.editor.focus({preventScroll:true});return {ok:true,focused:document.activeElement===found.editor};}await pause(60);}
    return {ok:false,error:'Slack opened the destination but its composer is unavailable'};
  }
  function childOpen(child){try{return !!child&&!child.closed;}catch{return false;}}
  function childRoute(child){try{return child.location.pathname.match(/^\/client\/([TE][A-Z0-9]+)(?:\/([CDG][A-Z0-9]+))?(?:\/|$)/);}catch{return null;}}
  function childSurface(child,request){
    try{
      const boxes=[...child.document.querySelectorAll('[data-qa="message_input"][data-channel-id]')].filter(node=>node.getAttribute('data-channel-id')===request.channelId&&!node.getAttribute('data-thread-ts'));
      const editor=boxes.length===1&&boxes[0].querySelector('[data-qa="texty_input"][contenteditable="true"]');
      return editor?.isConnected!==false?editor:null;
    }catch{return null;}
  }
  function focusDetached(record,request,deadline=Date.now()+8000,run=record.focusRun){
    const child=record.child;if(disposed||run!==record.focusRun||!childOpen(child)||Date.now()>deadline)return;
    try{
      const editor=childSurface(child,request);if(editor){editor.focus({preventScroll:true});return;}
    }catch{}
    setTimeout(()=>focusDetached(record,request,deadline,run),80);
  }
  async function childWindowCall(record,method){
    try{
      let id=record.windowId,bridge=window.desktop?.window;
      if(!Number.isInteger(id)){const childBridge=record.child.desktop?.window;if(!childBridge?.getWindowId)return false;id=await childBridge.getWindowId();if(!Number.isInteger(id))return false;record.windowId=id;if(!bridge?.callBrowserWindowMethod)bridge=childBridge;}
      if(!bridge?.callBrowserWindowMethod)return false;await bridge.callBrowserWindowMethod(id,method);return true;
    }catch{return false;}
  }
  function revealDetached(record,request,deadline=Date.now()+12000,run=++record.revealRun){
    const child=record.child;if(disposed||run!==record.revealRun||!childOpen(child))return;
    const editor=childSurface(child,request);let covered=false,bootstrapped=false;try{covered=child.__PME_NATIVE_NAVIGATION__?.replyBoot?.status?.().covered===true;const boot=child.__PME_REPLY_BOOTSTRAP__;bootstrapped=boot?.active===true&&boot.target?.workspaceId===request.workspaceId&&boot.target?.channelId===request.channelId;}catch{}
    if(editor||covered||bootstrapped||Date.now()>deadline){
      if(editor)record.ready=true;
      void (async()=>{if(run!==record.revealRun||!childOpen(child))return;const shown=await childWindowCall(record,'show');if(run!==record.revealRun)return;record.visible=shown||record.visible;await childWindowCall(record,'focus');try{child.focus();}catch{}if(editor)try{editor.focus({preventScroll:true});}catch{}else focusDetached(record,request,Date.now()+8000,record.focusRun);})();return;
    }
    setTimeout(()=>revealDetached(record,request,deadline,run),50);
  }
  function navigateDetached(record,request){
    const child=record.child,url=new URL(`/client/${request.workspaceId}/${request.channelId}`,location.origin).href,run=++record.routeRun;
    const canSoftRoute=record.ready===true;record.ready=false;record.request={workspaceId:request.workspaceId,channelId:request.channelId,name:request.name};record.focusRun++;record.revealRun++;
    const navigate=async()=>{
      if(disposed||run!==record.routeRun||!childOpen(child))return;
      if(record.visible){await childWindowCall(record,'hide');record.visible=false;if(disposed||run!==record.routeRun||!childOpen(child))return;}
      try{child.name=`frameId=pme-reply-${request.workspaceId}-${request.channelId}-${record.token}`;}catch{}
      let soft=false;
      if(canSoftRoute)try{const anchor=child.document.createElement('a');anchor.href=url;anchor.setAttribute('data-pme-reply-route','');anchor.hidden=true;child.document.body.append(anchor);anchor.click();anchor.remove();soft=true;}catch{}
      if(!soft)try{child.location.replace(url);}catch{try{child.location.href=url;}catch{return;}}
      if(record.prewarm)settlePrewarm(record,request);else revealDetached(record,request);
      if(soft)setTimeout(()=>{if(disposed||run!==record.routeRun||!childOpen(child)||childRoute(child)?.[2]===request.channelId)return;try{child.location.replace(url);}catch{try{child.location.href=url;}catch{}}},700);
    };
    void navigate();
  }
  function settlePrewarm(record,request,deadline=Date.now()+12000,run=++record.warmRun){
    if(disposed||run!==record.warmRun||!childOpen(record.child))return;
    if(childSurface(record.child,request)||Date.now()>deadline){
      record.ready=true;
      if(record.pendingRequest){const pending=record.pendingRequest;record.pendingRequest=null;record.prewarm=false;if(!warmNavigate(record,pending))navigateDetached(record,pending);else revealDetached(record,pending);}
      return;
    }
    setTimeout(()=>settlePrewarm(record,request,deadline,run),50);
  }
  function prepareDetached(record,deadline=Date.now()+2500){
    if(disposed||!childOpen(record.child))return;
    let ready=false;try{ready=record.child.__PME_REPLY_BOOTSTRAP__?.prepared===record.token;}catch{}
    if(ready||Date.now()>deadline){record.preparing=false;navigateDetached(record,record.pendingRequest||record.request);return;}
    setTimeout(()=>prepareDetached(record,deadline),25);
  }
  function warmNavigate(record,request){
    const child=record.child;if(childRoute(child)?.[1]!==request.workspaceId)return false;
    const editor=childSurface(child,request);if(editor){try{editor.focus({preventScroll:true});}catch{}record.request=request;return true;}
    try{
      const control=[...child.document.querySelectorAll(CHANNEL)].find(node=>idFrom(node)===request.channelId&&node.closest?.(SIDEBAR));
      if(!control?.click)return false;control.click();record.request=request;record.focusRun++;focusDetached(record,request,Date.now()+8000,record.focusRun);return true;
    }catch{return false;}
  }
  function createDetached(request,{prewarm=false}={}){
    const token=`${Date.now().toString(36)}-${(++createDetached.sequence).toString(36)}`,idRequestChannel=`WindowIdRequest-pme-${token}`;
    const bridge=window.desktop?.window,controlled=typeof bridge?.registerWindowIdForwarder==='function'&&typeof bridge?.callBrowserWindowMethod==='function';
    let idPromise=null;if(controlled)try{idPromise=bridge.registerWindowIdForwarder(idRequestChannel)||null;}catch{}
    const options=['disposition=desktop-window','center=yes','width=520','height=720','minWidth=380','minHeight=460','resizable=yes','focusable=yes',`show=${idPromise?.then?'no':'yes'}`,'paintWhenInitiallyHidden=yes','backgroundColor=#1a1d21','appMenubar=no'];
    if(idPromise?.then)options.unshift(`idRequestChannel=${idRequestChannel}`);
    const features=options.join(','),frameName=`frameId=pme-reply-${request.workspaceId}-${request.channelId}-${token},${features}`,url=new URL(`/client/${request.workspaceId}/${request.channelId}`,location.origin).href,hidden=!!idPromise?.then;
    let child=null;try{child=window.open(hidden?'about:blank':url,frameName,features);}catch{}
    if(!child)return null;
    const record={child,token,request:{workspaceId:request.workspaceId,channelId:request.channelId,name:request.name},pendingRequest:null,preparing:hidden,prewarm,ready:!hidden,warmRun:0,windowId:null,routeRun:0,focusRun:1,revealRun:0,visible:!hidden};
    if(idPromise?.then)idPromise.then(id=>{if(childOpen(child))record.windowId=id;}).catch(()=>{});
    if(record.visible)focusDetached(record,request);else prepareDetached(record);return record;
  }
  createDetached.sequence=0;
  function openDetached(request){
    if(disposed||!valid(request))return {ok:false,error:'Invalid Slack destination'};
    const key=request.workspaceId,existing=detached.get(key);
    if(existing&&childOpen(existing.child)){
      if(existing.preparing||existing.prewarm&&!existing.ready){existing.prewarm=false;existing.pendingRequest={workspaceId:request.workspaceId,channelId:request.channelId,name:request.name};try{existing.child.name=`frameId=pme-reply-${request.workspaceId}-${request.channelId}-${existing.token}`;}catch{}return {ok:true,detached:true,reused:true};}
      existing.prewarm=false;
      if(existing.visible)try{existing.child.focus();}catch{}
      if(!warmNavigate(existing,request))navigateDetached(existing,request);else if(!existing.visible)revealDetached(existing,request);
      return {ok:true,detached:true,reused:true};
    }
    detached.delete(key);
    const record=createDetached(request);if(!record)return {ok:false,error:'Slack did not allow a separate conversation window in this build'};
    detached.set(key,record);
    if(record.visible)try{record.child.focus();}catch{}
    return {ok:true,detached:true,reused:false};
  }
  function prewarm(request){
    if(disposed||!valid(request)||replyBoot)return {ok:false};
    for(const [key,record] of detached)if(key!==request.workspaceId&&record.prewarm&&!record.visible){try{record.child.close();}catch{}detached.delete(key);}
    const existing=detached.get(request.workspaceId);if(existing&&childOpen(existing.child))return {ok:true,reused:true,ready:existing.ready===true};
    detached.delete(request.workspaceId);const record=createDetached(request,{prewarm:true});if(!record)return {ok:false};detached.set(request.workspaceId,record);return {ok:true,reused:false,ready:false};
  }
  function releasePrewarm(){let released=0;for(const [key,record] of detached)if(record.prewarm&&!record.visible){record.warmRun++;record.routeRun++;try{record.child.close();}catch{}detached.delete(key);released++;}return {released};}
  function detachedCount(){let count=0;for(const [key,record] of detached){if(childOpen(record.child))count++;else detached.delete(key);}return count;}
  const replyBoot=installReplyBoot();
  function dispose(){disposed=true;generation++;replyBoot?.dispose();for(const record of detached.values())if(!record.visible)try{record.child.close();}catch{}detached.clear();delete window.__PME_NATIVE_NAVIGATION__;}
  window.__PME_NATIVE_NAVIGATION__={version:'0.9.1',destination,current,surface,open,openDetached,prewarm,releasePrewarm,layoutDiagnostics,replyBoot,status:()=>({available:!disposed,workspace:route()?.[1]||null,detached:detachedCount(),dedicatedReply:replyBoot?.status?.()||null}),dispose};
})();
