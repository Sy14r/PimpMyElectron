// Reframes Slack's existing editor. No credentials, draft copying or send API.
(function installNativeReply(){
  if(window.top!==window||location.origin!=='https://app.slack.com'||window.__PME_REPLY__)return;
  if(!document.head||!document.body){document.addEventListener('DOMContentLoaded',installNativeReply,{once:true});return;}
  const key='__pme_native_reply_v1',abort=new AbortController();
  let target=null,active=false,state='idle',reason='',pane=null,editor=null,composer=null,generation=0,disposed=false,scrollMethod=null,threadNavigation=null;
  let pendingSend=null,sendSequence=0;
  let header=null,openSlackButton=null,readOnly=false;
  let menuButton=null,conversationMenu=null,auxiliary=null,auxiliaryMissingAt=0;
  const hiddenHeaderNodes=new Set();
  const valid=t=>t&&/^[TE][A-Z0-9]+$/.test(t.workspaceId)&&(t.kind==='compose'?!t.channelId&&!t.threadTs:/^[CDG][A-Z0-9]+$/.test(t.channelId)&&(!t.threadTs||/^\d+\.\d+$/.test(t.threadTs)));
  try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(valid(saved?.target)&&Date.now()-saved.at<86400000){target=saved.target;active=saved.active===true;}}catch{}
  const style=document.createElement('style');style.id='pme-native-reply-style';
  style.textContent=`[data-pme-native-reply-pane]{position:fixed!important;inset:0 0 0 420px!important;width:calc(100vw - 420px)!important;height:100vh!important;max-height:none!important;min-width:0!important;z-index:2!important;background:var(--sk_primary_background,#1a1d21);}
    body[data-pme-native-reply] .p-view_contents:not([data-pme-native-reply-pane]){visibility:hidden!important;}
    body[data-pme-native-reply] [data-pme-native-reply-pane]{visibility:visible!important;}
    body[data-pme-native-reply] > .ReactModalPortal > .ReactModal__Overlay{z-index:2147483647!important;}
    body[data-pme-native-reply] > :is(.c-sk-modal_portal,.ReactModalPortal){position:fixed!important;inset:0;z-index:2147483647!important;pointer-events:none;}
    body[data-pme-native-reply] > :is(.c-sk-modal_portal,.ReactModalPortal) > *{pointer-events:auto;}
    body[data-pme-native-reply] .ReactModal__Content{--sk_primary_background:25,31,44;--sk_secondary_background:32,39,53;--sk_primary_foreground:205,212,228;--sk_secondary_foreground:148,162,184;--sk_highlight:195,179,239;background:#191f2c!important;color:#cdd4e4;max-width:calc(100vw - 32px)!important;min-width:0!important;max-height:calc(100vh - 32px)!important;border:1px solid #ffffff20;border-radius:12px!important;box-shadow:0 16px 50px #0008;}
    body[data-pme-native-reply] .ReactModal__Content :is(.c-sk-modal_header,.c-sk-modal_footer,.p-about_modal__header,.p-about_modal__tab_panel,.p-about_modal__contents,.c-sk-modal_content__inner){background:#191f2c!important;border-color:#ffffff12!important;}
    @media(max-width:650px){[data-pme-native-reply-pane]{left:44px!important;width:calc(100vw - 44px)!important;}}
    body[data-pme-detail-motion] [data-pme-native-reply-pane]{left:420px!important;right:auto!important;width:var(--pme-detail-width,400px)!important;transform:translateX(calc(100vw - 420px - var(--pme-detail-width,400px)))!important;}
    /* Scope tokens and selectors to the embedded pane. Removing its
       attribute restores Slack's theme. Native portals are themed only in triage. */
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
    [data-pme-native-reply-pane] [data-qa="message-input-system-notification-roadblock"]{background:#202735!important;color:#94a2b8!important;border-color:#ffffff10!important;}
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
    [data-pme-native-reply-pane] [data-pme-native-header]{background:#191f2c!important;border-color:#ffffff10!important;}
    [data-pme-native-reply-pane] [data-pme-native-header] :is([data-qa="ai_summary_summarize_thread_button"],[data-qa="secondary-header-more"],[data-feat="view-header:more"]){display:none!important;}
    [data-pme-native-header] .pme-open-slack{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:30px;height:30px;padding:6px;border:0;border-radius:7px;background:transparent;color:#94a2b8;cursor:pointer;-webkit-app-region:no-drag;}
    [data-pme-native-header] .pme-open-slack:hover{background:#ffffff0e;color:#cdd4e4;}
    [data-pme-native-header] .pme-open-slack svg{width:18px;height:18px;pointer-events:none;}
    [data-pme-native-header] .p-view_header__actions{position:relative;background:transparent!important;box-shadow:none!important;}
    [data-pme-native-header] .p-view_header__actions::before,[data-pme-native-header] .p-view_header__actions::after{background:none!important;box-shadow:none!important;}
    /* Slack tracking wrappers use display:contents; give them a box so their
       hidden children leave the flex row while retaining native popup anchors. */
    [data-pme-native-header] [data-pme-menu-native]{display:block!important;position:absolute!important;right:36px!important;top:0!important;visibility:hidden!important;pointer-events:none!important;}
    #pme-conversation-menu{position:fixed;inset:auto;margin:0;padding:6px;min-width:220px;max-width:calc(100vw - 24px);background:#202735;color:#cdd4e4;border:1px solid #ffffff20;border-radius:10px;box-shadow:0 12px 35px #0007;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
    #pme-conversation-menu button{display:block;width:100%;padding:9px 12px;text-align:left;background:transparent;color:inherit;border:0;border-radius:6px;font:inherit;cursor:pointer;}
    #pme-conversation-menu button:hover,#pme-conversation-menu button:focus-visible{background:#b6a5e81a;outline:none;}
    #pme-conversation-menu button:disabled{opacity:.45;cursor:default;}
    [data-pme-native-auxiliary] :is(.p-flexpane_header,.p-flexpane__body,.p-r_member_profile__container,.p-search_in_channel){background:#191f2c!important;color:#cdd4e4;}
    [data-pme-native-auxiliary] .p-flexpane_header{padding:8px 12px!important;}
    [data-pme-native-auxiliary] .p-flexpane__title_container{font-size:15px!important;}
    [data-pme-native-auxiliary] .c-scrollbar__hider{max-width:100%;}
    `;
  document.head.append(style);
  const path=()=>location.pathname.split('/');
  const nativeTeam=()=>document.querySelector('[data-qa="team_sidebar_item"][data-team-active="true"]')?.getAttribute('data-team');
  const inWorkspace=()=>target&&path()[2]===target.workspaceId&&nativeTeam()===target.workspaceId;
  const inConversation=()=>target?.kind!=='compose'&&inWorkspace()&&path()[3]===target.channelId;
  function save(){try{target?sessionStorage.setItem(key,JSON.stringify({target,active,at:Date.now()})):sessionStorage.removeItem(key);}catch{}}
  function notify(){window.dispatchEvent(new CustomEvent('pme-native-reply-state'));}
  function auxiliaryReady(){return !!auxiliary?.view.isConnected&&inWorkspace();}
  function status(){return {active,state,reason,target:target&&{...target},auxiliary:auxiliary?.kind||null,readOnly,send:pendingSend&&{confirmed:pendingSend.confirmed,dirty:pendingSend.dirty,visible:!!pendingSend.visibleAt},ready:active&&state==='ready'&&(auxiliaryReady()||verifiedPane()),scrollMethod,threadNavigation};}
  function closeMenu({focus=false}={}){conversationMenu?.remove();conversationMenu=null;menuButton?.setAttribute('aria-expanded','false');if(focus)menuButton?.focus({preventScroll:true});}
  function clearHeader(){closeMenu();menuButton?.remove();menuButton=null;for(const node of hiddenHeaderNodes)node.removeAttribute('data-pme-menu-native');hiddenHeaderNodes.clear();openSlackButton?.remove();openSlackButton=null;header?.removeAttribute('data-pme-native-header');header=null;}
  function nativeMenuControls(){
    if(!header||target?.threadTs||auxiliary)return [];
    const huddle=header.querySelector('button[data-qa="huddle_channel_header_button"]'),search=header.querySelector('[data-qa="search_in_channel_button"]'),notifications=header.querySelector('[data-feat="view-header:notifications"]'),invite=header.querySelector('button[data-qa="invite-teammates-cta"]');
    return [{id:'huddle',button:huddle,label:'Huddle…'},{id:'search',button:search,label:'Search this conversation…'},
      {id:'notifications',button:notifications,label:notifications?.getAttribute('aria-haspopup')?'Notifications…':notifications?.hasAttribute('aria-pressed')?(notifications.getAttribute('aria-pressed')==='true'?'Unmute conversation':'Mute conversation'):notifications?.getAttribute('aria-label')||'Conversation notifications'},
      {id:'invite',button:invite,label:'Invite teammates…'}].filter(row=>row.button);
  }
  function syncMenuButton(actions){
    const controls=nativeMenuControls();if(!controls.length)return;
    for(const {button} of controls){
      let root=button;while(root.parentElement&&root.parentElement!==actions&&actions.contains(root.parentElement))root=root.parentElement;
      if(!hiddenHeaderNodes.has(root)){root.setAttribute('data-pme-menu-native','');hiddenHeaderNodes.add(root);}
    }
    if(menuButton?.parentElement===actions)return;
    menuButton?.remove();menuButton=document.createElement('button');menuButton.type='button';menuButton.className='pme-open-slack';menuButton.title='Conversation actions';
    menuButton.setAttribute('aria-label','Conversation actions');menuButton.setAttribute('aria-haspopup','menu');menuButton.setAttribute('aria-expanded','false');
    menuButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    actions.insertBefore(menuButton,openSlackButton);
  }
  function showConversationMenu(){
    if(conversationMenu){closeMenu({focus:true});return;}
    if(!verifiedPane()||!menuButton)return;
    const scope=target.key,menu=document.createElement('div');menu.id='pme-conversation-menu';menu.setAttribute('popover','auto');menu.setAttribute('role','menu');menu.setAttribute('aria-label','Conversation actions');
    for(const row of nativeMenuControls()){
      const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=row.label;button.disabled=row.button.disabled||row.button.getAttribute('aria-disabled')==='true';
      button.addEventListener('click',()=>{
        if(target?.key!==scope||!verifiedPane()){closeMenu();return;}
        // Resolve again: Slack may replace its controls while the menu is open.
        const native=nativeMenuControls().find(current=>current.id===row.id)?.button;
        closeMenu();if(native&&!native.disabled&&native.getAttribute('aria-disabled')!=='true')native.click();
      },{signal:abort.signal});menu.append(button);
    }
    conversationMenu=menu;document.body.append(menu);menu.showPopover();menuButton.setAttribute('aria-expanded','true');
    const anchor=menuButton.getBoundingClientRect();menu.style.left=`${Math.max(12,Math.min(anchor.right-menu.offsetWidth,innerWidth-menu.offsetWidth-12))}px`;menu.style.top=`${Math.min(anchor.bottom+6,innerHeight-menu.offsetHeight-12)}px`;
    menu.addEventListener('toggle',event=>{if(event.newState==='closed'&&conversationMenu===menu)closeMenu();},{signal:abort.signal});
    menu.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeMenu({focus:true});return;}
      if(event.key==='Tab'){event.preventDefault();closeMenu({focus:true});return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();event.stopImmediatePropagation();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],at=buttons.indexOf(document.activeElement);
        buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();
      }
    },{signal:abort.signal});menu.querySelector('button:not(:disabled)')?.focus();
  }
  function overlayOpen(){return !!conversationMenu||[...document.querySelectorAll('.ReactModal__Content--after-open')].some(node=>node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0);}
  function findAuxiliary(){
    for(const [kind,selector] of [['profile','[data-qa="member_profile_pane"]'],['search','[data-qa="search_in_channel_title"]']]){
      const view=document.querySelector(selector)?.closest('.p-view_contents');if(view?.isConnected)return {kind,view};
    }
    if(path()[3]==='search'){const view=document.querySelector('[data-qa="search_view"]')?.closest('.p-view_contents');if(view?.isConnected)return {kind:'full search',view};}
    return null;
  }
  function closeAuxiliary(){if(!auxiliaryReady())return false;void open({...target},{focusEditor:false});return true;}
  function syncAuxiliary(){
    if(!inWorkspace()||target.kind==='compose')return false;
    const found=findAuxiliary();
    if(found){
      // Slack routes some searches to its full multi-pane search application.
      // Keep that native route intact and give it the full window.
      if(found.kind==='full search'){
        auxiliary=found;state='ready';reason='';
        window.dispatchEvent(new CustomEvent('pme-native-header-action',{detail:{action:'stock'}}));return true;
      }
      if(auxiliary?.view!==found.view){
        clearHeader();pane?.removeAttribute('data-pme-native-reply-pane');pane?.removeAttribute('data-pme-native-auxiliary');
        composer?.removeAttribute('data-pme-native-composer');composer=null;editor=null;readOnly=false;pendingSend=null;
        auxiliary=found;pane=found.view;pane.setAttribute('data-pme-native-reply-pane','');pane.setAttribute('data-pme-native-auxiliary',found.kind);document.body.setAttribute('data-pme-native-reply','');
        state='ready';reason='';themeHeader();notify();
      }
      auxiliaryMissingAt=0;themeHeader();return true;
    }
    if(auxiliary){
      const conversation=locate();
      if(conversation){
        pane?.removeAttribute('data-pme-native-reply-pane');pane?.removeAttribute('data-pme-native-auxiliary');clearHeader();auxiliary=null;auxiliaryMissingAt=0;
        pane=conversation.view;editor=conversation.input;readOnly=!!conversation.readOnly;pane.setAttribute('data-pme-native-reply-pane','');themeComposer();themeHeader();notify();return true;
      }
      // Native dismissal/navigation may take a frame to remount the editor.
      if(!auxiliaryMissingAt)auxiliaryMissingAt=Date.now();if(Date.now()-auxiliaryMissingAt<2000)return true;
    }
    return false;
  }
  function themeHeader(){
    const next=target?.kind==='compose'?null:pane?.querySelector(auxiliary?'.p-flexpane_header,.p-explorer_header':target?.threadTs?'.p-flexpane_header,.p-threads_flexpane__header':'.p-view_header,.p-channel_header');
    if(next!==header){clearHeader();header=next;header?.setAttribute('data-pme-native-header','');}
    if(!header)return;
    const actions=header.querySelector('.p-flexpane_header__primary,.p-view_header__actions,.p-explorer_header__container')||header;
    if(openSlackButton?.parentElement===actions){syncMenuButton(actions);return;}
    openSlackButton?.remove();openSlackButton=document.createElement('button');openSlackButton.type='button';openSlackButton.className='pme-open-slack';
    const label=auxiliary?`Open ${auxiliary.kind} in Slack`:target.threadTs?'Open thread in Slack':'Open conversation in Slack';
    openSlackButton.setAttribute('aria-label',label);openSlackButton.title=label;
    // Match the monochrome Slack icon already used in the triage navigation.
    openSlackButton.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">'+[0,90,180,270].map(angle=>`<g transform="rotate(${angle} 12 12)"><rect x="13" y="1" width="4.5" height="10" rx="2.25"/><rect x="7" y="1" width="4.5" height="4.5" rx="2.25"/></g>`).join('')+'</svg>';
    actions.append(openSlackButton);
    syncMenuButton(actions);
  }
  function headerAction(event){
    if(event.type!=='click'||!active||!header||window.__PME_TRIAGE__?.status().mode!=='reply')return false;
    const button=event.target.closest?.('button');if(!button||!header.contains(button))return false;
    if(button===menuButton){event.preventDefault();event.stopImmediatePropagation();showConversationMenu();return true;}
    const action=button===openSlackButton?'stock':button.matches('button:has(svg[data-qa="caret-left-full"]),button[aria-label="Close"],button[data-qa="quip_close_thread"]')?'queue':null;
    if(!action)return false;
    event.preventDefault();event.stopImmediatePropagation();
    if(action==='queue'&&auxiliaryReady()){closeAuxiliary();return true;}
    if(state==='ready'&&(auxiliaryReady()||verifiedPane()))window.dispatchEvent(new CustomEvent('pme-native-header-action',{detail:{action:action==='queue'&&target.threadTs?'conversation':action}}));
    return true;
  }
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
  function unframe(){pendingSend=null;clearHeader();document.body?.removeAttribute('data-pme-native-reply');composer?.removeAttribute('data-pme-native-composer');composer=null;for(const n of document.querySelectorAll('[data-pme-native-reply-pane]')){n.removeAttribute('data-pme-native-reply-pane');n.removeAttribute('data-pme-native-auxiliary');}auxiliary=null;auxiliaryMissingAt=0;pane=null;editor=null;readOnly=false;}
  // A notifications-only pane is valid to display, never valid to send through.
  function verifiedPane(){return readOnly?active&&pane?.isConnected&&locateReadOnly()?.view===pane:verified();}
  function verified(){
    if(!active||readOnly||!pane?.isConnected)return false;
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
  function locateReadOnly(threadTs=target?.threadTs){
    if(threadTs||!inConversation())return null;
    const markers=[...document.querySelectorAll('[data-qa="message-input-system-notification-roadblock"]')];
    if(markers.length!==1)return null;
    const view=markers[0].closest('.p-view_contents');
    if(!view?.isConnected||!nativeCapability(view.querySelector('.c-virtual_list'),()=>true))return null;
    return {view,input:null,readOnly:true};
  }
  function locate(threadTs=target?.threadTs){
    if(!inConversation())return null;
    const boxes=[...document.querySelectorAll('[data-qa="message_input"][data-channel-id]')].filter(n=>n.getAttribute('data-channel-id')===target.channelId&&(n.getAttribute('data-thread-ts')||null)===(threadTs||null));
    if(boxes.length!==1)return boxes.length===0?locateReadOnly(threadTs):null;
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
    if(target?.kind==='compose'||!verifiedPane()||state!=='ready')return {ok:false};
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
    if(target?.threadTs||!verifiedPane()||state!=='ready')return {ok:false};
    // Slack's own unread banner button, scoped to the verified conversation.
    const button=pane.querySelector('button.p-message_pane__unread_banner__close_icon');
    if(!button||button.disabled)return {ok:false};
    button.click();return {ok:true};
  }
  function fail(message){state='error';reason=message;unframe();notify();}
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  // Listen only during navigation. Wake on Slack mounting its editor rather
  // than paying a fixed polling delay; retain a timer for route-only changes.
  function waitForNativeChange(){
    if(typeof MutationObserver==='undefined')return pause(150);
    return new Promise(resolve=>{
      let frame=null;
      const finish=()=>{observer.disconnect();clearTimeout(timer);clearTimeout(frame);resolve();};
      const observer=new MutationObserver(()=>{if(frame===null)frame=setTimeout(finish,16);});
      const timer=setTimeout(finish,150);
      observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-channel-id','data-thread-ts','data-team-active']});
    });
  }
  function afterLayout(){
    if(typeof requestAnimationFrame==='undefined')return pause(80);
    return new Promise(resolve=>{
      let frame;
      const finish=()=>{clearTimeout(timer);cancelAnimationFrame(frame);resolve();};
      const timer=setTimeout(finish,80);
      frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(finish);});
    });
  }
  function focus(){
    if(state!=='ready'||!verified())return false;
    (target.kind==='compose'?locateCompose()?.recipient||editor:editor).focus({preventScroll:true});return true;
  }
  async function open(request,{focusEditor=true}={}){
    if(!valid(request)||disposed)return {ok:false,error:'Invalid reply destination'};
    const previousAuxiliary=findAuxiliary();
    const close=previousAuxiliary?.kind==='full search'?document.querySelector('[data-qa="tab_rail_home_button"]'):previousAuxiliary?.view.querySelector('button:has(svg[data-qa="caret-left-full"]),button[aria-label="Close"]');
    const run=++generation;unframe();scrollMethod=null;threadNavigation=null;
    target=request.kind==='compose'?{kind:'compose',workspaceId:request.workspaceId,key:`${request.workspaceId}:compose`,name:'New message',workspaceName:String(request.workspaceName||request.workspaceId).slice(0,180)}:
      {workspaceId:request.workspaceId,channelId:request.channelId,threadTs:request.threadTs||null,
      key:request.key||`${request.workspaceId}:${request.channelId}:${request.threadTs||''}`,name:String(request.name||request.channelId).slice(0,180),workspaceName:String(request.workspaceName||request.workspaceId).slice(0,180)};
    active=true;state='loading';reason=target.kind==='compose'?'Opening Slack’s new message composer…':'Opening Slack’s native editor…';save();notify();
    // Use Slack's own navigation. Assigning a URL can race the desktop client's
    // remembered workspace and restore the old route over the requested editor.
    let workspaceClicked=false,channelClicks=0,lastChannelClick=0,threadClicked=false,tabClicked=false,auxClosed=false,composeClicked=false;
    const deadline=Date.now()+10000;
    try{close?.click();while(Date.now()<deadline){
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
      // Close the old thread before selecting its parent. Selecting the sidebar
      // first can restore the thread and force another navigation 750ms later.
      // Never dismiss a thread after its navigation has already started.
      if(inConversation()&&!auxClosed&&!threadClicked&&!locate()){
        const close=document.querySelector('[data-qa="quip_close_thread"]')||document.querySelector('[data-qa="threads_flexpane"] button[aria-label="Close"]');
        if(close){close.click();auxClosed=true;lastChannelClick=Date.now();await waitForNativeChange();continue;}
      }
      if(target.kind!=='compose'&&inWorkspace()&&channelClicks<3&&!threadClicked&&Date.now()-lastChannelClick>=750&&!locate()&&!(target.threadTs&&locate(null))){
        const row=[...document.querySelectorAll('[data-qa="channel-sidebar-channel"]')].find(n=>n.getAttribute('data-qa-channel-sidebar-channel-id')===target.channelId);
        if(row){channelClicks++;lastChannelClick=Date.now();row.click();}
      }
      const found=target.kind==='compose'?locateCompose():locate();
      if(found){
        pane=found.view;editor=found.input;readOnly=!!found.readOnly;pane.setAttribute('data-pme-native-reply-pane','');document.body.setAttribute('data-pme-native-reply','');themeComposer();themeHeader();
        state='ready';reason=readOnly?'Slack’s notifications-only conversation':'Slack’s editor · sending and drafts are handled by Slack';save();notify();
        // Allow the reframed list to measure its final height before jumping.
        await afterLayout();if(disposed||run!==generation||!active)return {cancelled:true};
        if(!verifiedPane()){fail('The Slack destination changed. Reopen the conversation to continue.');return {ok:false,error:reason};}
        if(target.kind!=='compose')jumpToLatest();
        if(focusEditor)focus();return {ok:true};
      }
      if(inConversation()){
        if(!tabClicked){const tab=document.querySelector('[role="tab"][data-qa="channel"]');if(tab&&tab.getAttribute('aria-selected')!=='true'){tab.click();tabClicked=true;}}
        if(target.threadTs&&!threadClicked){
          // Native navigation works even when the root has been virtualized out.
          // Fall back to the visible reply bar on older client builds.
          try{threadClicked=navigateThread();}catch{}
          if(threadClicked){threadNavigation='native-callback';await waitForNativeChange();continue;}
          const message=[...document.querySelectorAll('[data-qa="message_container"][data-msg-ts]')].find(n=>n.getAttribute('data-msg-ts')===target.threadTs&&n.getAttribute('data-msg-channel-id')===target.channelId);
          const thread=message?.querySelector('[data-qa="reply_bar_count"]');
          if(thread){thread.click();threadClicked=true;threadNavigation='visible-reply-bar';}
        }
      }
      await waitForNativeChange();
    }}catch{if(run===generation&&active)fail('Slack could not open this destination. Retry or open it in Normal Slack.');return {ok:false,error:reason};}
    if(run===generation&&active)fail(target.kind==='compose'?'Slack’s new message composer is unavailable. Retry or use Normal Slack.':target.threadTs?'This thread is not loaded in Slack’s view. Open it in Normal Slack, then retry.':'Slack’s editor is unavailable here. Open the conversation in Normal Slack, then retry.');
    return {ok:false,error:reason};
  }
  function suspend({forget=false}={}){generation++;active=false;state='idle';reason='';unframe();if(forget)target=null;save();notify();}
  // A route/editor replacement must never leave a stale destination label over
  // a different composer. Recheck on input as well as during DOM reconciliation.
  function guard(event){if(!active)return;
    if(headerAction(event))return;
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
    if(!active||state!=='ready')return;
    if(syncAuxiliary())return;
    if(verifiedPane()){themeHeader();return;}
    // Sending or closing New Message can leave its page through native routing.
    // Return to the queue; never guess the new conversation's recipients.
    if(target.kind==='compose'&&inWorkspace()&&!document.querySelector('[data-qa="composer_page"]')){
      suspend({forget:true});window.dispatchEvent(new CustomEvent('pme-native-compose-closed'));return;
    }
    fail('The Slack destination changed. Reopen the conversation to continue.');
  },250);
  window.__PME_REPLY__={open,status,suspend,jumpToLatest,focus,confirmSend,markReadNative,overlayOpen,closeAuxiliary,
    dispose(){if(disposed)return;suspend();disposed=true;abort.abort();clearInterval(timer);style.remove();delete window.__PME_REPLY__;window.dispatchEvent(new CustomEvent('pme-native-reply-state'));}};
  window.dispatchEvent(new CustomEvent('pme-native-reply-installed'));
})();
