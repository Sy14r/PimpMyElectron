// Reframes Slack's existing editor. No credentials, draft copying or send API.
(function installNativeReply(){
  if(window.top!==window||location.origin!=='https://app.slack.com'||window.__PME_REPLY__)return;
  if(!document.head||!document.body){document.addEventListener('DOMContentLoaded',installNativeReply,{once:true});return;}
  const key='__pme_native_reply_v1',abort=new AbortController();
  let target=null,active=false,state='idle',reason='',pane=null,editor=null,generation=0,disposed=false;
  const valid=t=>t&&/^[TE][A-Z0-9]+$/.test(t.workspaceId)&&/^[CDG][A-Z0-9]+$/.test(t.channelId)&&(!t.threadTs||/^\d+\.\d+$/.test(t.threadTs));
  try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(valid(saved?.target)&&Date.now()-saved.at<86400000){target=saved.target;active=saved.active===true;}}catch{}
  const style=document.createElement('style');style.id='pme-native-reply-style';
  style.textContent=`[data-pme-native-reply-pane]{position:fixed!important;inset:0 0 0 420px!important;width:calc(100vw - 420px)!important;height:100vh!important;max-height:none!important;min-width:0!important;z-index:2!important;background:var(--sk_primary_background,#1a1d21);}
    body[data-pme-native-reply] .p-view_contents:not([data-pme-native-reply-pane]){visibility:hidden!important;}
    body[data-pme-native-reply] [data-pme-native-reply-pane]{visibility:visible!important;}
    body[data-pme-native-reply] > .ReactModalPortal > .ReactModal__Overlay{z-index:2147483647!important;}
    @media(max-width:650px){[data-pme-native-reply-pane]{left:44px!important;width:calc(100vw - 44px)!important;}}`;
  document.head.append(style);
  const path=()=>location.pathname.split('/');
  const nativeTeam=()=>document.querySelector('[data-qa="team_sidebar_item"][data-team-active="true"]')?.getAttribute('data-team');
  const inWorkspace=()=>target&&path()[2]===target.workspaceId&&nativeTeam()===target.workspaceId;
  const inConversation=()=>inWorkspace()&&path()[3]===target.channelId;
  function save(){try{target?sessionStorage.setItem(key,JSON.stringify({target,active,at:Date.now()})):sessionStorage.removeItem(key);}catch{}}
  function notify(){window.dispatchEvent(new CustomEvent('pme-native-reply-state'));}
  function status(){return {active,state,reason,target:target&&{...target},ready:active&&state==='ready'&&verified()};}
  function unframe(){document.body?.removeAttribute('data-pme-native-reply');for(const n of document.querySelectorAll('[data-pme-native-reply-pane]'))n.removeAttribute('data-pme-native-reply-pane');pane=null;editor=null;}
  function verified(){
    if(!active||!inConversation()||!pane?.isConnected||!editor?.isConnected||!pane.contains(editor))return false;
    const box=editor.closest('[data-qa="message_input"]');
    return box?.getAttribute('data-channel-id')===target.channelId&&(box.getAttribute('data-thread-ts')||null)===(target.threadTs||null);
  }
  function locate(){
    if(!inConversation())return null;
    const boxes=[...document.querySelectorAll('[data-qa="message_input"][data-channel-id]')].filter(n=>n.getAttribute('data-channel-id')===target.channelId&&(n.getAttribute('data-thread-ts')||null)===(target.threadTs||null));
    if(boxes.length!==1)return null;
    const input=boxes[0].querySelector('[data-qa="texty_input"][contenteditable="true"]'),view=input?.closest('.p-view_contents');
    if(!input||!view||target.threadTs&&!view.querySelector('[data-qa="threads_flexpane"]'))return null;
    return {input,view};
  }
  function fail(message){state='error';reason=message;unframe();notify();}
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function open(request){
    if(!valid(request)||disposed)return {ok:false,error:'Invalid reply destination'};
    const run=++generation;unframe();
    target={workspaceId:request.workspaceId,channelId:request.channelId,threadTs:request.threadTs||null,
      key:request.key||`${request.workspaceId}:${request.channelId}:${request.threadTs||''}`,name:String(request.name||request.channelId).slice(0,180),workspaceName:String(request.workspaceName||request.workspaceId).slice(0,180)};
    active=true;state='loading';reason='Opening Slack’s native editor…';save();notify();
    // Use Slack's own navigation. Assigning a URL can race the desktop client's
    // remembered workspace and restore the old route over the requested editor.
    let workspaceClicked=false,channelClicks=0,lastChannelClick=0,threadClicked=false,tabClicked=false,auxClosed=false;
    for(let i=0;i<65;i++){
      if(disposed||run!==generation||!active)return {cancelled:true};
      if(!inWorkspace()&&!workspaceClicked){
        const team=[...document.querySelectorAll('[data-qa="team_sidebar_item"]')].find(n=>n.getAttribute('data-team')===target.workspaceId);
        if(team){workspaceClicked=true;team.click();}
      }
      // A Canvas/popout can obscure the conversation while its URL stays the
      // same. Selecting the native row also restores the actual message view.
      if(inWorkspace()&&channelClicks<3&&!threadClicked&&Date.now()-lastChannelClick>=750&&!locate()){
        const row=[...document.querySelectorAll('[data-qa="channel-sidebar-channel"]')].find(n=>n.getAttribute('data-qa-channel-sidebar-channel-id')===target.channelId);
        if(row){channelClicks++;lastChannelClick=Date.now();row.click();}
      }
      const found=locate();
      if(found){
        pane=found.view;editor=found.input;pane.setAttribute('data-pme-native-reply-pane','');document.body.setAttribute('data-pme-native-reply','');
        state='ready';reason='Slack’s editor · sending and drafts are handled by Slack';save();notify();editor.focus({preventScroll:true});return {ok:true};
      }
      if(inConversation()){
        // Once we click a thread, its pane can mount before its editor.
        // Only dismiss a previous auxiliary view, never our in-flight thread.
        if(!auxClosed&&!threadClicked){const close=document.querySelector('[data-qa="quip_close_thread"]')||document.querySelector('[data-qa="threads_flexpane"] button[aria-label="Close"]');if(close){close.click();auxClosed=true;}}
        if(!tabClicked){const tab=document.querySelector('[role="tab"][data-qa="channel"]');if(tab&&tab.getAttribute('aria-selected')!=='true'){tab.click();tabClicked=true;}}
        if(target.threadTs&&!threadClicked){
          const message=[...document.querySelectorAll('[data-qa="message_container"][data-msg-ts]')].find(n=>n.getAttribute('data-msg-ts')===target.threadTs&&n.getAttribute('data-msg-channel-id')===target.channelId);
          const thread=message?.querySelector('[data-qa="reply_bar_count"]');
          if(thread){thread.click();threadClicked=true;}
        }
      }
      await pause(150);
    }
    if(run===generation&&active)fail(target.threadTs?'This thread is not loaded in Slack’s view. Open it in Normal Slack, then retry.':'Slack’s editor is unavailable here. Open the conversation in Normal Slack, then retry.');
    return {ok:false,error:reason};
  }
  function suspend({forget=false}={}){generation++;active=false;state='idle';reason='';unframe();if(forget)target=null;save();notify();}
  // A route/editor replacement must never leave a stale destination label over
  // a different composer. Recheck on input as well as during DOM reconciliation.
  function guard(event){if(!active)return;
    const sending=event.type==='click'&&event.target.closest?.('[data-qa="texty_send_button"]')||event.type==='keydown'&&event.key==='Enter'&&event.target.closest?.('[data-qa="message_input"]');
    if(sending&&(state!=='ready'||!verified())){event.preventDefault();event.stopImmediatePropagation();fail('The Slack destination changed. Reopen the conversation to continue.');}
  }
  document.addEventListener('click',guard,{capture:true,signal:abort.signal});document.addEventListener('keydown',guard,{capture:true,signal:abort.signal});
  const timer=setInterval(()=>{if(active&&state==='ready'&&!verified())fail('The Slack destination changed. Reopen the conversation to continue.');},250);
  window.__PME_REPLY__={open,status,suspend,
    dispose(){if(disposed)return;suspend();disposed=true;abort.abort();clearInterval(timer);style.remove();delete window.__PME_REPLY__;window.dispatchEvent(new CustomEvent('pme-native-reply-state'));}};
  window.dispatchEvent(new CustomEvent('pme-native-reply-installed'));
})();
