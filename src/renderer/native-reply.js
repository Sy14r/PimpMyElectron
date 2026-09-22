// Reframes Slack's existing editor. No credentials, draft copying or send API.
(function installNativeReply(){
  if(window.top!==window||location.origin!=='https://app.slack.com'||window.__PME_REPLY__)return;
  if(!document.head||!document.body){document.addEventListener('DOMContentLoaded',installNativeReply,{once:true});return;}
  const key='__pme_native_reply_v1',abort=new AbortController();
  let target=null,active=false,state='idle',reason='',pane=null,editor=null,composer=null,generation=0,disposed=false,scrollMethod=null,threadNavigation=null;
  let pendingSend=null,sendSequence=0,nativeAction=null,switcher=null;
  let aliasButton=null,aliasTitle=null,parkingState='idle';
  let header=null,openSlackButton=null,readOnly=false,cancelLookup=null;
  let menuButton=null,conversationMenu=null,auxiliary=null,auxiliaryMissingAt=0;
  const hiddenHeaderNodes=new Set();
  const valid=t=>t&&/^[TE][A-Z0-9]+$/.test(t.workspaceId)&&(['compose','search','activity'].includes(t.kind)?!t.channelId&&!t.threadTs:/^[CDG][A-Z0-9]+$/.test(t.channelId)&&(!t.threadTs||/^\d+\.\d+$/.test(t.threadTs)));
  try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(valid(saved?.target)&&Date.now()-saved.at<86400000){target=saved.target;active=saved.active===true;}}catch{}
  const style=document.createElement('style');style.id='pme-native-reply-style';
  style.textContent=`[data-pme-native-reply-pane]{position:fixed!important;inset:0 0 0 420px!important;width:calc(100vw - 420px)!important;height:100vh!important;max-height:none!important;min-width:0!important;z-index:2!important;background:var(--sk_primary_background,#1a1d21);}
    /* Activity shares the triage palette only while embedded. Its native
       tabs, filtering, virtualization, and notification controls stay intact. */
    [data-pme-native-activity] :is(.p-home_header,.activity_layout_header__contents,.activity_layout_header__tabs,.p-view_sidebar,.p-activity_ia4_page__filter_bar,.c-virtual_list__scroll_container){background:#191f2c!important;color:#cdd4e4!important;border-color:#ffffff12!important;}
    [data-pme-native-activity] .activity_layout_header__contents{min-height:52px!important;padding:8px 16px!important;gap:8px;}
    [data-pme-native-activity] [data-qa="activity-inbox-sidebar-header-title"]{font-size:16px!important;font-weight:650!important;color:#edf0f7!important;flex:1;min-width:0;}
    [data-pme-native-activity] .activity_layout_header__tabs{padding:0 12px!important;}
    [data-pme-native-activity] .c-tabs__tab{font-size:12px!important;color:#94a2b8!important;}
    [data-pme-native-activity] .c-tabs__tab--active{color:#d2c4f3!important;box-shadow:inset 0 -2px #b7a8ec!important;}
    [data-pme-native-activity] [data-qa="activity-item-container"]{background:#202735!important;color:#cdd4e4!important;border:1px solid #ffffff0c!important;border-radius:10px!important;box-shadow:none!important;}
    [data-pme-native-activity] [data-qa="activity-item-container"]:hover{background:#293246!important;border-color:#b7a8ec44!important;}
    [data-pme-native-activity] [class*="activity_row_content_container"]{background:#202735!important;color:#cdd4e4!important;border-color:#ffffff10!important;border-radius:9px!important;}
    [data-pme-native-activity] [data-qa="activity-item-container"]:hover [class*="activity_row_content_container"]{background:#293246!important;}
    [data-pme-native-activity] [class*="activity_detailed_row_content__sender_name"]{font-size:13px!important;color:#edf0f7!important;}
    [data-pme-native-activity] [class*="activity_detailed_row_content__sender__destination"]{font-size:12px!important;color:#94a2b8!important;}
    [data-pme-native-activity] :is(.p-activity_page__date_divider__pill,.p-activity_ia4_page__filter_bar button){background:#202735!important;color:#94a2b8!important;border-color:#ffffff14!important;box-shadow:none!important;font-size:12px!important;}
    [data-pme-native-activity] .p-activity_page__date_divider__line{background:#ffffff10!important;}
    [data-pme-native-activity] [data-qa="activity-item-message"]{font-size:13px!important;line-height:1.55!important;color:#bcc6d8!important;}
    [data-pme-native-activity] [data-qa="inbox-date-divider"]{background:#191f2c!important;color:#8796ae!important;font-size:11px!important;}
    [data-pme-native-activity] :is(input,[role="searchbox"]){background:#141925!important;color:#cdd4e4!important;border-color:#ffffff18!important;border-radius:8px!important;}
    body[data-pme-native-reply] .p-view_contents:not([data-pme-native-reply-pane]){visibility:hidden!important;}
    body[data-pme-native-reply] [data-pme-native-reply-pane]{visibility:visible!important;}
    body:is([data-pme-native-reply],[data-pme-switcher]) > .ReactModalPortal > .ReactModal__Overlay{z-index:2147483647!important;}
    body:is([data-pme-native-reply],[data-pme-switcher]) > :is(.c-sk-modal_portal,.ReactModalPortal){position:fixed!important;inset:0;z-index:2147483647!important;pointer-events:none;}
    /* Native hover tooltips must remain click-through: their full-window
       overlay otherwise steals hover and repeatedly unmounts message actions. */
    body:is([data-pme-native-reply],[data-pme-switcher]) > :is(.c-sk-modal_portal,.ReactModalPortal) > :not(.c-popover--no-pointer){pointer-events:auto;}
    body:is([data-pme-native-reply],[data-pme-switcher]) .ReactModal__Content{--sk_primary_background:25,31,44;--sk_secondary_background:32,39,53;--sk_primary_foreground:205,212,228;--sk_secondary_foreground:148,162,184;--sk_highlight:195,179,239;background:#191f2c!important;color:#cdd4e4;max-width:calc(100vw - 32px)!important;min-width:0!important;max-height:calc(100vh - 32px)!important;border:1px solid #ffffff20;border-radius:12px!important;box-shadow:0 16px 50px #0008;}
    body:is([data-pme-native-reply],[data-pme-switcher]) .ReactModal__Content :is(.c-sk-modal_header,.c-sk-modal_footer,.p-about_modal__header,.p-about_modal__tab_panel,.p-about_modal__contents,.c-sk-modal_content__inner){background:#191f2c!important;border-color:#ffffff12!important;}
    body[data-pme-switcher] .c-search_modal .ReactModal__Content{position:fixed!important;left:16px!important;right:16px!important;top:64px!important;bottom:auto!important;transform:none!important;width:calc(100vw - 32px)!important;max-width:620px!important;margin:0 auto!important;overflow:auto;}
    body[data-pme-switcher] .c-search_modal{background:#0005!important;}
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
    [data-pme-native-reply-pane][data-pme-message-focus]:focus-visible{outline:1px solid #b7a8ec66;outline-offset:-2px;}
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
    body[data-pme-parking] :is(.ReactModalPortal,.c-popover,.c-menu){visibility:hidden!important;pointer-events:none!important;}
    body[data-pme-background-read] [data-pme-native-reply-pane]{visibility:hidden!important;pointer-events:none!important;}
    [data-pme-native-reply-pane] [data-pme-native-header]{background:#191f2c!important;border-color:#ffffff10!important;}
    [data-pme-native-reply-pane] [data-pme-native-header] :is([data-qa="ai_summary_summarize_thread_button"],[data-qa="secondary-header-more"],[data-feat="view-header:more"]){display:none!important;}
    [data-pme-native-header] [data-pme-alias-title]{font-size:0!important;}
    [data-pme-alias-title] .p-flexpane__subtitle{font-size:12px;}
    [data-pme-native-header] .pme-thread-alias{min-width:0;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1;background:transparent;border:0;border-radius:6px;padding:5px 7px;color:#edf0f7;font:650 15px -apple-system,BlinkMacSystemFont,sans-serif;text-align:left;cursor:pointer;-webkit-app-region:no-drag;}
    [data-pme-native-header] .pme-thread-alias::after{content:'✎';font-size:13px;color:#94a2b8;margin-left:9px;}
    [data-pme-native-header] .pme-thread-alias:hover{background:#ffffff0e;}
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
    [data-pme-native-reply-pane]:has([data-qa="search_view"]){overflow:hidden!important;}
    [data-pme-native-reply-pane] [data-qa="search_view"]{background:#191f2c!important;color:#cdd4e4!important;min-width:0!important;width:100%!important;}
    [data-pme-native-reply-pane] [data-qa="search_view"] > :first-child{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #ffffff10;}
    [data-pme-native-reply-pane] [data-qa="search_view"] > :first-child > :first-child{flex:1;min-width:0;}
    [data-pme-native-reply-pane] [data-qa="combined-feedback-link"]{display:none!important;}
    [data-pme-native-reply-pane] [data-qa="search_result"]{background:#202735!important;border:1px solid #ffffff12!important;border-radius:10px;margin:8px!important;padding:12px!important;cursor:pointer;}
    [data-pme-native-reply-pane] [data-qa="search_view"] :has(> .c-message_kit__hover){background:transparent!important;border:0!important;padding:0!important;}
    [data-pme-native-reply-pane] [data-qa="search_message_header"]{display:flex!important;flex-direction:column;align-items:flex-start;gap:3px;margin-bottom:7px;}
    [data-pme-native-reply-pane] .c-search_message__header_right_timestamps{position:static!important;flex:none!important;}
    [data-pme-native-reply-pane] [data-qa="search_result_channel_name"]{font-size:11px;color:#94a2b8;}
    [data-pme-native-reply-pane] [data-qa="search_result"]:hover{background:#252e40!important;}
    [data-pme-native-reply-pane] [data-qa="search_view"] .c-mrkdwn__highlight{background:#b6a5e833;color:#e4d9fb;}
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
  const inConversation=()=>!!target?.channelId&&inWorkspace()&&(path()[3]===target.channelId||path()[3]==='activity-inbox'&&!!document.querySelector(`[data-qa="message_input"][data-channel-id="${target.channelId}"]`));
  function save(){try{target?sessionStorage.setItem(key,JSON.stringify({target,active,at:Date.now()})):sessionStorage.removeItem(key);}catch{}}
  function notify(){window.dispatchEvent(new CustomEvent('pme-native-reply-state'));}
  function auxiliaryReady(){return !!auxiliary?.view.isConnected&&inWorkspace();}
  function status(){return {active,state,reason,parking:parkingState,target:target&&{...target},auxiliary:auxiliary?.kind||null,readOnly,send:pendingSend&&{confirmed:pendingSend.confirmed,dirty:pendingSend.dirty,visible:!!pendingSend.visibleAt},ready:active&&state==='ready'&&(auxiliaryReady()||verifiedPane()),scrollMethod,threadNavigation};}
  function closeMenu({focus=false}={}){conversationMenu?.remove();conversationMenu=null;menuButton?.setAttribute('aria-expanded','false');if(focus)menuButton?.focus({preventScroll:true});}
  function clearHeader(){aliasButton?.remove();aliasButton=null;aliasTitle?.removeAttribute('data-pme-alias-title');aliasTitle=null;closeMenu();menuButton?.remove();menuButton=null;for(const node of hiddenHeaderNodes)node.removeAttribute('data-pme-menu-native');hiddenHeaderNodes.clear();openSlackButton?.remove();openSlackButton=null;header?.removeAttribute('data-pme-native-header');header=null;}
  function nativeMenuControls(){
    if(!header||target?.threadTs||auxiliary)return [];
    const huddle=header.querySelector('button[data-qa="huddle_channel_header_button"]'),search=header.querySelector('[data-qa="search_in_channel_button"]'),notifications=header.querySelector('[data-feat="view-header:notifications"]'),invite=header.querySelector('button[data-qa="invite-teammates-cta"]');
    return [{id:'huddle',button:huddle,label:'Huddle…'},{id:'search',button:search,label:'Search this conversation…'},
      {id:'notifications',button:notifications,label:notifications?.getAttribute('aria-haspopup')?'Notifications…':notifications?.hasAttribute('aria-pressed')?(notifications.getAttribute('aria-pressed')==='true'?'Unmute conversation':'Mute conversation'):notifications?.getAttribute('aria-label')||'Conversation notifications'},
      {id:'invite',button:invite,label:'Invite teammates…'}].filter(row=>row.button);
  }
  function syncMenuButton(actions){
    if(target?.kind==='activity')return;
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
        closeMenu();if(native&&!native.disabled&&native.getAttribute('aria-disabled')!=='true'){nativeAction={key:target.key,at:Date.now()};native.click();}
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
  function overlayOpen(){return !!conversationMenu||[...document.querySelectorAll('.ReactModal__Content--after-open')].some(node=>node.getBoundingClientRect().width>8&&node.getBoundingClientRect().height>8);}
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
    let found=findAuxiliary();
    if(target.kind==='search'&&found?.kind==='full search')found=null;
    if(found){
      // Promote native full-search navigation to an independent triage pane.
      if(found.kind==='full search'){
        window.dispatchEvent(new CustomEvent('pme-native-search-open',{detail:{workspaceId:target.workspaceId}}));return true;
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
      const conversation=target.kind==='search'?locateSearch():locate();
      if(conversation){
        pane?.removeAttribute('data-pme-native-reply-pane');pane?.removeAttribute('data-pme-native-auxiliary');clearHeader();auxiliary=null;auxiliaryMissingAt=0;
        pane=conversation.view;editor=conversation.input;readOnly=!!conversation.readOnly;pane.setAttribute('data-pme-native-reply-pane','');themeComposer();themeHeader();notify();return true;
      }
      // Native dismissal/navigation may take a frame to remount the editor.
      if(!auxiliaryMissingAt)auxiliaryMissingAt=Date.now();if(Date.now()-auxiliaryMissingAt<2000)return true;
    }
    return false;
  }
  function syncAliasButton(actions){
    if(!target?.threadTs||auxiliary)return;
    const alias=window.__PME_TRIAGE__?.threadAlias?.(target.key)||'';
    if(!aliasButton?.isConnected){
      aliasButton=document.createElement('button');aliasButton.type='button';aliasButton.className='pme-thread-alias';
      aliasTitle=header.querySelector('[data-qa="flexpane-title-container"],.p-threads_flexpane__title,.p-flexpane_header__title');
      if(aliasTitle){aliasTitle.setAttribute('data-pme-alias-title','');aliasTitle.prepend(aliasButton);}else actions.prepend(aliasButton);
    }
    const text=alias||'Thread';if(aliasButton.textContent!==text)aliasButton.textContent=text;
    aliasButton.title=alias?'Rename personal thread name':'Give this thread a personal name';aliasButton.setAttribute('aria-label',`${aliasButton.title}${alias?' · '+alias:''}`);
  }
  function themeHeader(){
    const next=target?.kind==='activity'?pane?.querySelector('[data-qa="activity-inbox-sidebar-header-title"]')?.parentElement:target?.kind==='search'?pane?.querySelector('[data-qa="search_view"]')?.firstElementChild:target?.kind==='compose'?null:pane?.querySelector(auxiliary?'.p-flexpane_header,.p-explorer_header':target?.threadTs?'.p-flexpane_header,.p-threads_flexpane__header':'.p-view_header,.p-channel_header');
    if(next!==header){clearHeader();header=next;header?.setAttribute('data-pme-native-header','');}
    if(!header)return;
    const actions=header.querySelector('.p-flexpane_header__primary,.p-view_header__actions,.p-explorer_header__container')||header;
    syncAliasButton(actions);
    if(openSlackButton?.parentElement===actions){syncMenuButton(actions);return;}
    openSlackButton?.remove();openSlackButton=document.createElement('button');openSlackButton.type='button';openSlackButton.className='pme-open-slack';
    const label=target.kind==='activity'?'Open Activity in Slack':target.kind==='search'?'Open search results in Slack':auxiliary?`Open ${auxiliary.kind} in Slack`:target.threadTs?'Open thread in Slack':'Open conversation in Slack';
    openSlackButton.setAttribute('aria-label',label);openSlackButton.title=label;
    // Match the monochrome Slack icon already used in the triage navigation.
    openSlackButton.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">'+[0,90,180,270].map(angle=>`<g transform="rotate(${angle} 12 12)"><rect x="13" y="1" width="4.5" height="10" rx="2.25"/><rect x="7" y="1" width="4.5" height="4.5" rx="2.25"/></g>`).join('')+'</svg>';
    actions.append(openSlackButton);
    syncMenuButton(actions);
  }
  function headerAction(event){
    if(event.type!=='click'||!active||!header||window.__PME_TRIAGE__?.status().mode!=='reply')return false;
    const button=event.target.closest?.('button');if(!button||!header.contains(button))return false;
    if(button===aliasButton){event.preventDefault();event.stopImmediatePropagation();if(verifiedPane())window.dispatchEvent(new CustomEvent('pme-thread-alias',{detail:{key:target.key}}));return true;}
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
  function unframe(){cancelLookup?.();pendingSend=null;nativeAction=null;clearHeader();document.body?.removeAttribute('data-pme-native-reply');composer?.removeAttribute('data-pme-native-composer');composer=null;for(const n of document.querySelectorAll('[data-pme-message-focus]')){n.removeAttribute('tabindex');n.removeAttribute('data-pme-message-focus');}for(const n of document.querySelectorAll('[data-pme-native-reply-pane]')){n.removeAttribute('data-pme-native-reply-pane');n.removeAttribute('data-pme-native-auxiliary');n.removeAttribute('data-pme-native-activity');}auxiliary=null;auxiliaryMissingAt=0;pane=null;editor=null;readOnly=false;}
  // A notifications-only pane is valid to display, never valid to send through.
  function verifiedPane(){if(target?.kind==='activity')return active&&pane?.isConnected&&locateActivity()?.view===pane;if(target?.kind==='search')return active&&pane?.isConnected&&locateSearch()?.view===pane;return readOnly?active&&pane?.isConnected&&locateReadOnly()?.view===pane:verified();}
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
  function activityDetailMounted(){
    return !!document.querySelector('[data-qa="message_input"],[data-qa="message_pane"],[data-qa="threads_flexpane"],[data-qa="composer_page"]');
  }
  function locateActivity(){
    if(!inWorkspace()||path()[3]!=='activity-inbox'||activityDetailMounted())return null;
    const title=document.querySelector('[data-qa="activity-inbox-sidebar-header-title"]');
    const view=title?.closest('.p-view_contents');
    return view?.isConnected?{view,input:null,readOnly:true}:null;
  }
  async function navigateActivity(run){
    let clicked=false,moreClicked=false,stableAt=0;
    const deadline=Date.now()+2500;
    while(!disposed&&run===generation&&Date.now()<deadline){
      if(path()[3]!=='activity-inbox'){
        const tab=document.querySelector('[data-qa="tab_rail_activity_button"]');
        if(!clicked&&tab){clicked=true;tab.click();}
        else if(!clicked){
          const item=document.querySelector('[data-qa="menu_item_button"][aria-describedby="activity-description"]');
          if(item){clicked=true;item.click();}
          else if(!moreClicked){const more=document.querySelector('[data-qa="tab_rail_browse_button"]');if(more){moreClicked=true;more.click();}}
        }
      }else{
        // Activity remembers its own selected conversation. Its native Close
        // button must unmount that detail; merely hiding it still marks reads.
        const close=document.querySelector('.p-view_contents--primary [data-qa="view_header"] button[aria-label="Close"],.p-view_contents--primary [data-qa="quip_close_thread"],.p-view_contents--primary [data-qa="threads_flexpane"] button[aria-label="Close"]');
        if(close){close.click();stableAt=0;}
        else if(!activityDetailMounted()&&document.querySelector('[data-qa="activity-inbox-sidebar-header-title"]')){
          if(!stableAt)stableAt=Date.now();
          if(Date.now()-stableAt>=150)return {ok:true};
        }else stableAt=0;
      }
      await pause(50);
    }
    return run!==generation||disposed?{cancelled:true}:{ok:false,error:'Slack could not leave the conversation. Open Normal Slack and close its detail pane.'};
  }
  async function park(){
    suspend();const run=generation;parkingState='parking';document.body.setAttribute('data-pme-parking','');
    let result;try{result=await navigateActivity(run);}catch{result={ok:false,error:'Slack could not leave the conversation. Open Normal Slack and close its detail pane.'};}
    if(run===generation&&!disposed){document.body.removeAttribute('data-pme-parking');parkingState=result.ok?'parked':'failed';notify();}
    return result;
  }
  function locateSearch(){
    if(!inWorkspace()||path()[3]!=='search')return null;
    const views=[...document.querySelectorAll('[data-qa="search_view"]')];
    if(views.length!==1)return null;
    const view=views[0].closest('.p-view_contents');
    return view?.isConnected?{view,input:null,readOnly:true}:null;
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
  function jumpToMessage(ts){
    if(!verifiedPane()||!/^\d+\.\d+$/.test(ts))return false;
    const jump=target.threadTs?
      nativeCapability(pane.querySelector('[data-qa="threads_flexpane"]'),p=>p.threadTs===target.threadTs&&typeof p.jumpToReply==='function'?()=>p.jumpToReply(ts):null):
      nativeCapability(pane.querySelector('.c-virtual_list'),p=>typeof p.jumpToMessageInChannel==='function'?()=>p.jumpToMessageInChannel({messageTs:ts}):null);
    if(jump){jump();scrollMethod='native-message';return true;}
    const row=[...pane.querySelectorAll('[data-qa="message_container"][data-msg-ts]')].find(n=>n.getAttribute('data-msg-channel-id')===target.channelId&&n.getAttribute('data-msg-ts')===ts);
    if(!row)return false;row.scrollIntoView({block:'center'});scrollMethod='rendered-message';return true;
  }
  function navigateThread(){
    const parent=locate(null);if(!parent)return false;
    const navigate=nativeCapability(parent.view.querySelector('.c-virtual_list'),p=>typeof p.dispatchNavigateToThread==='function'?p.dispatchNavigateToThread:null);
    if(!navigate)return false;
    navigate({channelId:target.channelId,ts:target.threadTs});return true;
  }
  function jumpToLatest(){
    if(['compose','search','activity'].includes(target?.kind)||!verifiedPane()||state!=='ready')return {ok:false};
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
    if(!verifiedPane()||state!=='ready'||auxiliary||['compose','search','activity'].includes(target?.kind))return {ok:false};
    if(target.threadTs){
      // A manually unread thread suppresses Slack's automatic read-on-open.
      // Use the thread's own explicit mark-read action (also used by Escape).
      const mark=nativeCapability(pane.querySelector('[data-qa="threads_flexpane"]'),(p,instance)=>
        p.threadTs===target.threadTs&&/^\d+\.\d+$/.test(p.maxMarkableTs)&&typeof instance?.markThreadRead==='function'?()=>instance.markThreadRead():null);
      if(!mark)return {ok:false};mark();return {ok:true};
    }
    // Slack's own unread banner button, scoped to the verified conversation.
    const button=pane.querySelector('button.p-message_pane__unread_banner__close_icon');
    if(button){if(button.disabled)return {ok:false};button.click();return {ok:true};}
    // Some channel layouts omit the banner. Its native action still exists;
    // avoid "mark all" because that would also clear separate unread threads.
    const mark=nativeCapability(pane.querySelector('.c-virtual_list'),p=>typeof p.markMostRecentMsgRead==='function'?()=>p.markMostRecentMsgRead({channelId:target.channelId}):null);
    if(!mark)return {ok:false};mark();return {ok:true};
  }
  function markUnreadNative(){
    if(!verifiedPane()||state!=='ready'||auxiliary||['compose','search','activity'].includes(target?.kind))return {ok:false};
    let mark,noReply=false;
    if(target.threadTs){
      mark=nativeCapability(pane.querySelector('[data-qa="threads_flexpane"]'),p=>{
        if(p.threadTs!==target.threadTs||typeof p.markReplyAsUnreadByMsg!=='function')return null;
        const message=p.messages?.[p.latest];
        if(message?.ts===target.threadTs&&p.latest===target.threadTs)noReply=true;
        // Never fall back to the root: that would mark the parent conversation.
        if(!message||!/^\d+\.\d+$/.test(message.ts)||message.ts!==p.latest||message.thread_ts!==target.threadTs||Number(message.ts)<=Number(target.threadTs))return null;
        return ()=>p.markReplyAsUnreadByMsg(message);
      });
    }else{
      // Use the newest rendered message's own action; do not invent timestamps
      // or access the store/dispatch layer. Slack owns the resulting write.
      const rows=[...pane.querySelectorAll('[data-qa="message_container"][data-msg-ts]')]
        .filter(n=>n.getAttribute('data-msg-channel-id')===target.channelId&&/^\d+\.\d+$/.test(n.getAttribute('data-msg-ts')))
        .sort((a,b)=>Number(b.getAttribute('data-msg-ts'))-Number(a.getAttribute('data-msg-ts')));
      const row=rows[0],ts=row?.getAttribute('data-msg-ts');
      mark=nativeCapability(row,p=>p.ts===ts&&typeof p.markMsgUnread==='function'?()=>p.markMsgUnread({channel:target.channelId,ts}):null);
    }
    if(!mark)return {ok:false,error:noReply?'no-reply':'unavailable'};mark();return {ok:true};
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
  async function findMissingConversation(run){
    // Cached conversations may be absent from Slack's filtered/virtualized
    // sidebar. Use its native search once and match the exact destination ID.
    const member=/^D[A-Z0-9]+$/.test(target.channelId),resultId=member?target.peer:target.channelId;
    if(!(member?/^[UW][A-Z0-9]+$/.test(resultId||''):/^[CG][A-Z0-9]+$/.test(resultId||''))||!inWorkspace()||overlayOpen())return false;
    const button=document.querySelector('[data-qa="top_nav_search"]');if(!button)return false;
    const destination={...target};let modal=null,field=null,typed=false,cancelled=false;
    const cancel=()=>{if(cancelled)return;cancelled=true;if(modal?.isConnected)modal.querySelector('[data-qa="search_input_close"]')?.click();};
    cancelLookup=cancel;
    const current=()=>!cancelled&&!disposed&&active&&run===generation&&target.key===destination.key&&inWorkspace();
    try{
      // This native control opens on mousedown, not click.
      button.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));const deadline=Date.now()+3000;
      while(current()&&Date.now()<deadline){
        const input=document.querySelector('[data-qa="floating_omniswitcher_input"] [data-qa="texty_input"]');
        // Quill mounts before enabling editing; inserting sooner loses the query.
        if(input?.isContentEditable&&input.getAttribute('data-team-id')===destination.workspaceId){
          field=input;modal=input.closest('.ReactModal__Content');if(!modal)return false;
          if(!typed){
            // Let Slack's editor process input normally; don't mutate its DOM or
            // call search endpoints. This is only the switcher's query field.
            field.focus();if(document.activeElement!==field)return false;
            const range=document.createRange();range.selectNodeContents(field);
            const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
            if(!document.execCommand('insertText',false,destination.name))return false;
            typed=true;
          }
          // If the user changes the query, stop controlling this search.
          if(field.textContent.trim()!==destination.name){modal=null;return false;}
          const result=[...modal.querySelectorAll(`[data-qa="search_autocomplete"] [data-type="${member?'member':'channel'}"][data-is-navigational="true"]`)].find(n=>n.getAttribute('data-id')===resultId);
          if(result&&current()){result.click();modal=null;return true;}
        }else if(typed)return false;
        await waitForNativeChange();
      }
      return false;
    }finally{if(cancelLookup===cancel)cancelLookup=null;cancel();}
  }
  // The user operates Slack's own switcher. Only a selected native suggestion
  // is read; no stores, search endpoints, credentials or composer text are used.
  function switcherDestination(row,workspaceId){
    if(!row||!/^[TE][A-Z0-9]+$/.test(workspaceId))return null;
    if(['queryUser','queryHistory'].includes(row.getAttribute('data-type')))return {kind:'search',workspaceId,key:`${workspaceId}:search`,name:'Search results'};
    if(row.getAttribute('data-is-navigational')!=='true')return null;
    const id=row.getAttribute('data-id'),type=row.getAttribute('data-type');
    let channelId=null,peer;
    if(type==='channel'&&/^[CDG][A-Z0-9]+$/.test(id))channelId=id;
    else if(type==='member'&&/^[UW][A-Z0-9]+$/.test(id)){
      peer=id;
      let fiber=row[Object.keys(row).find(k=>k.startsWith('__reactFiber$'))];
      for(let depth=0;fiber&&depth<6;depth++,fiber=fiber.return){
        const suggestion=fiber.memoizedProps?.suggestion,im=suggestion?.im;
        if(suggestion?.id===id&&im?.user===id&&im.context_team_id===workspaceId&&/^D[A-Z0-9]+$/.test(im.id)){channelId=im.id;break;}
      }
    }
    if(!channelId)return null;
    return {workspaceId,channelId,peer,threadTs:null,key:`${workspaceId}:${channelId}:`,name:String(row.getAttribute('aria-label')||channelId).replace(/, Direct Message$/, '').slice(0,180)};
  }
  function switcherOpen(){return !!switcher;}
  function cancelSwitcher({restore=true,close=true}={}){
    const session=switcher;if(!session)return;
    switcher=null;document.body.removeAttribute('data-pme-switcher');
    if(close&&session.modal?.isConnected)session.modal.querySelector('[data-qa="search_input_close"]')?.click();
    if(restore&&!session.selected)void afterLayout().then(()=>{
      if(disposed||switcher||!session.focus?.isConnected)return;
      session.focus.focus({preventScroll:true});
      if(session.range&&session.focus.contains(session.range.startContainer)){
        const selection=window.getSelection();selection.removeAllRanges();selection.addRange(session.range);
      }
      if(session.inputSelection)session.focus.setSelectionRange?.(...session.inputSelection);
    });
  }
  async function openSwitcher(workspaceId=nativeTeam()){
    if(disposed||!/^[TE][A-Z0-9]+$/.test(workspaceId||''))return false;
    if(switcher){switcher.field?.focus();return true;}
    if(overlayOpen())return false;
    const button=document.querySelector('[data-qa="top_nav_search"]');if(!button)return false;
    const focused=document.activeElement?.shadowRoot?.activeElement||document.activeElement;
    const selection=window.getSelection(),range=selection?.rangeCount&&focused?.contains(selection.anchorNode)?selection.getRangeAt(0).cloneRange():null;
    const session={focus:focused,range,inputSelection:typeof focused?.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd]:null,modal:null,field:null,selected:false,started:Date.now()};
    switcher=session;document.body.setAttribute('data-pme-switcher','');
    if(nativeTeam()!==workspaceId){
      const team=[...document.querySelectorAll('[data-qa="team_sidebar_item"]')].find(node=>node.getAttribute('data-team')===workspaceId);
      if(!team){cancelSwitcher();return false;}team.click();
    }
    let opened=false;
    const deadline=Date.now()+4000;
    while(switcher===session&&!disposed&&Date.now()<deadline){
      if(nativeTeam()===workspaceId&&path()[2]===workspaceId&&!opened){
        document.querySelector('[data-qa="top_nav_search"]')?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));opened=true;
      }
      const field=opened&&document.querySelector('[data-qa="floating_omniswitcher_input"] [data-qa="texty_input"]');
      if(field)session.modal=field.closest('.ReactModal__Content');
      if(field?.isContentEditable&&field.getAttribute('data-team-id')===workspaceId){
        session.modal=field.closest('.ReactModal__Content');session.field=field;
        if(!session.modal)break;
        field.focus();
        // Select only the search query, never a message draft.
        const range=document.createRange();range.selectNodeContents(field);
        const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
        return true;
      }
      await waitForNativeChange();
    }
    if(switcher===session)cancelSwitcher();return false;
  }
  function switcherAction(event){
    const session=switcher;if(!session)return false;
    if(event.type==='click'||event.type==='keydown'&&event.key!=='Enter')session.nativeSearch=null;
    if(event.type==='keydown'&&event.key==='Escape'&&!event.isComposing){
      event.preventDefault();event.stopImmediatePropagation();if(!event.repeat&&!session.selected)cancelSwitcher();return true;
    }
    if(!session.modal?.contains(event.target)||session.selected)return false;
    let row;
    if(event.type==='click'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&!(event.button>0))row=event.target.closest?.('[data-qa="search_autocomplete"] [role="option"]');
    else if(event.type==='keydown'&&event.key==='Enter'&&!event.isComposing&&!event.shiftKey&&!event.metaKey&&!event.ctrlKey&&!event.altKey){
      if(event.repeat){event.preventDefault();event.stopImmediatePropagation();return true;}
      row=session.modal.querySelector('[data-qa="search_autocomplete"] [aria-selected="true"]')||session.modal.querySelector('[data-qa="search_autocomplete"] .c-search_autocomplete__suggestion_item--pseudo-selected');
      if(!row){session.nativeSearch={workspaceId:session.field.getAttribute('data-team-id'),at:Date.now()};return false;}
    }
    if(!row)return false;
    const workspaceId=session.field.getAttribute('data-team-id');
    const destination=switcherDestination(row,workspaceId);
    const id=row.getAttribute('data-id'),type=row.getAttribute('data-type');
    let used=false;
    const navigate=()=>{
      if(used||switcher!==session||!row.isConnected||row.getAttribute('data-id')!==id||row.getAttribute('data-type')!==type)return;
      used=true;cancelSwitcher({restore:false,close:false});row.click();
    };
    session.selected=true;session.selectedAt=Date.now();
    event.preventDefault();event.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent('pme-native-switcher-action',{detail:{destination,navigate}}));
    return true;
  }
  function syncSwitcher(){
    const session=switcher;if(!session)return;
    if(session.modal&&!session.modal.isConnected){
      const search=session.nativeSearch,workspaceId=search?.workspaceId;
      if(search&&Date.now()-search.at<10000){
        // The popup can unmount before Slack commits its new route.
        if(path()[3]==='search'&&path()[2]===workspaceId&&nativeTeam()===workspaceId){
          cancelSwitcher({restore:false,close:false});window.dispatchEvent(new CustomEvent('pme-native-search-open',{detail:{workspaceId}}));
        }
      }else cancelSwitcher({close:false});
    }
    else if(session.selected&&Date.now()-session.selectedAt>15000)cancelSwitcher();
  }
  function focus(){
    if(['search','activity'].includes(target?.kind))return focusMessages();
    if(state!=='ready'||!verified())return false;
    (target.kind==='compose'?locateCompose()?.recipient||editor:editor).focus({preventScroll:true});return true;
  }
  function focusMessages(){
    if(state!=='ready'||auxiliary||!verifiedPane())return false;
    if(!pane.hasAttribute('tabindex')){pane.setAttribute('tabindex','-1');pane.setAttribute('data-pme-message-focus','');}
    pane.focus({preventScroll:true});return document.activeElement===pane;
  }
  async function open(request,{focusEditor=true,nativeNavigate=null,preservePosition=false}={}){
    if(!valid(request)||disposed)return {ok:false,error:'Invalid reply destination'};
    const previousAuxiliary=findAuxiliary();
    const close=previousAuxiliary?.kind==='full search'?document.querySelector('[data-qa="tab_rail_home_button"]'):previousAuxiliary?.view.querySelector('button:has(svg[data-qa="caret-left-full"]),button[aria-label="Close"]');
    const run=++generation;document.body.removeAttribute('data-pme-parking');parkingState='idle';unframe();scrollMethod=null;threadNavigation=null;
    target=['compose','search','activity'].includes(request.kind)?{kind:request.kind,workspaceId:request.workspaceId,key:`${request.workspaceId}:${request.kind}`,name:request.kind==='activity'?'Activity':request.kind==='search'?'Search results':'New message',workspaceName:String(request.workspaceName||request.workspaceId).slice(0,180)}:
      {workspaceId:request.workspaceId,channelId:request.channelId,threadTs:request.threadTs||null,
      key:request.key||`${request.workspaceId}:${request.channelId}:${request.threadTs||''}`,messageTs:/^\d+\.\d+$/.test(request.messageTs||'')?request.messageTs:null,peer:/^[UW][A-Z0-9]+$/.test(request.peer||'')?request.peer:undefined,name:String(request.name||request.channelId).slice(0,180),workspaceName:String(request.workspaceName||request.workspaceId).slice(0,180)};
    active=true;state='loading';reason=target.kind==='activity'?'Opening Slack’s Activity…':target.kind==='search'?'Opening Slack’s search results…':target.kind==='compose'?'Opening Slack’s new message composer…':'Opening Slack’s native editor…';save();notify();
    // Use Slack's own navigation. Assigning a URL can race the desktop client's
    // remembered workspace and restore the old route over the requested editor.
    let workspaceClicked=false,channelClicks=0,lastChannelClick=0,threadClicked=false,tabClicked=false,auxClosed=false,composeClicked=false,lookupAttempted=false,homeClicked=false,activityOpened=false,activityItemClicked=false;
    const deadline=Date.now()+10000;
    try{
      if(nativeNavigate){
        // Replaying the user's link must run after its first activation ends.
        await pause(0);if(disposed||run!==generation||!active)return {cancelled:true};
        nativeNavigate();
      }else if(close&&(target.kind!=='search'||previousAuxiliary?.kind!=='full search')){
        // The profile's Back button can be the originating click. Chromium
        // ignores a nested .click() on that same button until activation ends.
        await pause(0);if(disposed||run!==generation||!active)return {cancelled:true};
        close.click();
      }
      while(Date.now()<deadline){
      if(disposed||run!==generation||!active)return {cancelled:true};
      if(!nativeNavigate&&!inWorkspace()&&!workspaceClicked){
        const team=[...document.querySelectorAll('[data-qa="team_sidebar_item"]')].find(n=>n.getAttribute('data-team')===target.workspaceId);
        if(team){workspaceClicked=true;team.click();}
      }
      if(!nativeNavigate&&inWorkspace()&&target.kind!=='activity'&&path()[3]==='activity-inbox'&&!homeClicked){
        const home=document.querySelector('[data-qa="tab_rail_home_button"]');
        if(home&&!inConversation()){homeClicked=true;home.click();await waitForNativeChange();continue;}
        if(!home&&!activityItemClicked&&target.channelId){
          const row=[...document.querySelectorAll('[data-qa="activity-item-container"]')].find(row=>{const item=activityItem(row,target.workspaceId);return item?.channelId===target.channelId&&(item.threadTs||null)===(target.threadTs||null);});
          if(row){activityItemClicked=true;row.click();await waitForNativeChange();continue;}
        }
      }
      if(target.kind==='activity'&&inWorkspace()&&!activityOpened){
        activityOpened=true;const parked=await navigateActivity(run);
        if(!parked.ok){if(!parked.cancelled)fail(parked.error);return parked;}
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
      if(!nativeNavigate&&inConversation()&&!auxClosed&&!threadClicked&&!locate()){
        const close=document.querySelector('[data-qa="quip_close_thread"]')||document.querySelector('[data-qa="threads_flexpane"] button[aria-label="Close"]');
        if(close){
          // A triage Back click can be on this very button. Let its original
          // activation finish before invoking it, or Chromium ignores .click().
          await pause(0);if(disposed||run!==generation||!active)return {cancelled:true};
          close.click();auxClosed=true;lastChannelClick=Date.now();await waitForNativeChange();continue;
        }
      }
      if(!nativeNavigate&&!['compose','search','activity'].includes(target.kind)&&inWorkspace()&&channelClicks<3&&!threadClicked&&Date.now()-lastChannelClick>=750&&!locate()&&!(target.threadTs&&locate(null))){
        const row=[...document.querySelectorAll('[data-qa="channel-sidebar-channel"]')].find(n=>n.getAttribute('data-qa-channel-sidebar-channel-id')===target.channelId);
        if(row){channelClicks++;lastChannelClick=Date.now();row.click();}
        else if(!lookupAttempted&&!inConversation()&&(target.peer||/^[CG]/.test(target.channelId))){lookupAttempted=true;await findMissingConversation(run);continue;}
      }
      const found=target.kind==='activity'?locateActivity():target.kind==='search'?locateSearch():target.kind==='compose'?locateCompose():locate();
      if(found){
        pane=found.view;editor=found.input;readOnly=!!found.readOnly;pane.setAttribute('data-pme-native-reply-pane','');if(target.kind==='activity')pane.setAttribute('data-pme-native-activity','');document.body.setAttribute('data-pme-native-reply','');themeComposer();themeHeader();
        state='ready';reason=target.kind==='activity'?'Slack’s Activity':target.kind==='search'?'Slack’s search results':readOnly?'Slack’s notifications-only conversation':'Slack’s editor · sending and drafts are handled by Slack';save();notify();
        // Allow the reframed list to measure its final height before jumping.
        await afterLayout();if(disposed||run!==generation||!active)return {cancelled:true};
        if(!verifiedPane()){fail('The Slack destination changed. Reopen the conversation to continue.');return {ok:false,error:reason};}
        if(target.messageTs&&!nativeNavigate){if(!jumpToMessage(target.messageTs)){fail('Slack could not locate the linked message. Open it in Normal Slack.');return {ok:false,error:reason};}}
        else if(!['compose','search','activity'].includes(target.kind)&&!preservePosition)jumpToLatest();
        if(focusEditor)focus();return {ok:true};
      }
      if(!nativeNavigate&&inConversation()){
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
    if(run===generation&&active)fail(target.kind==='search'?'Slack’s search results are unavailable here. Retry or use Normal Slack.':target.kind==='compose'?'Slack’s new message composer is unavailable. Retry or use Normal Slack.':target.threadTs?'This thread is not loaded in Slack’s view. Open it in Normal Slack, then retry.':'Slack’s editor is unavailable here. Open the conversation in Normal Slack, then retry.');
    if(nativeNavigate&&run===generation&&active)window.dispatchEvent(new CustomEvent('pme-native-fallback',{detail:{key:target.key}}));
    return {ok:false,error:reason};
  }
  function suspend({forget=false}={}){generation++;document.body.removeAttribute('data-pme-parking');active=false;state='idle';reason='';unframe();if(forget)target=null;save();notify();}
  function slackLinkDestination(anchor){
    let url,teams;try{url=new URL(anchor.getAttribute('href'),location.href);teams=Object.values(JSON.parse(localStorage.getItem('localConfig_v2')||'{}').teams||{});}catch{return null;}
    if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='slack.com'||url.hostname.endsWith('.slack.com')))return null;
    const archive=url.pathname.match(/^\/archives\/([CDG][A-Z0-9]+)(?:\/p(\d{7,}))?\/?$/);
    const client=url.hostname==='app.slack.com'&&url.pathname.match(/^\/client\/([TE][A-Z0-9]+)\/([CDG][A-Z0-9]+)\/?$/);
    if(!archive&&!client)return null;
    const workspace=teams.find(w=>{try{return client?w.id===client[1]:new URL(w.url).hostname===url.hostname;}catch{return false;}});
    if(!workspace||!/^[TE][A-Z0-9]+$/.test(workspace.id))return null;
    // Native timestamp links inside a thread mean "Open in channel". Copied
    // message links with thread_ts instead explicitly request that thread.
    const threadTs=anchor.hasAttribute('data-ts')&&anchor.closest?.('[data-qa="threads_flexpane"]')?null:url.searchParams.get('thread_ts');
    if(threadTs&&!/^\d+\.\d+$/.test(threadTs))return null;
    const raw=archive?.[2];
    return {workspaceId:workspace.id,channelId:archive?archive[1]:client[2],threadTs:threadTs||null,messageTs:raw?`${raw.slice(0,-6)}.${raw.slice(-6)}`:null};
  }
  function searchResultDestination(anchor,destination){
    const result=anchor.closest?.('[data-qa="search_result"]');if(!result||!destination?.messageTs)return destination;
    let fiber=result[Object.keys(result).find(k=>k.startsWith('__reactFiber$'))];
    for(let depth=0;fiber&&depth<18;depth++,fiber=fiber.return){
      const p=fiber.memoizedProps,channel=typeof p?.channel==='string'?p.channel:p?.channel?.id;
      if(p?.teamId===destination.workspaceId&&channel===destination.channelId&&p.msg?.ts===destination.messageTs&&/^\d+\.\d+$/.test(p.msg.thread_ts||''))return {...destination,threadTs:p.msg.thread_ts};
    }
    return destination;
  }
  function linkAction(event){
    if(event.type!=='click'||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!active||state!=='ready'||window.__PME_TRIAGE__?.status().mode!=='reply')return false;
    let anchor=event.target.closest?.('a[href]');
    if(!anchor&&(auxiliary?.kind==='search'||target?.kind==='search')&&(event.target.closest?.('[data-qa="reply_bar"]')||!event.target.closest?.('button,a,[role="button"]')))anchor=event.target.closest?.('[data-qa="search_result"]')?.querySelector('a[data-ts][href]');
    if(!anchor||!pane?.contains(anchor)||!(auxiliaryReady()||verifiedPane())||anchor.hasAttribute('download'))return false;
    const destination=searchResultDestination(anchor,slackLinkDestination(anchor));if(!destination)return false;
    const href=anchor.getAttribute('href');let used=false;
    event.preventDefault();event.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent('pme-native-link-action',{detail:{sourceKey:target.key,destination,navigate:()=>{
      if(used||!anchor.isConnected||anchor.getAttribute('href')!==href)throw Error('The native link changed');used=true;anchor.click();
    }}}));return true;
  }
  function activityItem(row,workspaceId){
    let fiber=row[Object.keys(row).find(k=>k.startsWith('__reactFiber$'))];
    for(let depth=0;fiber&&depth<40;depth++,fiber=fiber.return){
      const props=fiber.memoizedProps;
      if(props?.activityItem&&props.msg?.source_team_id===workspaceId&&props.msg.channel===props.activityItem.channelId)return props.activityItem;
    }
    return null;
  }
  function activityAction(event){
    if(event.type!=='click'||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||event.button>0||
      !active||state!=='ready'||target?.kind!=='activity'||!verifiedPane())return false;
    const row=event.target.closest?.('[data-qa="activity-item-container"]');
    if(!row||!pane.contains(row)||event.target.closest?.('button,a,input,[role="checkbox"]'))return false;
    const item=activityItem(row,target.workspaceId);
    if(!item||!/^[CDG][A-Z0-9]+$/.test(item.channelId)||item.threadTs&&!/^\d+\.\d+$/.test(item.threadTs))return false;
    const sourceKey=target.key,destination={workspaceId:target.workspaceId,channelId:item.channelId,threadTs:item.threadTs||null};let used=false;
    event.preventDefault();event.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent('pme-native-link-action',{detail:{sourceKey,destination,activity:true,navigate:()=>{
      if(used||!row.isConnected)throw Error('The Activity item changed');used=true;row.click();
    }}}));return true;
  }
  function profileAction(event){
    if(event.type!=='click'||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||event.button>0||
      !active||state!=='ready'||auxiliary?.kind!=='profile'||!auxiliaryReady()||window.__PME_TRIAGE__?.status().mode!=='reply')return false;
    const button=event.target.closest?.('button');if(!button||!pane?.contains(button)||button.disabled)return false;
    // Slack's Recent DMs links carry the actual conversation ID as their React
    // key, not an href. Require the enclosing native Recent DMs section; never
    // infer recipients from visible names or unrelated profile controls.
    let fiber=button[Object.keys(button).find(k=>k.startsWith('__reactFiber$'))],link=null,recent=false;
    for(let depth=0;fiber&&depth<40;depth++,fiber=fiber.return){
      const props=fiber.memoizedProps;
      if(!link&&/^[DG][A-Z0-9]+$/.test(fiber.key||'')&&typeof props?.onClick==='function')link={channelId:fiber.key,click:props.onClick};
      if(props?.section&&/^[UW][A-Z0-9]+$/.test(props.memberId||'')&&String(fiber.key||'').endsWith('-recent-dms')){recent=true;break;}
    }
    if(!recent||!link)return false;
    const sourceKey=target.key,workspaceId=target.workspaceId,profile=pane;
    const close=profile.querySelector('button:has(svg[data-qa="caret-left-full"]),button[aria-label="Close"]');
    let used=false;
    event.preventDefault();event.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent('pme-native-link-action',{detail:{sourceKey,destination:{workspaceId,channelId:link.channelId},navigate:()=>{
      if(used||!inWorkspace()||!profile.isConnected)throw Error('The native profile changed');used=true;
      // Known inbox destinations use ordinary routing. For uncached DMs, keep
      // Slack's exact navigation callback after dismissing the originating pane.
      close?.click();link.click();
    }}}));return true;
  }
  function threadAction(event){
    if(event.type!=='click'||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||
      !active||state!=='ready'||target?.kind==='compose'||target?.threadTs||auxiliary||window.__PME_TRIAGE__?.status().mode!=='reply')return false;
    const control=event.target.closest?.('[data-qa="reply_bar"],[data-qa="start_thread"]');
    if(!control||!pane?.contains(control)||!verifiedPane())return false;
    const message=control.closest('[data-qa="message_container"][data-msg-ts]');
    const threadTs=message?.getAttribute('data-msg-ts');
    if(message?.getAttribute('data-msg-channel-id')!==target.channelId||!/^\d+\.\d+$/.test(threadTs||''))return false;
    // Treat this as an explicit destination change before Slack replaces the DM
    // editor. Keep the normal destination/send guards intact during navigation.
    event.preventDefault();event.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent('pme-native-thread-action',{detail:{sourceKey:target.key,threadTs}}));return true;
  }
  // A route/editor replacement must never leave a stale destination label over
  // a different composer. Recheck on input as well as during DOM reconciliation.
  function guard(event){if(switcherAction(event))return;if(!active)return;
    if(headerAction(event)||activityAction(event)||profileAction(event)||threadAction(event)||linkAction(event))return;
    const sending=event.type==='click'&&event.target.closest?.('[data-qa="texty_send_button"]')||event.type==='keydown'&&event.key==='Enter'&&event.target.closest?.('[data-qa="message_input"]');
    if(sending&&(state!=='ready'||!verified())){event.preventDefault();event.stopImmediatePropagation();fail('The Slack destination changed. Reopen the conversation to continue.');return;}
    if(!sending&&event.type==='click'&&event.isTrusted&&state==='ready'&&pane?.contains(event.target)&&
      !event.target.closest?.('[data-qa="message_input"],[data-qa="composer_page"]')&&event.target.closest?.('a,button,[role="button"]'))nativeAction={key:target.key,at:Date.now()};
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
    syncSwitcher();
    if(switcher)return;
    finishSend();
    if(!active||state!=='ready')return;
    if(target.kind==='activity'&&activityDetailMounted()){window.dispatchEvent(new CustomEvent('pme-native-fallback',{detail:{key:target.key}}));return;}
    if(syncAuxiliary())return;
    if(verifiedPane()){themeHeader();return;}
    if(nativeAction?.key===target.key&&Date.now()-nativeAction.at<5000){
      // Allow a native auxiliary view to mount. Unsupported layouts belong in
      // full Slack, where their controls work without our clipped pane.
      notify();if(Date.now()-nativeAction.at<1500)return;
      nativeAction=null;window.dispatchEvent(new CustomEvent('pme-native-fallback',{detail:{key:target.key}}));return;
    }
    // Sending or closing New Message can leave its page through native routing.
    // Return to the queue; never guess the new conversation's recipients.
    if(target.kind==='compose'&&inWorkspace()&&!document.querySelector('[data-qa="composer_page"]')){
      suspend({forget:true});window.dispatchEvent(new CustomEvent('pme-native-compose-closed'));return;
    }
    fail('The Slack destination changed. Reopen the conversation to continue.');
  },250);
  window.__PME_REPLY__={openSwitcher,cancelSwitcher,switcherOpen,open,status,suspend,park,jumpToLatest,focus,focusMessages,confirmSend,markReadNative,markUnreadNative,overlayOpen,closeAuxiliary,
    dispose(){if(disposed)return;cancelSwitcher({restore:false});suspend();disposed=true;abort.abort();clearInterval(timer);style.remove();delete window.__PME_REPLY__;window.dispatchEvent(new CustomEvent('pme-native-reply-state'));}};
  window.dispatchEvent(new CustomEvent('pme-native-reply-installed'));
})();
