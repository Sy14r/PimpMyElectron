(()=>{
  'use strict';
  if(window.__PME_SLACK_APPEARANCE__||location.origin!=='https://app.slack.com')return;

  const STYLE_ID='pme-slack-appearance-style';
  const presets={
    midnight:{systemNavigation:'#151a28',selectedItems:'#5965d8',presenceIndication:'#53c98b',notifications:'#e45d7b'},
    ocean:{systemNavigation:'#103244',selectedItems:'#187f9b',presenceIndication:'#54c8aa',notifications:'#ff9d57'},
    forest:{systemNavigation:'#18372b',selectedItems:'#32795d',presenceIndication:'#83d5a5',notifications:'#ef6f61'},
    sandstone:{systemNavigation:'#3b302a',selectedItems:'#a9633e',presenceIndication:'#80aa78',notifications:'#df5e6c'},
    lavender:{systemNavigation:'#2d243b',selectedItems:'#8068c5',presenceIndication:'#79c99c',notifications:'#e16c9d'},
    aubergine:{systemNavigation:'#3f0e40',selectedItems:'#1264a3',presenceIndication:'#2eb67d',notifications:'#e01e5a'},
    graphite:{systemNavigation:'#232529',selectedItems:'#4f86c6',presenceIndication:'#63c174',notifications:'#e06c75'},
    sunrise:{systemNavigation:'#4a2925',selectedItems:'#c35f3d',presenceIndication:'#78b37b',notifications:'#e5a43b'},
  };
  const defaults={preset:'midnight',...presets.midnight,themeString:''};
  const colorKeys=['systemNavigation','selectedItems','presenceIndication','notifications'];
  let settings={...defaults},disposed=false;

  function validColor(value){return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);}
  function rgb(value){const hex=value.slice(1);return [0,2,4].map(index=>Number.parseInt(hex.slice(index,index+2),16));}
  function hex(channels){return '#'+channels.map(channel=>Math.max(0,Math.min(255,Math.round(channel))).toString(16).padStart(2,'0')).join('');}
  function mix(left,right,amount){const a=rgb(left),b=rgb(right);return hex(a.map((channel,index)=>channel+(b[index]-channel)*amount));}
  function luminance(value){return rgb(value).map(channel=>{const normalized=channel/255;return normalized<=.04045?normalized/12.92:((normalized+.055)/1.055)**2.4;}).reduce((sum,channel,index)=>sum+channel*[.2126,.7152,.0722][index],0);}
  function onColor(value){return luminance(value)>.38?'#17171a':'#ffffff';}
  function resolve(value=settings){return value.preset==='custom'?Object.fromEntries(colorKeys.map(key=>[key,value[key]])):{...(presets[value.preset]||presets.midnight)};}
  function render(){
    if(disposed)return;const colors=resolve(),onNavigation=onColor(colors.systemNavigation),onSelected=onColor(colors.selectedItems),onBadge=onColor(colors.notifications),surface=mix(colors.systemNavigation,onNavigation,.08),hover=mix(colors.systemNavigation,onNavigation,.15),composer=mix(colors.systemNavigation,onNavigation,.12),border=mix(colors.systemNavigation,onNavigation,.24),muted=mix(onNavigation,colors.systemNavigation,.48);
    let style=document.getElementById(STYLE_ID);if(!style){style=document.createElement('style');style.id=STYLE_ID;(document.head||document.documentElement).append(style);}
    style.textContent=`
      :root[data-pme-slack-appearance]{
        --pme-appearance-navigation:${colors.systemNavigation};--pme-appearance-surface:${surface};--pme-appearance-hover:${hover};--pme-appearance-composer:${composer};--pme-appearance-border:${border};--pme-appearance-muted:${muted};--pme-appearance-selected:${colors.selectedItems};--pme-appearance-presence:${colors.presenceIndication};--pme-appearance-notification:${colors.notifications};--pme-appearance-on-navigation:${onNavigation};--pme-appearance-on-surface:${onNavigation};--pme-appearance-on-selected:${onSelected};--pme-appearance-on-notification:${onBadge};
        --p-team_sidebar__nav-bg:${colors.systemNavigation}!important;--p-team_sidebar__text-color:${onNavigation}!important;--p-team_sidebar__badge:${colors.notifications}!important;--p-team_sidebar__badge-text-color:${onBadge}!important;--sk_presence_online:${colors.presenceIndication}!important;
      }
      html[data-pme-slack-appearance] body :is([data-qa="tab_rail_desktop"],.p-control_strip,.p-ia4_top_nav){background-color:var(--pme-appearance-navigation)!important;color:var(--pme-appearance-on-navigation)!important}
      html[data-pme-slack-appearance] body :is([data-qa="tab_rail_desktop"],.p-control_strip,.p-ia4_top_nav) :is(button,[role="button"]){color:inherit}
      html[data-pme-slack-appearance] body :is(.p-view_contents--sidebar,[data-qa="channel-sidebar"]){background-color:var(--pme-appearance-surface)!important;color:var(--pme-appearance-on-surface)!important}
      html[data-pme-slack-appearance] body [data-qa="channel-sidebar"] :is([aria-selected="true"],.p-channel_sidebar__channel--selected),
      html[data-pme-slack-appearance] body [data-qa="tab_rail_desktop"] [aria-selected="true"]{background-color:var(--pme-appearance-selected)!important;color:var(--pme-appearance-on-selected)!important}
      html[data-pme-slack-appearance] body [data-qa="channel-sidebar"] :is([data-qa="channel-sidebar-channel"],button):not([aria-selected="true"]):not(.p-channel_sidebar__channel--selected):hover{background-color:var(--pme-appearance-hover)!important}
      html[data-pme-slack-appearance] body [data-qa="channel-sidebar"] :is(.p-channel_sidebar__channel--unread,[data-qa-channel-sidebar-is-unread="true"]){color:var(--pme-appearance-on-surface)!important}
      html[data-pme-slack-appearance] body :is(.p-view_header,.p-channel_header,[data-qa="view_header"],[data-qa="channel_header"],.p-flexpane_header,.p-threads_flexpane__header):not([data-pme-native-reply-pane] *){background-color:var(--pme-appearance-surface)!important;color:var(--pme-appearance-on-surface)!important;border-color:var(--pme-appearance-border)!important;box-shadow:none!important}
      html[data-pme-slack-appearance] body :is(.p-view_contents--primary,[data-qa="threads_flexpane"]):not([data-pme-native-reply-pane] *) :is([role="tablist"],[class*="channel_tab_bar"]):not([data-pme-native-reply-pane] *){background-color:var(--pme-appearance-surface)!important;color:var(--pme-appearance-on-surface)!important;border-color:var(--pme-appearance-border)!important}
      html[data-pme-slack-appearance] body :is(.p-view_header,.p-channel_header,[data-qa="view_header"],[data-qa="channel_header"],.p-flexpane_header,.p-threads_flexpane__header):not([data-pme-native-reply-pane] *) :is(button,[role="button"],a){color:inherit}
      html[data-pme-slack-appearance] body :is(.p-view_header__actions,.p-channel_header__actions,.p-flexpane_header__primary,[data-qa="view_header"] [role="toolbar"]):not([data-pme-native-reply-pane] *){background:transparent!important;border-color:transparent!important;box-shadow:none!important}
      html[data-pme-slack-appearance] body :is(.p-view_header__actions,.p-channel_header__actions,.p-flexpane_header__primary):not([data-pme-native-reply-pane] *)::before,
      html[data-pme-slack-appearance] body :is(.p-view_header__actions,.p-channel_header__actions,.p-flexpane_header__primary):not([data-pme-native-reply-pane] *)::after{background:none!important;box-shadow:none!important}
      html[data-pme-slack-appearance] body :is(.p-view_header__actions,.p-channel_header__actions,.p-flexpane_header__primary,[data-qa="view_header"] [role="toolbar"]):not([data-pme-native-reply-pane] *) :is(button,[role="button"],[data-qa="control_button"],[data-qa="search_in_channel_button"],[data-qa="secondary-header-more"],[data-feat="view-header:more"]){background:transparent!important;border-color:transparent!important;box-shadow:none!important}
      html[data-pme-slack-appearance] body :is(.p-view_header__actions,.p-channel_header__actions,.p-flexpane_header__primary,[data-qa="view_header"] [role="toolbar"]):not([data-pme-native-reply-pane] *) :is(button,[role="button"]):is(:hover,:focus-visible,[aria-expanded="true"]){background:var(--pme-appearance-hover)!important}
      html[data-pme-slack-appearance] body :is(.p-message_pane__footer,.p-message_pane__input,.p-message_pane_input,.p-workspace__primary_view_footer,.p-threads_flexpane__footer,.p-composer_page__footer):not([data-pme-native-reply-pane] *){background:var(--pme-appearance-surface)!important;border-color:var(--pme-appearance-border)!important;box-shadow:none!important}
      html[data-pme-slack-appearance] body :is(.p-message_pane__footer,.p-message_pane__input,.p-message_pane_input,.p-workspace__primary_view_footer,.p-threads_flexpane__footer,.p-composer_page__footer):not([data-pme-native-reply-pane] *)::before,
      html[data-pme-slack-appearance] body :is(.p-message_pane__footer,.p-message_pane__input,.p-message_pane_input,.p-workspace__primary_view_footer,.p-threads_flexpane__footer,.p-composer_page__footer):not([data-pme-native-reply-pane] *)::after,
      html[data-pme-slack-appearance] body :is(.p-message_pane__input,.p-message_pane_input,.p-workspace__primary_view_footer,.p-threads_flexpane__footer,.p-composer_page__footer):not([data-pme-native-reply-pane] *) > div{background-color:var(--pme-appearance-surface)!important;border-color:var(--pme-appearance-border)!important}
      html[data-pme-slack-appearance] body :has(> [data-qa="message_input"]):not([data-pme-native-reply-pane] *){background-color:var(--pme-appearance-surface)!important;border-color:var(--pme-appearance-border)!important}
      html[data-pme-slack-appearance] body [data-qa="message_input"]:not([data-pme-native-reply-pane] *){box-sizing:border-box!important;margin-inline:auto!important;background:var(--pme-appearance-composer)!important;color:var(--pme-appearance-on-surface)!important;border-color:var(--pme-appearance-border)!important;box-shadow:none!important}
      html[data-pme-slack-appearance] body [data-qa="message_input"]:not([data-pme-native-reply-pane] *) :is(.c-texty_input_unstyled,[role="toolbar"],[contenteditable="true"]){background:transparent!important;color:inherit!important;border-color:var(--pme-appearance-border)!important}
      html[data-pme-slack-appearance] body [data-qa="message_input"]:not([data-pme-native-reply-pane] *) [data-qa="texty_input"].ql-blank::before{color:var(--pme-appearance-muted)!important}
      html[data-pme-slack-appearance] body [data-qa="message_input"]:not([data-pme-native-reply-pane] *) :is(button,[role="button"]){color:var(--pme-appearance-muted)!important}
      html[data-pme-slack-appearance] body [data-qa="message_input"]:not([data-pme-native-reply-pane] *):focus-within{border-color:var(--pme-appearance-selected)!important;box-shadow:0 0 0 1px var(--pme-appearance-selected)!important}
      html[data-pme-slack-appearance] body .c-presence--active,
      html[data-pme-slack-appearance] body .c-presence--active::before,
      html[data-pme-slack-appearance] body .c-presence--active::after{color:var(--pme-appearance-presence)!important;border-color:var(--pme-appearance-presence)!important}
      html[data-pme-slack-appearance] body :is(.p-channel_sidebar__badge,[data-qa="tab_rail_desktop"] [data-qa*="badge"]){background-color:var(--pme-appearance-notification)!important;color:var(--pme-appearance-on-notification)!important}
    `;
    document.documentElement.setAttribute('data-pme-slack-appearance',settings.preset);
  }
  function configure(value={}){
    if([...Object.keys(presets),'custom'].includes(value.preset))settings.preset=value.preset;
    for(const key of colorKeys)if(validColor(value[key]))settings[key]=value[key].toLowerCase();
    render();return {...settings,colors:resolve()};
  }
  function dispose(){if(disposed)return;disposed=true;document.getElementById(STYLE_ID)?.remove();document.documentElement.removeAttribute('data-pme-slack-appearance');delete window.__PME_SLACK_APPEARANCE__;}

  window.__PME_SLACK_APPEARANCE__={version:'0.4.0',configure,status:()=>({settings:{...settings},colors:resolve()}),dispose};
  render();
})();
