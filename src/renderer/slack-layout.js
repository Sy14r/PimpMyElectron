(()=>{
  'use strict';
  if(window.__PME_SLACK_LAYOUT__||location.origin!=='https://app.slack.com')return;

  const defaults={railMode:'full',hiddenRailPlacement:'topbar',railHome:false,railDMs:false,railActivity:false,railFiles:false,railLater:false,railAgents:false,railCreate:false,railFocus:false,railProfile:false,railMore:false,hideWorkspaceSwitcher:false,hideBackForward:false,headerStar:false,headerMembers:false,headerHuddle:false,headerNotifications:false,headerSearch:false,headerCanvas:false,singleLineHeader:false,threadPaneWidth:0,minimalTopBar:false,toolbarFollowsPointer:false};
  const booleanKeys=['railHome','railDMs','railActivity','railFiles','railLater','railAgents','railCreate','railFocus','railProfile','railMore','hideWorkspaceSwitcher','hideBackForward','headerStar','headerMembers','headerHuddle','headerNotifications','headerSearch','headerCanvas','singleLineHeader','minimalTopBar','toolbarFollowsPointer'];
  const railItems={railHome:'tab_rail_home_button',railDMs:'tab_rail_dms_button',railActivity:'tab_rail_activity_button',railFiles:'tab_rail_files_button',railLater:'tab_rail_later_button'};
  const abort=new AbortController();
  let settings={...defaults},disposed=false,scheduled=false,menu=null,more=null,overflowTargets=[],activeToolbar=null,toolbarFrame=0,toolbarPointer=null;

  const style=document.createElement('style');
  style.id='pme-slack-layout-style';
  style.textContent=`
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-home] [data-qa="tab_rail_desktop"] [role="tablist"] > :has([data-qa="tab_rail_home_button"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-dms] [data-qa="tab_rail_desktop"] [role="tablist"] > :has([data-qa="tab_rail_dms_button"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-activity] [data-qa="tab_rail_desktop"] [role="tablist"] > :has([data-qa="tab_rail_activity_button"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-files] [data-qa="tab_rail_desktop"] [role="tablist"] > :has([data-qa="tab_rail_files_button"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-later] [data-qa="tab_rail_desktop"] [role="tablist"] > :has([data-qa="tab_rail_later_button"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-agents] [data-qa="tab_rail_desktop"] [role="tablist"] > :has(svg[data-qa="ai-agents"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-create] button[data-feat="control-strip:create"],
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-create] .p-control_strip > :has(button[data-feat="control-strip:create"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-focus] .p-control_strip > :has(button[data-qa="silent-sidebar-trigger"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-profile] :is([data-qa="tab_rail_desktop"],.p-control_strip) button[data-qa="user-button"],
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-profile] .p-control_strip > :has(button[data-qa="user-button"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-rail-more] [data-pme-layout-more],
    body:not([data-pme-layout-suspended])[data-pme-layout-back-forward] [data-qa="history_back_button"],
    body:not([data-pme-layout-suspended])[data-pme-layout-back-forward] [data-qa="history_forward_button"]{display:none!important}
    body:not([data-pme-layout-suspended])[data-pme-layout-hide-workspace-switcher] [data-qa="tab_rail_desktop"] button[data-qa="account_switcher_team_icon"],
    body:not([data-pme-layout-suspended])[data-pme-layout-hide-workspace-switcher] [data-qa="tab_rail_desktop"] *:has(> button[data-qa="account_switcher_team_icon"]){display:none!important}

    body:not([data-pme-layout-suspended])[data-pme-layout-header-star] [data-qa="view_header"] [data-qa="entity-header-star-button"],
    body:not([data-pme-layout-suspended])[data-pme-layout-header-star] [data-qa="view_header"] .p-view_header__actions > :has([data-qa="entity-header-star-button"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-header-members] [data-qa="view_header"] [data-qa="avatar_stack"],
    body:not([data-pme-layout-suspended])[data-pme-layout-header-members] [data-qa="view_header"] .p-view_header__actions > :has([data-qa="avatar_stack"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-header-huddle] [data-qa="view_header"] [data-qa="huddle_channel_header_button"],
    body:not([data-pme-layout-suspended])[data-pme-layout-header-huddle] [data-qa="view_header"] .p-view_header__actions > :has([data-qa="huddle_channel_header_button"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-header-notifications] [data-qa="view_header"] [data-qa="control_button"],
    body:not([data-pme-layout-suspended])[data-pme-layout-header-notifications] [data-qa="view_header"] .p-view_header__actions > :has([data-qa="control_button"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-header-search] [data-qa="view_header"] [data-qa="search_in_channel_button"],
    body:not([data-pme-layout-suspended])[data-pme-layout-header-search] [data-qa="view_header"] .p-view_header__actions > :has([data-qa="search_in_channel_button"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-header-canvas] .p-view_contents--primary [role="tablist"] [data-qa="channel_canvas"],
    body:not([data-pme-layout-suspended])[data-pme-layout-header-canvas] .p-view_contents--primary [role="tablist"] [role="tab"]:has([data-qa="channel_canvas"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-header-canvas] .p-view_contents--primary [role="tablist"] [data-qa="add-channel-canvas"],
    body:not([data-pme-layout-suspended])[data-pme-layout-header-canvas] .p-view_contents--primary [role="tablist"] [role="tab"]:has([data-qa="add-channel-canvas"]),
    body:not([data-pme-layout-suspended])[data-pme-layout-header-canvas] .p-view_contents--primary [role="tablist"] [data-qa="bookmark"],
    body:not([data-pme-layout-suspended])[data-pme-layout-header-canvas] .p-view_contents--primary [role="tablist"] [role="tab"]:has([data-qa="bookmark"]){display:none!important}

    body:not([data-pme-layout-suspended])[data-pme-layout-single-line-header] [data-pme-layout-header-tabs]{position:relative!important;z-index:1!important;flex:0 0 0!important;height:0!important;min-height:0!important;padding-block:0!important;border-block-width:0!important;overflow:visible!important}
    body:not([data-pme-layout-suspended])[data-pme-layout-single-line-header] [data-pme-layout-header-tabs] [role="tablist"]{position:absolute!important;top:var(--pme-layout-header-tabs-top)!important;left:var(--pme-layout-header-tabs-left)!important;width:var(--pme-layout-header-tabs-width)!important;max-width:var(--pme-layout-header-tabs-width)!important;height:var(--pme-layout-header-tabs-height)!important;margin:0!important;box-sizing:border-box!important;align-items:center!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:thin}
    [data-pme-layout-thread-track]{box-sizing:border-box!important;width:100%!important;min-width:0!important;max-width:100%!important}
    [data-pme-layout-thread-track="row"]{flex:1 1 auto!important}
    [data-pme-layout-toolbar-follow]{transition:transform .1s ease!important}

    body:not([data-pme-layout-suspended])[data-pme-layout-minimal-topbar] [data-pme-layout-overflow-source]{display:none!important}
    body:not([data-pme-layout-suspended])[data-pme-layout-minimal-topbar] .p-client_workspace_wrapper{grid-template-columns:0 minmax(0,1fr)!important}
    body:not([data-pme-layout-suspended]) [data-pme-layout-workspace-grid]{grid-template-columns:var(--pme-layout-workspace-columns)!important}
    body:not([data-pme-layout-suspended])[data-pme-layout-minimal-topbar] .p-ia4_top_nav{box-sizing:border-box!important;padding-right:42px!important}
    body:not([data-pme-layout-suspended])[data-pme-layout-minimal-topbar] :is([data-qa="tab_rail_desktop"],.p-control_strip){box-sizing:border-box!important;width:0!important;min-width:0!important;max-width:0!important;padding:0!important;border:0!important;overflow:hidden!important;pointer-events:none!important}
    body:not([data-pme-layout-suspended])[data-pme-layout-minimal-topbar] :is(button[data-qa="account_switcher_team_icon"],button[data-qa="user-button"]){position:fixed!important;top:var(--pme-layout-topbar-top)!important;z-index:2147483000!important;width:28px!important;height:28px!important;min-width:28px!important;margin:0!important;padding:0!important;pointer-events:auto!important;-webkit-app-region:no-drag!important}
    body:not([data-pme-layout-suspended])[data-pme-layout-minimal-topbar] button[data-qa="account_switcher_team_icon"]{left:var(--pme-layout-topbar-team-left)!important;right:auto!important}
    body:not([data-pme-layout-suspended])[data-pme-layout-minimal-topbar] button[data-qa="user-button"]{left:auto!important;right:8px!important}
    body:not([data-pme-layout-suspended])[data-pme-layout-minimal-topbar] button[data-qa="account_switcher_team_icon"] [data-qa="team-icon"],body:not([data-pme-layout-suspended])[data-pme-layout-minimal-topbar] button[data-qa="user-button"] .c-avatar{width:28px!important;height:28px!important;min-width:28px!important;line-height:28px!important;font-size:14px!important;--avatar-image-size:28px!important}
    body:not([data-pme-layout-suspended])[data-pme-layout-minimal-topbar] button[data-qa="user-button"] .p-ia__nav__user__status_icon{display:none!important}
    [data-pme-layout-more]{position:fixed!important;z-index:2147483000!important;display:inline-flex!important;align-items:center;justify-content:center;width:28px!important;height:28px!important;min-width:28px!important;margin:0!important;padding:0!important;border:0;border-radius:6px;background:var(--sk_primary_background,#1f2228);color:inherit;font:700 18px/1 system-ui;cursor:pointer;pointer-events:auto!important;-webkit-app-region:no-drag!important;touch-action:manipulation;user-select:none}
    body[data-pme-layout-suspended] [data-pme-layout-more]{display:none!important}
    [data-pme-layout-more]:is(:hover,:focus-visible){background:#ffffff24;outline:none}
    [data-pme-layout-menu]{position:fixed;z-index:2147483647;min-width:220px;max-width:min(320px,calc(100vw - 16px));padding:6px;border:1px solid #ffffff2e;border-radius:9px;background:var(--pme-appearance-surface,#1d1c1d)!important;box-shadow:0 12px 35px #000c;color:var(--pme-appearance-on-surface,#fff)!important;opacity:1!important;backdrop-filter:none!important;font:14px/1.4 system-ui;pointer-events:auto!important;-webkit-app-region:no-drag!important;isolation:isolate}
    [data-pme-layout-menu] button{display:flex;align-items:center;width:100%;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
    [data-pme-layout-menu] button:is(:hover,:focus-visible){background:#ffffff18;outline:none}

  `;
  document.documentElement.append(style);

  function label(node){return String(node?.getAttribute?.('aria-label')||node?.getAttribute?.('data-qa')||node?.getAttribute?.('title')||node?.textContent||'').replace(/\s+/g,' ').trim().slice(0,120);}
  function overflowSource(node){if(node.closest('[data-qa="tab_rail_desktop"] [role="tablist"]'))return node.parentElement||node;if(node.matches('[data-qa="silent-sidebar-trigger"]'))return node.closest('.p-control_strip > *')||node;return node;}
  function overflowCandidates(){const result=[],include=key=>settings.railMode==='full'?settings[key]:!settings[key];for(const [key,qa] of Object.entries(railItems)){if(!include(key))continue;const node=document.querySelector(`button[data-qa="${qa}"]`);if(node)result.push(node);}for(const [key,selector] of [['railAgents','button[data-qa="tabs_item"]:has(svg[data-qa="ai-agents"])'],['railCreate','button[data-feat="control-strip:create"]'],['railFocus','button[data-qa="silent-sidebar-trigger"]']]){if(!include(key))continue;const node=document.querySelector(selector);if(node)result.push(node);}return [...new Set(result)];}
  function ensureMore(){if(more?.isConnected)return more;more=document.createElement('button');more.type='button';more.setAttribute('data-pme-layout-more','');more.setAttribute('aria-label','More Slack controls');more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded','false');more.title='More Slack controls';more.textContent='⋯';document.body.append(more);return more;}
  function clearTopBarPlacement(){if(!document.body)return;for(const name of ['--pme-layout-topbar-top','--pme-layout-topbar-team-left'])document.body.style.removeProperty(name);}
  function positionTopBar(){const history=['history_back_button','history_forward_button','history_menu_button'].map(qa=>document.querySelector(`[data-qa="${qa}"]`)).filter(Boolean).map(node=>node.getBoundingClientRect()).filter(rect=>rect.width>0&&rect.height>0).sort((a,b)=>a.left-b.left);const topNav=document.querySelector('.p-ia4_top_nav')?.getBoundingClientRect(),start=document.querySelector('.p-ia4_top_nav__left_container--start')?.getBoundingClientRect(),first=history[0],size=28,gap=6,teamLeft=Math.max(8,Math.round((start?.left??76)+6)),menuLeft=Math.max(teamLeft+size+gap,Math.floor(first?first.left-gap-size:(start?.right??topNav?.left??110))),top=Math.max(4,Math.round((first?.top??topNav?.top??0)+((first?.height??topNav?.height??40)-size)/2));document.body.style.setProperty('--pme-layout-topbar-top',`${top}px`);document.body.style.setProperty('--pme-layout-topbar-team-left',`${teamLeft}px`);if(more){const sidebar=settings.railMode!=='topbar'&&settings.hiddenRailPlacement==='sidebar'?document.querySelector('.p-ia4_sidebar_header__controls')?.getBoundingClientRect():null;more.style.left=`${sidebar?Math.max(8,Math.round(sidebar.left-34)):menuLeft}px`;more.style.top=`${sidebar?Math.max(4,Math.round(sidebar.top+(sidebar.height-size)/2)):top}px`;}}
  function gridTracks(value){const values=String(value||'').replace(/\[[^\]]*\]/g,' ').trim().split(/\s+/).filter(Boolean);return values.length&&values.every(value=>/^[\d.]+px$/.test(value))?values.map(Number.parseFloat):null;}
  function clearWorkspacePlacement(){for(const node of document.querySelectorAll('[data-pme-layout-workspace-grid]')){node.removeAttribute('data-pme-layout-workspace-grid');node.style.removeProperty('--pme-layout-workspace-columns');}for(const node of document.querySelectorAll('[data-pme-layout-thread-track]'))node.removeAttribute('data-pme-layout-thread-track');}
  function reclaimWorkspaceWidth(){
    clearWorkspacePlacement();if(document.body?.hasAttribute('data-pme-layout-suspended'))return;
    for(const panel of document.querySelectorAll('.p-client_workspace__tabpanel')){
      const rect=panel.getBoundingClientRect();if(!(rect.width>0&&rect.height>0))continue;
      const css=getComputedStyle(panel),tracks=gridTracks(css.gridTemplateColumns),thread=panel.querySelector('[data-qa="threads_flexpane"]');
      if(!tracks||tracks.length<2||!/grid/.test(css.display))continue;
      const template=tracks.map(width=>`${Math.round(width)}px`),columnGap=parseFloat(css.columnGap)||0;
      const unclaimed=rect.width-columnGap*(tracks.length-1)-tracks.reduce((sum,width)=>sum+width,0);
      let changed=false;
      if(settings.minimalTopBar&&unclaimed>=2){const flexible=thread?tracks.length-2:tracks.length-1;if(flexible>=0){template[flexible]='minmax(0,1fr)';changed=true;}}
      if(thread&&settings.threadPaneWidth){const natural=thread.getBoundingClientRect().width,available=tracks.at(-2)+tracks.at(-1),width=Math.max(320,Math.min(settings.threadPaneWidth,available-360));if(Number.isFinite(width)&&available>=680){template[tracks.length-2]='minmax(0,1fr)';template[tracks.length-1]=`${Math.round(width)}px`;for(let node=thread;node&&node!==panel;node=node.parentElement){if(Math.abs(node.getBoundingClientRect().width-natural)>1)break;const parentStyle=getComputedStyle(node.parentElement);node.setAttribute('data-pme-layout-thread-track',/flex/.test(parentStyle.display)&&!/^column/.test(parentStyle.flexDirection)?'row':'');}changed=true;}}
      if(changed){panel.style.setProperty('--pme-layout-workspace-columns',template.join(' '));panel.setAttribute('data-pme-layout-workspace-grid','');}
    }
  }
  function clearHeaderTabs(){for(const row of document.querySelectorAll('[data-pme-layout-header-tabs]')){row.removeAttribute('data-pme-layout-header-tabs');for(const name of ['--pme-layout-header-tabs-top','--pme-layout-header-tabs-left','--pme-layout-header-tabs-width','--pme-layout-header-tabs-height'])row.style.removeProperty(name);}}
  function positionHeaderTabs(){
    clearHeaderTabs();if(!settings.singleLineHeader||document.body?.hasAttribute('data-pme-layout-suspended'))return;
    for(const header of document.querySelectorAll('[data-qa="view_header"]')){
      const row=header.nextElementSibling,tablist=row?.querySelector?.('[role="tablist"]'),name=header.querySelector('[data-qa="channel_name_button"]'),actions=header.querySelector('.p-view_header__actions');if(!row||!tablist||!name||!actions)continue;
      const headerBox=header.getBoundingClientRect(),nameBox=name.getBoundingClientRect(),actionsBox=actions.getBoundingClientRect(),origin=row.getBoundingClientRect();if(headerBox.width<=0||origin.width<=0)continue;
      const left=Math.ceil(nameBox.right+12-origin.left),right=Math.floor(actionsBox.left-12-origin.left),width=right-left;if(width<120)continue;
      row.style.setProperty('--pme-layout-header-tabs-left',`${left}px`);row.style.setProperty('--pme-layout-header-tabs-top',`${Math.round(headerBox.top-origin.top)}px`);row.style.setProperty('--pme-layout-header-tabs-width',`${width}px`);row.style.setProperty('--pme-layout-header-tabs-height',`${Math.round(headerBox.height)}px`);row.setAttribute('data-pme-layout-header-tabs','');
    }
  }
  function syncOverflow(){for(const node of document.querySelectorAll('[data-pme-layout-overflow-source]'))node.removeAttribute('data-pme-layout-overflow-source');overflowTargets=overflowCandidates();if(settings.railMode==='full'&&!overflowTargets.length){more?.remove();more=null;closeMenu();clearTopBarPlacement();return;}for(const node of overflowTargets)overflowSource(node).setAttribute('data-pme-layout-overflow-source','');if(!overflowTargets.length||settings.railMore){more?.remove();more=null;closeMenu();positionTopBar();return;}ensureMore();positionTopBar();}
  function swallow(event){event.preventDefault();event.stopPropagation();}
  function toggleMenu(event){swallow(event);if(menu){closeMenu();return;}openMenu();}
  function openMenu(){if(!more||!overflowTargets.length)return;menu=document.createElement('div');menu.setAttribute('data-pme-layout-menu','');menu.setAttribute('role','menu');menu.setAttribute('aria-label','More Slack controls');for(const source of overflowTargets){if(!source.isConnected)continue;const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=label(source)||'Slack action';button.addEventListener('click',event=>{swallow(event);closeMenu();source.click();},{signal:abort.signal});menu.append(button);}if(!menu.childElementCount){menu=null;return;}document.body.append(menu);const rect=more.getBoundingClientRect(),width=menu.offsetWidth,height=menu.offsetHeight;menu.style.top=`${Math.max(8,Math.min(innerHeight-height-8,rect.bottom+6))}px`;menu.style.left=`${Math.max(8,Math.min(innerWidth-width-8,rect.left))}px`;more.setAttribute('aria-expanded','true');menu.querySelector('[role="menuitem"]')?.focus();}
  function closeMenu(returnFocus=false){menu?.remove();menu=null;more?.setAttribute('aria-expanded','false');if(returnFocus)more?.focus();}

  function resetToolbar(){if(activeToolbar){activeToolbar.style.removeProperty('transform');activeToolbar.removeAttribute('data-pme-layout-toolbar-follow');activeToolbar=null;}}
  function moveToolbar(){
    toolbarFrame=0;const move=toolbarPointer;if(!settings.toolbarFollowsPointer||!move||!(move.target instanceof Element)){resetToolbar();return;}
    if(activeToolbar?.querySelector('[aria-expanded="true"]'))return;
    const message=move.target.closest('[data-qa="message_container"]'),toolbar=message?.querySelector('.c-message_actions__container');if(!message||!toolbar||!toolbar.offsetParent){resetToolbar();return;}
    if(move.target.closest('.c-message_actions__container'))return;
    if(toolbar!==activeToolbar)resetToolbar();activeToolbar=toolbar;
    const row=message.getBoundingClientRect(),parent=toolbar.offsetParent.getBoundingClientRect(),natural=parent.left+toolbar.offsetLeft,width=toolbar.offsetWidth,left=Math.max(row.left+8,Math.min(move.x-width/2,row.right-width-8)),offset=Math.round(left-natural);
    toolbar.style.transform=`translateX(${offset}px)`;toolbar.setAttribute('data-pme-layout-toolbar-follow',String(offset));
  }
  function trackToolbar(event){if(!settings.toolbarFollowsPointer)return;toolbarPointer={x:event.clientX,target:event.target};if(!toolbarFrame)toolbarFrame=requestAnimationFrame(moveToolbar);}

  function applyBody(){const body=document.body;if(!body)return;const names={railDMs:'rail-dms',hideBackForward:'back-forward',minimalTopBar:'minimal-topbar'};for(const key of booleanKeys){const attr='data-pme-layout-'+(names[key]||key.replace(/[A-Z]/g,char=>'-'+char.toLowerCase()));body.toggleAttribute(attr,settings[key]===true);}body.toggleAttribute('data-pme-layout-suspended',['data-pme-native-reply','data-pme-quick','data-pme-switcher','data-pme-parking','data-pme-background-read'].some(attr=>body.hasAttribute(attr)));}
  function scan(){if(disposed||!document.body)return;applyBody();syncOverflow();reclaimWorkspaceWidth();positionHeaderTabs();if(!settings.toolbarFollowsPointer)resetToolbar();}
  function schedule(){if(scheduled||disposed)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;scan();});}

  document.addEventListener('click',event=>{if(menu&&!event.target.closest('[data-pme-layout-menu],[data-pme-layout-more]'))closeMenu();},{signal:abort.signal,capture:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu){event.stopPropagation();closeMenu(true);}},{signal:abort.signal,capture:true});
  window.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('[data-pme-layout-more]'))toggleMenu(event);},{signal:abort.signal,capture:true});
  document.addEventListener('pointerover',trackToolbar,{signal:abort.signal,capture:true,passive:true});
  document.addEventListener('pointermove',trackToolbar,{signal:abort.signal,capture:true,passive:true});
  document.addEventListener('pointerout',event=>{if(settings.toolbarFollowsPointer&&!event.relatedTarget&&!activeToolbar?.querySelector('[aria-expanded="true"]'))resetToolbar();},{signal:abort.signal,capture:true,passive:true});
  window.addEventListener('resize',schedule,{signal:abort.signal});
  const observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType!==1||!node.matches?.('[data-pme-layout-more],[data-pme-layout-menu]'))))schedule();});
  observer.observe(document.body,{childList:true,subtree:true});

  function configure(value={}){for(const key of booleanKeys)if(typeof value[key]==='boolean')settings[key]=value[key];if(['full','hidden','topbar'].includes(value.railMode))settings.railMode=value.railMode;else if(typeof value.minimalTopBar==='boolean')settings.railMode=value.minimalTopBar?'topbar':settings.railMode==='topbar'?'full':settings.railMode;if(['topbar','sidebar'].includes(value.hiddenRailPlacement))settings.hiddenRailPlacement=value.hiddenRailPlacement;settings.minimalTopBar=settings.railMode!=='full';if(Number.isInteger(value.threadPaneWidth)&&(value.threadPaneWidth===0||value.threadPaneWidth>=320&&value.threadPaneWidth<=900))settings.threadPaneWidth=value.threadPaneWidth;schedule();return {...settings};}
  function status(){return {settings:{...settings},rails:document.querySelectorAll('[data-qa="tab_rail_desktop"]').length,headers:document.querySelectorAll('[data-qa="view_header"]').length,overflowTargets:overflowTargets.length,suspended:document.body?.hasAttribute('data-pme-layout-suspended')===true};}
  function dispose(){if(disposed)return;disposed=true;observer.disconnect();abort.abort();if(toolbarFrame)cancelAnimationFrame(toolbarFrame);resetToolbar();closeMenu();more?.remove();style.remove();clearTopBarPlacement();clearWorkspacePlacement();clearHeaderTabs();for(const node of document.querySelectorAll('[data-pme-layout-overflow-source]'))node.removeAttribute('data-pme-layout-overflow-source');document.querySelectorAll('[data-pme-layout-more],[data-pme-layout-menu]').forEach(node=>node.remove());if(document.body)for(const attr of [...document.body.attributes].map(item=>item.name).filter(name=>name.startsWith('data-pme-layout-')))document.body.removeAttribute(attr);delete window.__PME_SLACK_LAYOUT__;}

  window.__PME_SLACK_LAYOUT__={version:'0.2.0',configure,status,dispose};
  scan();
})();
