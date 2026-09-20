// Reframes Slack's existing editor. No credentials, draft copying or send API.
(function installNativeReply(){
  if(window.top!==window||location.origin!=='https://app.slack.com'||window.__PME_REPLY__)return;
  if(!document.head||!document.body){document.addEventListener('DOMContentLoaded',installNativeReply,{once:true});return;}
  const key='__pme_native_reply_v1',abort=new AbortController();
  let target=null,active=false,state='idle',reason='',pane=null,editor=null,composer=null,generation=0,disposed=false,scrollMethod=null,threadNavigation=null;
  let pendingSend=null,sendSequence=0;
  const valid=t=>t&&/^[TE][A-Z0-9]+$/.test(t.workspaceId)&&(t.kind==='compose'?!t.channelId&&!t.threadTs:/^[CDG][A-Z0-9]+$/.test(t.channelId)&&(!t.threadTs||/^\d+\.\d+$/.test(t.threadTs)));
  try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(valid(saved?.target)&&Date.now()-saved.at<86400000){target=saved.target;active=saved.active===true;}}catch{}
  const style=document.createElement('style');style.id='pme-native-reply-style';
  style.textContent=`[data-pme-native-reply-pane]{position:fixed!important;inset:0 0 0 420px!important;width:calc(100vw - 420px)!important;height:100vh!important;max-height:none!important;min-width:0!important;z-index:2!important;background:var(--sk_primary_background,#1a1d21);}
    body[data-pme-native-reply] .p-view_contents:not([data-pme-native-reply-pane]){visibility:hidden!important;}
    body[data-pme-native-reply] [data-pme-native-reply-pane]{visibility:visible!important;}
    body[data-pme-native-reply] > .ReactModalPortal > .ReactModal__Overlay{z-index:2147483647!important;}
    @media(max-width:650px){[data-pme-native-reply-pane]{left:44px!important;width:calc(100vw - 44px)!important;}}
    body[data-pme-detail-motion] [data-pme-native-reply-pane]{left:420px!important;right:auto!important;width:var(--pme-detail-width,400px)!important;transform:translateX(calc(100vw - 420px - var(--pme-detail-width,400px)))!important;}
    /* Scope tokens and selectors to the verified embedded pane. Removing its
       attribute restores Slack's theme; portaled menus keep native styling. */
    [data-pme-native-reply-pane]{
      --sk_primary_background:25,31,44;--sk_secondary_background:20,25,37;
      --sk_primary_foreground:205,212,228;--sk_secondary_foreground:135,150,174;
      --sk_highlight:195,179,239;--sk_highlight_hover:214,200,239;
      --sk_foreground_min:205,212,228;--sk_foreground_low:205,212,228;
      --sk_foreground_mid:148,162,184;--sk_foreground_high:148,162,184;
      color-scheme:dark;background:#191f2c!important;color:#cdd4e4;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    [data-pme-native-reply-pane] :is(.p-channel_header,.p-view_header,.p-threads_flexpane__header,[data-qa="channel_header"],.p-composer_page__header,[role="toolbar"][aria-label="Primary view actions"],[role="tablist"]){background:#191f2c!important;border-color:#ffffff10!important;box-shadow:none!important;}
    [data-pme-native-reply-pane] :is(.p-channel_header__name,.p-threads_flexpane__title,.p-composer_page__header h1){font-size:16px!important;font-weight:650!important;color:#edf0f7!important;}
    [data-pme-native-reply-pane] [data-qa="composer_page"]{background:#191f2c!important;}
    [data-pme-native-reply-pane] :is(.c-message_kit__text,.c-message__body,[data-qa="message-text"],.p-rich_text_section){font-size:13px!important;line-height:1.6!important;color:#bcc6d8;}
    [data-pme-native-reply-pane] :is(.c-message__sender,.c-message_kit__sender){font-size:12px!important;color:#cdd4e4!important;}
    [data-pme-native-reply-pane] :is(.c-timestamp,.c-message__timestamp){font-size:10px!important;color:#8796ae!important;}
    [data-pme-native-reply-pane] :is(.c-message_kit__message:hover,.c-message_kit__background--hovered){background:#ffffff05!important;}
    [data-pme-native-reply-pane] :is(.c-message_list__day_divider__label,.c-message_list__day_divider__label__pill){background:#191f2c!important;border-color:#ffffff16!important;color:#94a2b8!important;font-size:11px!important;box-shadow:none!important;}
    [data-pme-native-reply-pane] [data-qa="message_input"]{font-size:13px;background:transparent!important;}
    [data-pme-native-reply-pane] .c-texty_input_unstyled{background:transparent!important;}
    [data-pme-native-reply-pane] [data-qa="message_input"] :is([role="toolbar"],[contenteditable="true"]){background:transparent!important;}
    [data-pme-native-reply-pane] [data-qa="texty_input"]{font-size:13px!important;line-height:1.6!important;color:#cdd4e4!important;caret-color:#d6c8ef;}
    [data-pme-native-reply-pane] [data-qa="texty_input"].ql-blank::before{color:#8796ae!important;}
    [data-pme-native-reply-pane] :is(.c-texty_buttons,.c-texty_input__toolbar){background:transparent!important;border-color:#ffffff10!important;}
    [data-pme-native-reply-pane] [data-qa="composer_page__destination-input"]{font-size:13px!important;color:#cdd4e4!important;}
    [data-pme-native-reply-pane] :is(button,[role="button"],a):focus-visible{outline:2px solid #b7a8ec;outline-offset:2px;}
    [data-pme-native-reply-pane] [data-pme-native-composer]{background:#202735!important;border:1px solid #ffffff1c!important;border-radius:12px!important;box-shadow:0 3px 12px #00000014!important;}
    [data-pme-native-reply-pane] :has(> [data-pme-native-composer]){border-color:transparent!important;box-shadow:none!important;background:transparent!important;}
    [data-pme-native-reply-pane] [data-pme-native-composer]:focus-within{border-color:#b6a5e899!important;box-shadow:0 0 0 1px #b6a5e81a!important;}
    [data-pme-native-reply-pane] [data-pme-native-composer] [role="toolbar"]{background:transparent!important;border-color:#ffffff0c!important;color:#94a2b8!important;}
    [data-pme-native-reply-pane] [data-pme-native-composer] [data-qa="texty_input"]{min-height:64px;padding:10px 12px!important;}
    [data-pme-native-reply-pane] [data-pme-native-composer] [role="toolbar"] button{color:#94a2b8!important;border-radius:6px!important;}
    [data-pme-native-reply-pane] [data-pme-native-composer] [role="toolbar"] button:hover:not(:disabled):not([aria-disabled="true"]){background:#b6a5e81a!important;color:#e0d5f6!important;}
    [data-pme-native-reply-pane] [data-pme-native-composer] [role="toolbar"] button[aria-pressed="true"]{background:#b6a5e82b!important;color:#d6c8ef!important;}
    [data-pme-native-reply-pane] [data-pme-native-composer] [role="toolbar"] button:is(:disabled,[aria-disabled="true"]){color:#657086!important;}
    [data-pme-native-reply-pane] [data-pme-native-composer] [data-qa="texty_send_button"]:not(:disabled):not([aria-disabled="true"]){background:#b6a5e8!important;color:#20182b!important;border-radius:7px!important;}
    [data-pme-native-reply-pane] [data-pme-native-composer] [data-qa="texty_send_button"]:hover:not(:disabled):not([aria-disabled="true"]){background:#c9baf1!important;color:#20182b!important;}
    body[data-pme-quick] [data-pme-native-reply-pane]{inset:64px 0 38px!important;width:100vw!important;height:calc(100vh - 102px)!important;visibility:visible!important;z-index:2147483647!important;-webkit-app-region:no-drag;}
    body[data-pme-quick] [data-pme-native-reply-pane] :is(.p-channel_header,.p-view_header,[role="toolbar"][aria-label="Primary view actions"],[role="tablist"]){display:none!important;}
    body[data-pme-background-read] [data-pme-native-reply-pane]{visibility:hidden!important;pointer-events:none!important;}
    `;
  document.head.append(style);
  const path=()=>location.pathname.split('/');
  const nativeTeam=()=>document.querySelector('[data-qa="team_sidebar_item"][data-team-active="true"]')?.getAttribute('data-team');
  const inWorkspace=()=>target&&path()[2]===target.workspaceId&&nativeTeam()===target.workspaceId;
  const inConversation=()=>target?.kind!=='compose'&&inWorkspace()&&path()[3]===target.channelId;
  function save(){try{target?sessionStorage.setItem(key,JSON.stringify({target,active,at:Date.now()})):sessionStorage.removeItem(key);}catch{}}
  function notify(){window.dispatchEvent(new CustomEvent('pme-native-reply-state'));}
  function status(){return {active,state,reason,target:target&&{...target},send:pendingSend&&{confirmed:pendingSend.confirmed,dirty:pendingSend.dirty,visible:!!pendingSend.visibleAt},ready:active&&state==='ready'&&verified(),scrollMethod,threadNavigation};}
  function themeComposer(){
    // Find the smallest native container holding this editor and its send
    // control. Keep every node and event handler owned by Slack in place.
    let root=null;
    for(let node=editor?.parentElement;node&&node!==pane&&pane?.contains(node);node=node.parentElement){
      if(node.querySelector('[data-qa="texty_send_button"]')&&node.querySelector('[role="toolbar"]')){root=node;break;}
    }
    if(root===composer)return;
    composer?.removeAttribute('data-pme-native-composer');composer=root;
    composer?.setAttribute('data-pme-native-composer','');
  }
  function unframe(){pendingSend=null;document.body?.removeAttribute('data-pme-native-reply');composer?.removeAttribute('data-pme-native-composer');composer=null;for(const n of document.querySelectorAll('[data-pme-native-reply-pane]'))n.removeAttribute('data-pme-native-reply-pane');pane=null;editor=null;}
  function verified(){
    if(!active||!pane?.isConnected)return false;
    if(target.kind==='compose'){
      const found=locateCompose();if(!found||found.view!==pane)return false;
      editor=found.input;themeComposer();return true;
    }
    if(!inConversation()||!editor?.isConnected||!pane.contains(editor))return false;
    const box=editor.closest('[data-qa="message_input"]');
    return box?.getAttribute('data-channel-id')===target.channelId&&(box.getAttribute('data-thread-ts')||null)===(target.threadTs||null);
  }
  function locateCompose(){
    if(!inWorkspace())return null;
    const pages=[...document.querySelectorAll('[data-qa="composer_page"]')];
    if(pages.length!==1)return null;
    const page=pages[0],input=page.querySelector('[data-qa="texty_input"][contenteditable="true"]'),view=page.closest('.p-view_contents');
    if(!input||!view)return null;
    return {input,view,recipient:page.querySelector('[data-qa="composer_page__destination-input"]')};
  }
  function locate(threadTs=target?.threadTs){
    if(!inConversation())return null;
    const boxes=[...document.querySelectorAll('[data-qa="message_input"][data-channel-id]')].filter(n=>n.getAttribute('data-channel-id')===target.channelId&&(n.getAttribute('data-thread-ts')||null)===(threadTs||null));
    if(boxes.length!==1)return null;
    const input=boxes[0].querySelector('[data-qa="texty_input"][contenteditable="true"]'),view=input?.closest('.p-view_contents');
    if(!input||!view||threadTs&&!view.querySelector('[data-qa="threads_flexpane"]'))return null;
    return {input,view};
  }
  // Resolve only the mounted destination's native UI callbacks. Never retain a
  // store, dispatch arbitrary actions, or fetch messages ourselves.
  function nativeCapability(node,accept){
    let fiber=node?.[Object.keys(node).find(k=>k.startsWith('__reactFiber$'))];
    for(let depth=0;fiber&&depth<120;depth++,fiber=fiber.return){
      const instance=fiber.stateNode,props=instance?.props||fiber.memoizedProps;
      if(props?.channelId!==target.channelId||(props.teamId||props.serializationTeamId)!==target.workspaceId)continue;
      const result=accept(props,instance);if(result)return result;
    }
    return null;
  }
  function navigateThread(){
    const parent=locate(null);if(!parent)return false;
    const navigate=nativeCapability(parent.view.querySelector('.c-virtual_list'),p=>typeof p.dispatchNavigateToThread==='function'?p.dispatchNavigateToThread:null);
    if(!navigate)return false;
    navigate({channelId:target.channelId,ts:target.threadTs});return true;
  }
  function jumpToLatest(){
    if(target?.kind==='compose'||!verified()||state!=='ready')return {ok:false};
    let usedNative=false;
    try{
      const jump=target.threadTs?
        nativeCapability(pane.querySelector('[data-qa="threads_flexpane"]'),p=>p.threadTs===target.threadTs&&/^\d+\.\d+$/.test(p.latest)&&typeof p.jumpToReply==='function'?()=>p.jumpToReply(p.latest):null):
        nativeCapability(pane.querySelector('.c-virtual_list'),(p,instance)=>typeof instance?.scrollToMostRecentMessage==='function'?()=>instance.scrollToMostRecentMessage(false):null);
      if(jump){jump();usedNative=true;}
    }catch{}
    // Compatibility fallback reaches the end of Slack's currently rendered list.
    const scroller=pane.querySelector('.c-virtual_list [data-qa="slack_kit_scrollbar"]');
    // Slack can skip a repeated timestamp jump. Also move the mounted viewport
    // so a second click still works after scrolling back through the same page.
    if(scroller)scroller.scrollTop=scroller.scrollHeight;
    if(!usedNative&&!scroller)return {ok:false};
    scrollMethod=usedNative?'native-latest':'rendered-bottom';return {ok:true,method:scrollMethod};
  }
  function markReadNative(){
    if(target?.threadTs||!verified()||state!=='ready')return {ok:false};
    // Slack's own unread banner button, scoped to the verified conversation.
    const button=pane.querySelector('button.p-message_pane__unread_banner__close_icon');
    if(!button||button.disabled)return {ok:false};
    button.click();return {ok:true};
  }
  function fail(message){state='error';reason=message;unframe();notify();}
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  function focus(){
    if(state!=='ready'||!verified())return false;
    (target.kind==='compose'?locateCompose()?.recipient||editor:editor).focus({preventScroll:true});return true;
  }
  async function open(request,{focusEditor=true}={}){
    if(!valid(request)||disposed)return {ok:false,error:'Invalid reply destination'};
    const run=++generation;unframe();scrollMethod=null;threadNavigation=null;
    target=request.kind==='compose'?{kind:'compose',workspaceId:request.workspaceId,key:`${request.workspaceId}:compose`,name:'New message',workspaceName:String(request.workspaceName||request.workspaceId).slice(0,180)}:
      {workspaceId:request.workspaceId,channelId:request.channelId,threadTs:request.threadTs||null,
      key:request.key||`${request.workspaceId}:${request.channelId}:${request.threadTs||''}`,name:String(request.name||request.channelId).slice(0,180),workspaceName:String(request.workspaceName||request.workspaceId).slice(0,180)};
    active=true;state='loading';reason=target.kind==='compose'?'Opening Slack’s new message composer…':'Opening Slack’s native editor…';save();notify();
    // Use Slack's own navigation. Assigning a URL can race the desktop client's
    // remembered workspace and restore the old route over the requested editor.
    let workspaceClicked=false,channelClicks=0,lastChannelClick=0,threadClicked=false,tabClicked=false,auxClosed=false,composeClicked=false;
    const deadline=Date.now()+10000;
    try{for(let i=0;i<65&&Date.now()<deadline;i++){
      if(disposed||run!==generation||!active)return {cancelled:true};
      if(!inWorkspace()&&!workspaceClicked){
        const team=[...document.querySelectorAll('[data-qa="team_sidebar_item"]')].find(n=>n.getAttribute('data-team')===target.workspaceId);
        if(team){workspaceClicked=true;team.click();}
      }
      // A Canvas/popout can obscure the conversation while its URL stays the
      // same. Selecting the native row also restores the actual message view.
      if(target.kind==='compose'&&inWorkspace()&&!composeClicked&&!locateCompose()){
        const button=document.querySelector('[data-qa="composer_button"]');
        if(button){composeClicked=true;button.click();}
      }
      if(target.kind!=='compose'&&inWorkspace()&&channelClicks<3&&!threadClicked&&Date.now()-lastChannelClick>=750&&!locate()){
        const row=[...document.querySelectorAll('[data-qa="channel-sidebar-channel"]')].find(n=>n.getAttribute('data-qa-channel-sidebar-channel-id')===target.channelId);
        if(row){channelClicks++;lastChannelClick=Date.now();row.click();}
      }
      const found=target.kind==='compose'?locateCompose():locate();
      if(found){
        pane=found.view;editor=found.input;pane.setAttribute('data-pme-native-reply-pane','');document.body.setAttribute('data-pme-native-reply','');themeComposer();
        state='ready';reason='Slack’s editor · sending and drafts are handled by Slack';save();notify();
        // Allow the reframed list to measure its final height before jumping.
        await pause(80);if(disposed||run!==generation||!active)return {cancelled:true};
        if(!verified()){fail('The Slack destination changed. Reopen the conversation to continue.');return {ok:false,error:reason};}
        if(target.kind!=='compose')jumpToLatest();
        if(focusEditor)focus();return {ok:true};
      }
      if(inConversation()){
        // Once we click a thread, its pane can mount before its editor.
        // Only dismiss a previous auxiliary view, never our in-flight thread.
        if(!auxClosed&&!threadClicked){const close=document.querySelector('[data-qa="quip_close_thread"]')||document.querySelector('[data-qa="threads_flexpane"] button[aria-label="Close"]');if(close){close.click();auxClosed=true;}}
        if(!tabClicked){const tab=document.querySelector('[role="tab"][data-qa="channel"]');if(tab&&tab.getAttribute('aria-selected')!=='true'){tab.click();tabClicked=true;}}
        if(target.threadTs&&!threadClicked){
          // Native navigation works even when the root has been virtualized out.
          // Fall back to the visible reply bar on older client builds.
          try{threadClicked=navigateThread();}catch{}
          if(threadClicked){threadNavigation='native-callback';await pause(150);continue;}
          const message=[...document.querySelectorAll('[data-qa="message_container"][data-msg-ts]')].find(n=>n.getAttribute('data-msg-ts')===target.threadTs&&n.getAttribute('data-msg-channel-id')===target.channelId);
          const thread=message?.querySelector('[data-qa="reply_bar_count"]');
          if(thread){thread.click();threadClicked=true;threadNavigation='visible-reply-bar';}
        }
      }
      await pause(150);
    }}catch{if(run===generation&&active)fail('Slack could not open this destination. Retry or open it in Normal Slack.');return {ok:false,error:reason};}
    if(run===generation&&active)fail(target.kind==='compose'?'Slack’s new message composer is unavailable. Retry or use Normal Slack.':target.threadTs?'This thread is not loaded in Slack’s view. Open it in Normal Slack, then retry.':'Slack’s editor is unavailable here. Open the conversation in Normal Slack, then retry.');
    return {ok:false,error:reason};
  }
  function suspend({forget=false}={}){generation++;active=false;state='idle';reason='';unframe();if(forget)target=null;save();notify();}
  // A route/editor replacement must never leave a stale destination label over
  // a different composer. Recheck on input as well as during DOM reconciliation.
  function guard(event){if(!active)return;
    const sending=event.type==='click'&&event.target.closest?.('[data-qa="texty_send_button"]')||event.type==='keydown'&&event.key==='Enter'&&event.target.closest?.('[data-qa="message_input"]');
    if(sending&&(state!=='ready'||!verified())){event.preventDefault();event.stopImmediatePropagation();fail('The Slack destination changed. Reopen the conversation to continue.');return;}
    if(sending&&document.body.hasAttribute('data-pme-quick')&&!document.body.hasAttribute('data-pme-quick-read')&&!event.isComposing){
      const id=`${Date.now().toString(36)}-${++sendSequence}`;
      pendingSend={id,key:target.key,at:Date.now(),dirty:false,confirmed:false,visibleAt:null};
      window.__pmeTriageAction?.(JSON.stringify({workspaceId:target.workspaceId,key:target.key,action:'quick-send-attempt',id}));
    }
  }
  document.addEventListener('click',guard,{capture:true,signal:abort.signal});document.addEventListener('keydown',guard,{capture:true,signal:abort.signal});
  // beforeinput records a new user edit; an input event may instead be
  // Slack clearing the old draft after sending. Do not confuse the two.
  document.addEventListener('beforeinput',event=>{if(pendingSend&&event.isTrusted&&editor?.contains(event.target))pendingSend.dirty=true;},{capture:true,signal:abort.signal});
  function confirmSend(id,ts){if(pendingSend?.id===id&&/^\d+\.\d+$/.test(ts)){pendingSend.confirmed=true;pendingSend.ts=ts;window.dispatchEvent(new CustomEvent('pme-native-quick-confirmed',{detail:{key:pendingSend.key,ts}}));jumpToLatest();notify();}}
  function finishSend(){
    const p=pendingSend;if(!p)return;
    if(Date.now()-p.at>30000){pendingSend=null;return;}
    const button=composer?.querySelector('[data-qa="texty_send_button"]');
    if(!p.confirmed||p.dirty||p.key!==target?.key||!verified()||editor?.textContent?.trim()||!button||!(button.disabled||button.getAttribute?.('aria-disabled')==='true'))return;
    const message=[...pane.querySelectorAll('[data-qa="message_container"][data-msg-ts]')].find(n=>n.getAttribute('data-msg-ts')===p.ts&&n.getAttribute('data-msg-channel-id')===target.channelId);
    const r=message?.getBoundingClientRect();
    const visible=r&&r.height>0&&r.width>0&&r.bottom>64&&r.top<innerHeight-38;
    if(!visible){p.visibleAt=null;return;}
    if(!p.visibleAt){p.visibleAt=Date.now();return;}
    // Leave the acknowledged message on screen briefly before returning to work.
    if(Date.now()-p.visibleAt<1100)return;
    markReadNative();
    pendingSend=null;window.dispatchEvent(new CustomEvent('pme-native-quick-sent'));
  }
  const timer=setInterval(()=>{
    finishSend();
    if(!active||state!=='ready'||verified())return;
    // Sending or closing New Message can leave its page through native routing.
    // Return to the queue; never guess the new conversation's recipients.
    if(target.kind==='compose'&&inWorkspace()&&!document.querySelector('[data-qa="composer_page"]')){
      suspend({forget:true});window.dispatchEvent(new CustomEvent('pme-native-compose-closed'));return;
    }
    fail('The Slack destination changed. Reopen the conversation to continue.');
  },250);
  window.__PME_REPLY__={open,status,suspend,jumpToLatest,focus,confirmSend,markReadNative,
    dispose(){if(disposed)return;suspend();disposed=true;abort.abort();clearInterval(timer);style.remove();delete window.__PME_REPLY__;window.dispatchEvent(new CustomEvent('pme-native-reply-state'));}};
  window.dispatchEvent(new CustomEvent('pme-native-reply-installed'));
})();
