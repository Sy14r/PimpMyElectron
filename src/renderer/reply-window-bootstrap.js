// Installed into a marked reply child before its first Slack navigation. This
// source does not navigate, fetch, inspect messages, or run in ordinary windows.
(()=>{
  'use strict';
  const match=String(window.name||'').match(/(?:^|,)frameId=pme-reply-([TE][A-Z0-9]+)-([CDG][A-Z0-9]+)-([^,]+)/);if(!match)return;
  const target={workspaceId:match[1],channelId:match[2]},token=match[3];
  window.__PME_REPLY_BOOTSTRAP__={prepared:token,target,active:location.origin==='https://app.slack.com'};
  if(location.origin!=='https://app.slack.com')return;
  const install=()=>{
    const root=document.documentElement;if(!root||root.hasAttribute('data-pme-reply-bootstrap'))return !!root;
    const style=document.createElement('style');style.id='pme-reply-bootstrap-style';
    style.textContent='html[data-pme-reply-bootstrap],html[data-pme-reply-bootstrap] body{background:#1a1d21!important}html[data-pme-reply-bootstrap] body>*{visibility:hidden!important}html[data-pme-reply-bootstrap] body::before{content:"Opening reply…";position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center;box-sizing:border-box;padding:32px;background:#1a1d21;color:#f8f8f8;text-align:center;font:650 18px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;visibility:visible!important;opacity:1!important;pointer-events:auto!important}html[data-pme-reply-bootstrap][data-pme-reply-delayed] body::before{content:"Still preparing this reply…"}html[data-pme-reply-window] body :is(.p-ia4_top_nav,[data-qa="tab_rail_desktop"],.p-control_strip,.p-view_contents--sidebar:has([data-qa="channel-sidebar"]),.p-ia4_client__resizer--sidebar,[data-pme-layout-more],[data-pme-layout-menu]){display:none!important}html[data-pme-reply-window] body .p-ia4_client{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-height:100vh!important;max-height:100vh!important;grid-template-rows:minmax(0,1fr)!important}html[data-pme-reply-window] body .p-client_workspace_wrapper{height:100%!important;min-height:0!important;max-height:none!important}html[data-pme-reply-window] body .p-view_contents--primary{height:100%!important;max-height:none!important;flex:1 1 auto!important}html[data-pme-reply-window] body :is(.p-client_workspace__tabpanel,.p-client_workspace_wrapper){grid-template-columns:0 minmax(0,1fr)!important}';
    root.setAttribute('data-pme-reply-window','');root.setAttribute('data-pme-reply-bootstrap','');root.append(style);return true;
  };
  if(!install()){
    const observer=new MutationObserver(()=>{if(install())observer.disconnect();});observer.observe(document,{childList:true,subtree:true});
  }
})();
