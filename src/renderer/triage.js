(function installTriage() {
  if (window.top !== window || location.origin !== 'https://app.slack.com') return;
  const team = () => location.pathname.match(/^\/client\/([TE][A-Z0-9]+)/)?.[1];
  if (!team() || window.__PME_TRIAGE__) return;
  if (!document.body) { document.addEventListener('DOMContentLoaded', installTriage, { once: true }); return; }
  const abort = new AbortController();
  let settings={edge:'right',rest:'strip',display:'main',inboxDensity:'expanded',idleSeconds:60},lastInteraction=Date.now(),displayInfo=[],displaySignature='',hoverTimer,hoverIntent=null;
  let compactBounds=null,cursorCheckPending=false,stagedDetail=false,pillIdleTimer,pillPointerInside=false;
  let pillPreview=null,nativeStripRequest=null,nativeStripHidden=false,stripSyncPending=false,stripSequence=0;
  let lastHostUpdate=0,hostDisconnected=false;
  const connected=()=>Date.now()-lastHostUpdate<7000;
  const restMode=()=>settings.rest||'strip';
  const host = document.createElement('div'); host.id = 'pme-live-triage';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host{font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#edf0f7;color-scheme:dark}
      *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button,input{color:inherit}
      button{border:0;background:transparent;border-radius:8px}button:not(.row):hover,:host(:not([data-inbox-input="keyboard"])) :where(.row:hover){background:#ffffff0e}
      button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #b7a8ec;outline-offset:2px}button:disabled{opacity:.4;cursor:default}
      [hidden]{display:none!important}#opener{position:fixed;right:18px;bottom:18px;pointer-events:auto;padding:10px 15px;background:#262337;border:1px solid #827097;border-radius:24px;box-shadow:0 4px 20px #0006;display:flex;gap:9px;align-items:center;font-weight:600}
      .signal{width:7px;height:7px;border-radius:50%;background:#99d3b9}.shell{pointer-events:auto;position:fixed;inset:0;background:#141925;display:flex;box-shadow:0 0 60px #0007}
      .shell,#edge-tab,#quick-card{-webkit-app-region:no-drag}
      .rail{width:44px;flex-shrink:0;background:#10141f;border-right:1px solid #ffffff0c;display:flex;flex-direction:column;align-items:center;gap:9px;padding:12px 0}.rail button{width:32px;height:32px;font-size:13px;background:#ffffff07;color:#a4adc0}.rail .brand{background:#b6a5e8;color:#20182b;font-weight:800}.spacer{flex:1}
      .queue{width:420px;max-width:100vw;flex-shrink:0;display:flex;flex-direction:column;padding:22px 16px 12px;border-right:1px solid #ffffff10;min-height:0}.eyebrow{font-size:10px;font-weight:600;letter-spacing:1.7px;color:#b3a4d5;text-transform:uppercase}h1{font-size:25px;line-height:1.2;letter-spacing:-.6px;margin:8px 0}
      .queue-heading{display:flex;align-items:center;gap:6px}.inbox-icon{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:5px;flex-shrink:0;color:#a4adc0;font-size:16px}.control-icon{display:block;width:20px;height:20px;flex-shrink:0;pointer-events:none}.slack-icon{width:18px;height:18px}.close-icon{width:18px;height:18px}#inbox-stock{color:#8792a6}#inbox-stock:hover{color:#c4cada}.rail #restore{display:flex;align-items:center;justify-content:center}.filter-row{display:flex;align-items:center;gap:4px}.filter-row .filters{flex:1}.shell:not(.cluster)>.rail{display:none}.queue-heading h1{min-width:0;flex:1;position:relative}#compose{padding:5px;background:#ab8cdd20;color:#d6c8ef;flex-shrink:0}#compose:hover{background:#ab8cdd35}#search{margin-top:12px;width:100%;border:1px solid #ffffff12;border-radius:8px;background:#ffffff05;padding:9px 11px;outline-offset:0;font-size:12px}#search::placeholder{color:#758196}
      .filters{display:flex;gap:4px;flex-wrap:wrap;margin:12px 0}.filters button{padding:5px 9px;font-size:11px;color:#94a2b8}.filters button[aria-pressed="true"]{color:#d0bdf5;background:#ab8cdd20}
      #alias-dialog{pointer-events:auto;-webkit-app-region:no-drag;width:min(360px,calc(100vw - 40px));box-sizing:border-box;padding:22px;border:1px solid #ffffff20;border-radius:14px;background:#191f2c;color:#edf0f7;box-shadow:0 20px 80px #0008;font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif}#alias-dialog::backdrop{background:#090d1680}#alias-dialog h2{font-size:17px;margin:0 0 5px}#alias-dialog p{color:#94a2b8;margin:0 0 16px;overflow-wrap:anywhere}#alias-dialog label{display:block;margin-bottom:5px}#alias-input{box-sizing:border-box;width:100%;padding:9px 10px;border:1px solid #ffffff25;border-radius:7px;background:#111723;color:#edf0f7;font:inherit}#alias-dialog .alias-hint{font-size:11px;margin:10px 0 16px}#alias-dialog #alias-error{color:#f4aaa9;font-size:12px;margin:0}.alias-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.alias-actions button{padding:7px 14px;background:#ffffff0b}#alias-save{background:#b6a1e929!important;color:#decfff}
      #list{overflow:auto;flex:1;min-height:60px;padding:2px;scrollbar-width:none}#list::-webkit-scrollbar{display:none}.row{display:block;width:100%;text-align:left;border:1px solid transparent;padding:12px 10px;margin-bottom:4px}.row:focus-visible{background:#a492d022;outline:2px solid #b7a8ec;outline-offset:-2px}.row.selected{background:#a492d017;border-color:#b6a1e940}.row-head{display:flex;gap:7px;align-items:center}.kind{color:#7787a0;font-size:15px;width:15px;flex-shrink:0}.name{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;flex:1}.unread{width:6px;height:6px;background:#bca9f0;border-radius:50%}.badge{font-size:10px;color:#c5b3ee}.preview{font-size:11.5px;line-height:1.5;color:#8796ae;margin:7px 0 0 22px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.meta{font-size:10px;color:#748299;margin:5px 0 0 22px}
      .list-toolbar{display:flex;align-items:center;gap:6px;margin-top:12px}.list-toolbar #search{margin-top:0;flex:1;min-width:0}.list-toolbar #density-picker{width:30px;height:32px;color:#8796ae;flex:none}
      #density-menu{position:fixed;inset:auto;margin:0;width:224px;padding:6px;background:#202735;color:#cdd4e4;border:1px solid #ffffff20;border-radius:10px;box-shadow:0 10px 30px #0007;pointer-events:auto;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #density-menu button{display:flex;align-items:center;gap:10px;width:100%;padding:9px;text-align:left;border-radius:7px}#density-menu button[aria-pressed="true"]{background:#ab8cdd20;color:#ddcff5}#density-menu button>span{display:flex;flex-direction:column;gap:2px;flex:1}#density-menu small{font-size:11px;color:#94a2b8}#density-menu strong{font-size:12px;font-weight:600}#density-menu .density-check{display:inline;width:12px;flex:none}
      .row-time,.row-workspace{display:none;font-size:10px;color:#748299;font-weight:400;white-space:nowrap}.row-workspace{max-width:80px;overflow:hidden;text-overflow:ellipsis}.row-time{flex:none;font-variant-numeric:tabular-nums}
      :host([data-density="cozy"]) .row{padding:8px 9px;margin-bottom:2px;border-radius:7px}
      :host([data-density="cozy"]) .preview{display:block;white-space:nowrap;text-overflow:ellipsis;margin-top:4px;line-height:17px}
      :host(:is([data-density="cozy"],[data-density="compact"])) .meta{display:none}
      :host(:is([data-density="cozy"],[data-density="compact"])) :is(.row-time,.row-workspace){display:block}
      :host([data-density="compact"]) .row{padding:6px 9px;margin-bottom:1px;min-height:34px;border-radius:6px}
      :host([data-density="compact"]) .preview{display:none}
      :host([data-density="compact"]) .row-head{min-height:20px;gap:6px}
      :host([data-density="compact"]) .name{font-size:12px}
      .empty{padding:24px 10px;color:#8796af;font-size:12px;line-height:1.6}#notice:empty{display:none}
      .reader{flex:1;min-width:0;display:flex;flex-direction:column;background:#191f2c}.reader-header{padding:22px 23px 16px;border-bottom:1px solid #ffffff0a}.reader-header h2{font-size:18px;margin:8px 0 4px;overflow-wrap:anywhere}#coverage{font-size:11px;color:#8494ab;line-height:1.6}.reader-header button{float:right;color:#94a2b8;padding:3px 7px}.messages{flex:1;overflow:auto;padding:8px 23px}.message{padding:17px 0;border-bottom:1px solid #ffffff07}.message-head{display:flex;align-items:baseline;gap:9px}.author{font-weight:650;font-size:12px;color:#cdd4e4}.time{color:#77869d;font-size:10px}.body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.65;color:#bcc6d8;margin-top:6px}.attachment{font-size:10px;color:#9a8eb5;margin-top:7px}.read-only{padding:12px 23px;border-top:1px solid #ffffff0c;color:#829690;font-size:11px;display:flex;gap:8px;align-items:center}#notice{font-size:11px;color:#dbbca1;margin-top:9px;white-space:normal}
      .triage-controls{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.triage-controls button{float:none;background:#ab8cdd20;color:#d6c8ef;padding:6px 9px;font-size:11px}.history-controls{display:flex;gap:8px;margin-top:12px}.reader-header .history-controls button{float:none;border:1px solid #ffffff18;padding:5px 10px;font-size:11px}#history-status{font-size:11px;color:#b5a6d5;margin-top:9px}.body a{color:#b8c7fa;text-decoration:underline}.body code,.body pre{background:#ffffff0a;border-radius:4px;padding:2px 4px;font-size:12px}.body pre{padding:10px;overflow:auto;white-space:pre-wrap}.mention{color:#c3b3ef}.thread-link{font-size:11px;margin-top:8px;padding:5px 8px;background:#ab8cdd16;color:#c5b3ee}
      #edge-tab{position:fixed;inset:0;pointer-events:auto;background:#18171c;border-radius:0;color:#d7ccef;padding:8px 1px;font-size:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;overflow:hidden;box-shadow:inset 0 0 0 1px #ffffff0c}#edge-tab:hover{background:#28232f;box-shadow:inset 0 0 0 1px #cbb5f133}
      :host([data-edge="left"]) #edge-tab,:host([data-edge="left"]) .shell.cluster{border-radius:0 12px 12px 0}:host([data-edge="right"]) #edge-tab,:host([data-edge="right"]) .shell.cluster{border-radius:12px 0 0 12px}
      #edge-dots{display:flex;flex-direction:column;align-items:center;gap:4px}.edge-dot{width:3px;height:3px;background:currentColor;border-radius:50%;flex:none}#edge-overflow{font-size:8px;writing-mode:vertical-rl;line-height:9px}#edge-tab.empty::after{content:'';width:2px;height:28px;border-radius:2px;background:#a69bae99}
      .shell.cluster{overflow:hidden;background:#18171c}.shell.cluster .rail{border:0;width:44px;padding:7px 0;gap:6px;background:#18171c}.shell.cluster #home,.shell.cluster #collapse,.shell.cluster .rail>.spacer{display:none}.shell:not(.cluster) #pill-items,.shell:not(.cluster) #pill-empty{display:none}.shell.cluster #pill-settings,.shell.cluster #pill-empty{display:flex;align-items:center;justify-content:center;flex-shrink:0;height:25px;width:30px;color:#a99bbb}.shell.cluster #restore{flex-shrink:0;height:25px;width:30px;margin-top:auto;font-size:12px;color:#a99bbb}
      #pill-items{display:flex;flex-direction:column;gap:6px;overflow:auto;min-height:0;padding:2px 4px;scrollbar-width:none}#pill-items::-webkit-scrollbar{display:none}#pill-items .pill-item{position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;min-height:32px;padding:0;background:hsl(var(--pill-hue) 26% 25%);border:1px solid hsl(var(--pill-hue) 25% 39%);border-radius:10px;color:#f1eafc;font-size:11px;font-weight:650}#pill-items .pill-item:hover,#pill-items .pill-item:focus-visible{background:hsl(var(--pill-hue) 28% 36%);border-color:#cebbf5}#pill-items .pill-kind{position:absolute;bottom:-1px;right:-1px;font-size:8px;line-height:11px;min-width:11px;border-radius:4px;background:#11131d;color:#cebdf4}#pill-empty{padding:0}#pill-empty:hover{background:#ffffff14}

      #workspace-picker{display:block;width:100%;min-width:0;background:transparent;color:inherit;border:0;border-radius:5px;padding:0;text-align:left;font:inherit;font-weight:inherit;letter-spacing:inherit;line-height:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#workspace-picker:hover{color:#d0bdf5}
      #workspace-dialog{position:fixed;inset:68px auto auto 16px;margin:0;width:320px;max-width:calc(100vw - 32px);max-height:calc(100vh - 90px);padding:12px;background:#202331;color:#edf0f7;border:1px solid #ffffff20;border-radius:12px;box-shadow:0 16px 48px #0008;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto}#workspace-dialog::backdrop{background:#0003}.workspace-dialog-heading{display:flex;align-items:center;justify-content:space-between;margin:0 0 7px;padding-left:8px}.workspace-dialog-heading h2{font-size:12px;font-weight:600;color:#aab2c4;margin:0}.workspace-dialog-heading button{width:28px;height:28px;font-size:18px;color:#aab2c4}#workspace-options{display:flex;flex-direction:column;gap:3px;max-height:calc(100vh - 160px);overflow:auto}.workspace-option{display:flex;align-items:center;gap:10px;min-height:38px;padding:8px;text-align:left;font-size:13px}.workspace-option[aria-pressed="true"]{background:#ab8cdd20;color:#d9c9f5}.workspace-option .workspace-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.workspace-check{width:15px;color:#c7b3ef}
      .activity-controls{display:flex;gap:6px;margin-top:10px}.activity-controls button{font-size:10px;color:#b5a6d5;padding:3px 5px}#activity-status{font-size:10px;color:#a3a1a9}
      .shell.reply{width:420px;right:auto}.reply-chrome{position:fixed;left:420px;right:0;top:0;height:144px;pointer-events:auto;background:#191f2c;border-bottom:1px solid #ffffff16;padding:12px 16px;color:#cdd4e4;display:flex;flex-direction:column;gap:5px}.reply-chrome strong{font-size:13px}.reply-chrome small{font-size:10px;color:#a3adc0}.reply-chrome nav{display:flex;gap:8px}.reply-chrome button{font-size:11px;padding:3px 7px;background:#ffffff0a}.reply-placeholder{position:fixed;left:420px;right:0;top:144px;bottom:0;pointer-events:auto;background:#191f2c;padding:24px;color:#a3adc0;font-size:13px}
      @media(max-width:650px){.shell.reply>.rail,.shell.reading>.rail{display:flex}.shell.reply{width:44px}.shell.reply .queue{display:none}.reply-chrome,.reply-placeholder{left:44px}}
      /* Cover native route changes with the pane's own background, rather than
         flashing a card. Only slow loads show a quiet label; errors keep actions. */
      .reply-placeholder:not([data-state="error"]){top:0;display:flex;align-items:center;justify-content:center}
      .reply-placeholder[data-state="ready"]{opacity:0;pointer-events:none}
      .reply-placeholder[data-state="loading"] span{animation:reply-loading-label 1ms step-end .3s both}
      @keyframes reply-loading-label{from{visibility:hidden}to{visibility:visible}}
      @media(prefers-reduced-motion:no-preference){.reply-placeholder[data-state="ready"]{transition:opacity .12s ease-out}}
      @media(prefers-reduced-motion:no-preference){.row{transition:background .12s}#edge-tab{transition:background .16s,box-shadow .16s}.shell.cluster .rail{animation:pill-reveal .18s ease-out}@keyframes pill-reveal{from{opacity:.5}to{opacity:1}}}@media(max-width:650px){.shell.reading .queue{display:none}.reader{width:calc(100vw - 44px)}}
      :host([data-detail-motion]) .shell.reply{width:420px!important;right:auto;z-index:2}
      :host([data-detail-motion]) .reply-chrome,:host([data-detail-motion]) .reply-placeholder{z-index:1}
      :host([data-detail-motion]) .shell .queue{display:flex!important;position:relative;z-index:2;background:#141925}
      :host([data-detail-motion]) .shell>.rail{display:none}
      :host([data-detail-motion]) .reader,:host([data-detail-motion]) .reply-chrome,:host([data-detail-motion]) .reply-placeholder{position:fixed;left:420px;right:auto;width:var(--pme-detail-width,400px);transform:translateX(calc(100vw - 420px - var(--pme-detail-width,400px)))}
      :host([data-detail-motion]) .reader{top:0;bottom:0;z-index:1}
      :host([data-quick]) .shell{display:none!important}
      #quick-card{pointer-events:auto;position:fixed;inset:0;background:#191f2c;color:#cdd4e4;padding:16px;border:1px solid #343c50;border-radius:12px;display:flex;flex-direction:column}
      #quick-card header{display:flex;align-items:start;gap:8px}#quick-card header>div{flex:1;min-width:0}#quick-title{font-size:14px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#quick-subtitle{display:block;font-size:11px;color:#94a2b8;margin-top:3px}#quick-close{color:#94a2b8;width:24px;height:24px;padding:0;font-size:20px}
      #quick-messages{overflow:auto;max-height:165px;margin-top:12px}#quick-messages article{margin-bottom:12px;font-size:12px}#quick-messages strong{color:#94a2b8;font-size:11px}#quick-messages p{margin:3px 0;white-space:pre-wrap;overflow-wrap:anywhere}
      #quick-card footer{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;margin-top:auto;color:#94a2b8}#quick-inbox{color:#94a2b8;font-size:11px;text-decoration:underline;white-space:nowrap;padding:4px}
    </style>
    <button id="edge-tab" hidden aria-label="Reveal triage" title="Reveal triage"><span id="edge-dots" aria-hidden="true"></span><span id="edge-overflow" hidden aria-hidden="true"></span></button>
    <button id="opener" aria-label="Open triage"><span class="signal"></span>Triage</button>
    <section class="shell" hidden aria-label="Slack triage">
      <nav class="rail" aria-label="Triage views"><button class="brand" id="home" aria-label="Show queue">T</button><button id="reply-latest" hidden aria-label="Jump to latest messages" title="Jump to latest messages">↓</button><div id="pill-items" aria-label="Unread conversations and threads"></div><button id="pill-empty" type="button" hidden aria-label="Open triage inbox" title="All caught up · Open triage inbox"><svg class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 4h16l2 10v6H2v-6L4 4Z"/><path d="M2 14h6l2 3h4l2-3h6"/></svg></button><div class="spacer"></div><button id="restore" aria-label="Return to normal Slack" title="Normal Slack"><svg class="control-icon slack-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><g transform="rotate(0 12 12)"><rect x="13" y="1" width="4.5" height="10" rx="2.25"/><rect x="7" y="1" width="4.5" height="4.5" rx="2.25"/></g><g transform="rotate(90 12 12)"><rect x="13" y="1" width="4.5" height="10" rx="2.25"/><rect x="7" y="1" width="4.5" height="4.5" rx="2.25"/></g><g transform="rotate(180 12 12)"><rect x="13" y="1" width="4.5" height="10" rx="2.25"/><rect x="7" y="1" width="4.5" height="4.5" rx="2.25"/></g><g transform="rotate(270 12 12)"><rect x="13" y="1" width="4.5" height="10" rx="2.25"/><rect x="7" y="1" width="4.5" height="4.5" rx="2.25"/></g></svg></button><button id="collapse" aria-label="Collapse to rail" title="Collapse">›</button></nav>
      <section class="queue"><div class="queue-heading"><h1><button id="workspace-picker" type="button" aria-label="Choose workspace" aria-haspopup="dialog" aria-expanded="false" aria-controls="workspace-dialog">Workspace</button></h1><button class="inbox-icon" id="inbox-activity" type="button" title="Activity" aria-label="Open Slack Activity"><svg class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button><button class="inbox-icon" id="inbox-switcher" type="button" title="Search Slack · ⌘K" aria-label="Search Slack" aria-keyshortcuts="Meta+K"><svg class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button><button class="inbox-icon" id="compose" type="button" title="Compose new message" aria-label="Compose new message" aria-keyshortcuts="n"><svg class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7"/><path d="m16 3 5 5M10 14l1-5 7-7a2.1 2.1 0 0 1 3 3l-7 7-4 2Z"/></svg></button><button class="inbox-icon" id="inbox-stock" title="Normal Slack" aria-label="Return to normal Slack"><svg class="control-icon slack-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><g transform="rotate(0 12 12)"><rect x="13" y="1" width="4.5" height="10" rx="2.25"/><rect x="7" y="1" width="4.5" height="4.5" rx="2.25"/></g><g transform="rotate(90 12 12)"><rect x="13" y="1" width="4.5" height="10" rx="2.25"/><rect x="7" y="1" width="4.5" height="4.5" rx="2.25"/></g><g transform="rotate(180 12 12)"><rect x="13" y="1" width="4.5" height="10" rx="2.25"/><rect x="7" y="1" width="4.5" height="4.5" rx="2.25"/></g><g transform="rotate(270 12 12)"><rect x="13" y="1" width="4.5" height="10" rx="2.25"/><rect x="7" y="1" width="4.5" height="4.5" rx="2.25"/></g></svg></button><button class="inbox-icon" id="inbox-collapse" title="Close inbox to pill" aria-label="Close inbox to pill"><svg class="control-icon close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17"/></svg></button></div><div class="list-toolbar"><input id="search" type="search" placeholder="Filter conversations…" aria-label="Filter observed conversations" autocomplete="off"><button id="density-picker" class="inbox-icon" type="button" aria-label="Inbox density" title="Inbox density" aria-haspopup="dialog" aria-expanded="false" aria-controls="density-menu"><svg class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/><path d="M4 8h10M4 15h10" opacity=".5"/></svg></button></div>
        <div class="activity-controls"><button id="activity-refresh">Refresh activity</button><button id="activity-more" hidden>More conversations</button></div><div id="activity-status" role="status"></div><div class="filter-row"><div class="filters" role="group" aria-label="Filter activity"><button data-filter="all" aria-pressed="true">All</button><button data-filter="unread" aria-pressed="false">Unread</button><button data-filter="mentions" aria-pressed="false">Mentions</button><button data-filter="dms" aria-pressed="false">DMs</button><button data-filter="threads" aria-pressed="false">Threads</button></div><button class="inbox-icon" id="inbox-next-unread" title="Next unread · ⌥⇧↓ (previous: ⌥⇧↑) · F6 switches focus" aria-label="Next unread in this inbox view" aria-keyshortcuts="Alt+Shift+ArrowDown"><svg class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h9v14H5M10 12h11m-4-4 4 4-4 4"/></svg></button><button class="inbox-icon" id="inbox-latest" hidden title="Jump to latest messages" aria-label="Jump to latest messages">↓</button><button class="inbox-icon" id="inbox-back" hidden title="Close conversation" aria-label="Close conversation and return to inbox">←</button></div><div id="list" aria-label="Observed conversations"></div>
        <div id="notice" role="status"></div>
      </section>
      <section class="reader" hidden aria-label="Captured messages"><div class="reader-header"><button id="back" aria-label="Back to queue">←</button><div class="eyebrow">Message reader</div><h2 id="conversation"></h2><div id="coverage"></div><div class="triage-controls"><button id="done" title="E · Save Done locally, then open the next item">Done →</button><button id="mark-read" title="Mark Slack read through the latest message loaded here. Does not change local Done.">Mark read</button><button id="later" title="L · Snooze locally, then open the next item">Later →</button><select id="snooze" aria-label="Snooze duration" style="background:#202735;color:inherit;border:1px solid #ffffff15;border-radius:5px"><option value="15">15 min</option><option value="60" selected>1 hour</option><option value="240">4 hours</option><option value="1440">24 hours</option></select><button id="pin" title="P · Toggle local pin">Pin</button><button id="reopen" hidden>Bring back</button><button id="undo" hidden>Undo</button></div><div id="mark-status" role="status" style="font-size:11px;color:#b5a6d5;margin-top:8px"></div><div class="history-controls"><button id="refresh">Refresh</button><button id="reply" title="Use Slack’s native editor. Opening the conversation may mark it read.">Native chat</button><button id="handoff" title="Open this conversation in ordinary Slack. Slack may mark it read.">Open in Slack ↗</button><button id="older" hidden>Load older</button></div><div id="history-status" role="status" aria-live="polite"></div></div><div class="messages" id="messages"></div><div class="read-only"><span class="signal"></span>Reading alone does not mark read. Done is local; Mark read updates Slack.</div></section>
    </section><section id="reply-chrome" class="reply-chrome" hidden aria-label="Native Slack conversation"><strong id="reply-destination"></strong><small id="reply-state"></small><nav><button id="reply-queue">← Queue</button><button id="reply-back">Read-only view</button><button id="reply-retry" hidden>Retry</button><button id="reply-stock">Normal Slack ↗</button><button id="reply-collapse">Collapse</button></nav></section><div id="reply-placeholder" class="reply-placeholder" hidden role="status"><span id="reply-placeholder-message"></span></div>`;
  const densityMenu=document.createElement('div');densityMenu.id='density-menu';densityMenu.setAttribute('popover','auto');densityMenu.setAttribute('role','dialog');densityMenu.setAttribute('aria-label','Inbox density');
  densityMenu.innerHTML=[['expanded','Expanded','Two-line previews'],['cozy','Cozy','One-line previews'],['compact','Compact','Names and status']].map(([value,label,hint])=>`<button type="button" data-density="${value}" aria-pressed="false"><span><strong>${label}</strong><small>${hint}</small></span><span class="density-check" aria-hidden="true"></span></button>`).join('');shadow.append(densityMenu);
  densityMenu.addEventListener('toggle',()=>{$('density-picker').setAttribute('aria-expanded',String(densityMenu.matches(':popover-open')));},{signal:abort.signal});
  function closeDensityPicker(){if(densityMenu.matches(':popover-open'))densityMenu.hidePopover();$('density-picker').focus({preventScroll:true});}
  function showDensityPicker(){
    if(densityMenu.matches(':popover-open')){closeDensityPicker();return;}
    const bounds=$('density-picker').getBoundingClientRect();densityMenu.style.left=`${Math.max(8,Math.min(innerWidth-232,bounds.right-224))}px`;densityMenu.style.top=`${bounds.bottom+6}px`;
    densityMenu.showPopover();densityMenu.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
  }
  function densityKey(event){
    if(!densityMenu.matches(':popover-open'))return false;
    event.stopImmediatePropagation();
    if(event.key==='Escape'){event.preventDefault();closeDensityPicker();}
    else if(['ArrowDown','ArrowUp','Home','End','Tab'].includes(event.key)){
      event.preventDefault();const choices=[...densityMenu.querySelectorAll('button')],index=choices.indexOf(shadow.activeElement),delta=event.key==='ArrowUp'||event.key==='Tab'&&event.shiftKey?-1:1;
      choices[event.key==='Home'?0:event.key==='End'?choices.length-1:(index+delta+choices.length)%choices.length]?.focus();
    }
    return true;
  }
  const workspaceDialog=document.createElement('dialog');workspaceDialog.id='workspace-dialog';workspaceDialog.setAttribute('aria-labelledby','workspace-dialog-title');
  workspaceDialog.innerHTML='<div class="workspace-dialog-heading"><h2 id="workspace-dialog-title">Workspaces</h2><button id="workspace-close" type="button" aria-label="Close workspace picker">×</button></div><div id="workspace-options"></div>';
  shadow.append(workspaceDialog);
  const aliasDialog=document.createElement('dialog');aliasDialog.id='alias-dialog';aliasDialog.setAttribute('aria-labelledby','alias-heading');
  aliasDialog.innerHTML='<form><h2 id="alias-heading">Name this thread</h2><p id="alias-context"></p><label for="alias-input">Personal name</label><input id="alias-input" maxlength="120" autocomplete="off" placeholder="e.g. Launch blockers"><p class="alias-hint">Only in triage on this Mac. Leave blank to use the original label.</p><p id="alias-error" role="status"></p><div class="alias-actions"><button type="button" id="alias-cancel">Cancel</button><button type="submit" id="alias-save">Save</button></div></form>';
  shadow.append(aliasDialog);let aliasEditing=null,aliasRequest=null,aliasFocus=null;
  function threadAlias(key){return snapshot.workspaces.find(w=>key?.startsWith(w.id+':'))?.threadAliases?.[key]||items().find(i=>i.key===key)?.triage?.alias||'';}
  const displayName=item=>threadAlias(item?.key)||item?.triage?.alias||item?.name||'';
  function closeAlias(){aliasDialog.close();aliasEditing=null;aliasRequest=null;if(aliasFocus?.isConnected)aliasFocus.focus({preventScroll:true});aliasFocus=null;}
  function showAlias(target){
    if(!connected()||aliasDialog.open||!target?.threadTs||!target.key)return;
    aliasEditing={key:target.key,workspaceId:target.workspaceId};aliasFocus=document.activeElement===host?shadow.activeElement:document.activeElement;
    $('alias-context').textContent=[snapshot.workspaceDirectory?.find(w=>w.id===target.workspaceId)?.name,target.name].filter(Boolean).join(' · ');
    $('alias-input').value=threadAlias(target.key);$('alias-error').textContent='';$('alias-save').disabled=false;
    aliasDialog.showModal();$('alias-input').focus();$('alias-input').select();
  }
  aliasDialog.addEventListener('cancel',event=>{event.preventDefault();closeAlias();},{signal:abort.signal});
  aliasDialog.addEventListener('keydown',event=>{event.stopImmediatePropagation();},{signal:abort.signal});
  aliasDialog.querySelector('form').addEventListener('submit',event=>{
    event.preventDefault();if(!aliasEditing||aliasRequest||!connected())return;
    const alias=$('alias-input').value.trim();if(/[\u0000-\u001f\u007f]/.test(alias)){$('alias-error').textContent='Use a single-line name.';return;}
    aliasRequest=`alias-${Date.now().toString(36)}-${++actionSequence}`;$('alias-save').disabled=true;
    window.__pmeTriageAction?.(JSON.stringify({...aliasEditing,action:'alias',alias,requestId:aliasRequest}));
  },{signal:abort.signal});
  aliasDialog.querySelector('#alias-cancel').addEventListener('click',closeAlias,{signal:abort.signal});
  function acceptAliasResult(){
    if(!aliasRequest||snapshot.actionResult?.requestId!==aliasRequest)return;
    if(snapshot.actionResult.ok)closeAlias();else {aliasRequest=null;$('alias-save').disabled=false;$('alias-error').textContent='Could not save the name. Try again.';}
  }
  window.addEventListener('pme-thread-alias',event=>{const reply=window.__PME_REPLY__?.status();if(mode==='reply'&&reply?.ready&&!reply.auxiliary&&event.detail?.key===reply.target?.key)showAlias(reply.target);},{signal:abort.signal});
  let workspacePickerPurpose='switch';
  document.body.append(host);
  const $ = id => shadow.getElementById(id);
  const settingsIcon='<svg class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 3-.6 2.2-2 .9-2-.6-2.1 3.6 1.5 1.6v2.6l-1.5 1.6 2.1 3.6 2-.6 2 .9L9 21h6l.6-2.2 2-.9 2 .6 2.1-3.6-1.5-1.6v-2.6l1.5-1.6-2.1-3.6-2 .6-2-.9L15 3Z"/><circle cx="12" cy="12" r="3"/></svg>';
  for(const id of ['inbox-settings','pill-settings']){
    const button=document.createElement('button');button.id=id;button.type='button';button.className='inbox-icon';button.title='Settings';button.setAttribute('aria-label','Open triage settings');button.innerHTML=settingsIcon;
    if(id==='inbox-settings')$('inbox-collapse').before(button);else $('restore').after(button);
  }

  let snapshot = { workspaces: [] }, mode = 'stock', edge = 'right', filter = 'all', selection = null;
  let resumeReply=false,openSequence=0,openingKey=null,heldRow=null,quickReply=null,pillReadPending=null,pillReadRun=0;
  const detailMode=()=>['reading','reply'].includes(mode);
  let original = null, disposed = false, nativeQueue = Promise.resolve(), previousFocus = null, spacesApplied = false;
  const viewKey='__pme_triage_view_v1';
  try{const view=JSON.parse(sessionStorage.getItem(viewKey)||'{}');resumeReply=view.resumeReply===true;if(typeof view.selection==='string')selection=view.selection;if(['all','unread','dms','threads','mentions'].includes(view.filter))filter=view.filter;}catch{}
  const layoutKey = '__pme_triage_layout_v1';
  let savedLayout = null;
  try { savedLayout = JSON.parse(sessionStorage.getItem(layoutKey)); } catch {}
  if (savedLayout?.original?.bounds && Array.isArray(savedLayout.original.min) &&
      ['hidden','strip','cluster','queue','reading','reply'].includes(savedLayout.mode)) {
    original = savedLayout.original; edge = savedLayout.edge === 'left' ? 'left' : 'right';
  } else savedLayout = null;
  let lastObservation = '', lastPublished = 0, domTimer, idle;
  let domHealth = { sidebarRows: 0, messageRows: 0 };
  const viewTeam=()=>snapshot.selectedWorkspace||team();
  const items = () => snapshot.workspaces.flatMap(w => w.items || []);
  const filtered = () => items().filter(item => {
    const query = $('search').value.trim().toLocaleLowerCase();
    return (!query || `${displayName(item)} ${item.name}`.toLocaleLowerCase().includes(query)) &&
      (filter === 'mentions' && (item.mentions>0||item.mentionObserved===true) || filter === 'all' || filter === 'unread' && (inboxUnread(item) || heldRow?.key===item.key&&heldRow.filter===filter&&item.triage?.state==='active') || filter === 'dms' && ['dm','groupDM'].includes(item.kind) || filter === 'threads' && item.kind === 'thread');
  }).sort((a,b)=>Number(b.triage?.pinned)-Number(a.triage?.pinned));
  const el = (tag, className, content) => { const node = document.createElement(tag); if (className) node.className = className; if (content != null) node.textContent = content; return node; };
  const time = ts => { const date = new Date(Number(ts) * 1000); return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; };
  let readerSignature = '', readerSelection = null, olderAnchor = null;
  const loadErrors={not_authed:'Slack sign-in is unavailable. Reconnect in Normal Slack.',invalid_auth:'Slack sign-in has expired.',
    token_revoked:'Slack sign-in has expired.',missing_scope:'Slack did not allow this history read.',not_in_channel:'This conversation is not accessible.',
    channel_not_found:'This conversation is not accessible.',thread_not_found:'This thread is no longer available.',
    timeout:'Loading timed out. Retry when ready.',workspace_changed:'The workspace changed. Reopen the conversation.',
    ratelimited:'Slack is rate limiting reads. Wait before retrying.',invalid_cursor:'This page expired. Refresh to start again.'};
  function requestHistory(action='open') {
    const item=items().find(i=>i.key===selection);if(!item||!connected()||!snapshot.customReadsAvailable)return;
    if(typeof window.__pmeLoadHistory!=='function'){$('history-status').textContent='Reader connection unavailable. Reload the mod to reconnect.';return;}
    if(action==='older')olderAnchor={key:selection,height:$('messages').scrollHeight,top:$('messages').scrollTop,thread:!!item.threadTs};
    window.__pmeLoadHistory(JSON.stringify({workspaceId:item.workspaceId,key:item.key,action}));
  }
  async function handoff(){const item=items().find(i=>i.key===selection);if(!item||!/^[CDG][A-Z0-9]+$/.test(item.channelId))return;
    const row=item.workspaceId===team()?[...document.querySelectorAll('[data-qa="channel-sidebar-channel"]')].find(r=>r.getAttribute('data-qa-channel-sidebar-channel-id')===item.channelId):null;
    await transition('stock');if(row)row.click();else location.assign(`https://app.slack.com/client/${item.workspaceId}/${item.channelId}`);
  }
  let pendingMark=null;
  function markRead(){
    const item=items().find(i=>i.key===selection),ts=item?.messages.at(-1)?.ts;
    if(!item||item.threadTs||!ts||$('mark-read').disabled||!connected())return;
    pendingMark={key:item.key,ts,at:Date.now()};render();
    window.__pmeTriageAction?.(JSON.stringify({workspaceId:item.workspaceId,key:item.key,action:'mark-read',ts}));
  }
  let pendingLocal=null,actionSequence=0;
  function localAction(action){
    const item=items().find(i=>i.key===(action==='undo'?snapshot.undoKey||selection:selection));if(!connected()||!item||pendingLocal||typeof window.__pmeTriageAction!=='function')return;
    const rows=filtered(),index=rows.findIndex(i=>i.key===item.key),requestId=`${Date.now().toString(36)}-${++actionSequence}`;
    pendingLocal={requestId,key:item.key,selection,action,detail:mode,advance:detailMode()&&['done','later'].includes(action),candidates:rows.slice(index+1).map(i=>i.key)};
    window.__pmeTriageAction(JSON.stringify({workspaceId:item.workspaceId,key:item.key,action,requestId,...(action==='later'?{minutes:Number($('snooze').value)}:{})}));render();
  }
  function acceptLocalResult(){
    const result=snapshot.actionResult;if(!pendingLocal||result?.requestId!==pendingLocal.requestId)return;
    const completed=pendingLocal;pendingLocal=null;
    if(!result.ok){$('notice').textContent=snapshot.localError||'Could not save that decision. Your place is unchanged.';return;}
    if(completed.action==='undo'&&detailMode()&&selection===completed.selection){openItem(completed.key,{reader:mode==='reading'});return;}
    if(completed.advance&&selection===completed.key&&mode===completed.detail){
      const visible=new Set(filtered().map(i=>i.key)),next=completed.candidates.find(k=>visible.has(k));
      if(next)openItem(next,{reader:mode==='reading'});else {void transition('queue');$('notice').textContent='Saved · end of this queue.';}
    }
  }
  async function startReply(item=items().find(i=>i.key===selection)||window.__PME_REPLY__?.status().target,{quick=null,focusAfter='composer',nativeNavigate=null,preservePosition=false}={}){
    if(!item)return;
    if(!window.__PME_REPLY__){openReader(item.key);$('notice').textContent='Native chat is unavailable · opened the read-only view.';return;}
    const run=++openSequence;
    await nativeQueue.catch(()=>{});if(run!==openSequence||disposed)return;
    const reuseLayout=mode==='reply'&&!!quickReply===!!quick&&!stagedDetail;
    quickReply=quick;
    const stage=mode==='queue'&&!quickReply;
    heldRow=filtered().some(i=>i.key===item.key)?{key:item.key,filter}:null;
    selection=item.key;resumeReply=false;openingKey=item.key;
    // Mask and cancel the previous editor before waiting for window geometry.
    window.__PME_REPLY__.suspend();
    const destination={...item,workspaceName:item.workspaceName||snapshot.workspaceDirectory?.find(w=>w.id===item.workspaceId)?.name||item.workspaceId};
    await transition('reply',{stage,reuseLayout});if(run!==openSequence||mode!=='reply'||disposed)return;
    openingKey=null;
    // Reveal the loading pane immediately; Slack can finish mounting while it
    // slides out. Keep focus in the inbox until both operations have finished.
    const opening=window.__PME_REPLY__?.open(destination,{focusEditor:!stage&&!quickReply?.readOnly&&focusAfter==='composer',nativeNavigate,preservePosition});
    if(stage)await Promise.all([opening,transition('reply')]);else await opening;
    if(run!==openSequence||disposed||mode!=='reply')return;
    if(stage&&focusAfter==='composer')window.__PME_REPLY__?.focus();
    render();
    if(focusAfter==='messages')window.__PME_REPLY__?.focusMessages();
  }
  function startCompose(chosenWorkspace=null){
    if(!connected()||$('compose').disabled)return;
    if(viewTeam()==='*'&&!chosenWorkspace){openWorkspacePicker('compose');return;}
    const workspaceId=chosenWorkspace||viewTeam();
    if(!snapshot.workspaceDirectory?.some(w=>w.id===workspaceId&&w.connected))return;
    return startReply({kind:'compose',workspaceId,key:`${workspaceId}:compose`,name:'New message'});
  }
  function startActivity(chosenWorkspace=null){
    if(!connected())return;
    if(viewTeam()==='*'&&!chosenWorkspace){openWorkspacePicker('activity');return;}
    const workspaceId=chosenWorkspace||viewTeam();
    if(!snapshot.workspaceDirectory?.some(w=>w.id===workspaceId&&w.connected))return;
    if(workspaceId)return startReply({kind:'activity',workspaceId,key:`${workspaceId}:activity`,name:'Activity'},{focusAfter:'messages'});
  }
  function renderReply(){
    const reply=window.__PME_REPLY__?.status(),ready=!openingKey&&reply?.ready===true&&reply.target?.key===selection;
    const controls=shadow.querySelector('.triage-controls'),container=mode==='reply'?$('reply-chrome'):shadow.querySelector('.reader-header');
    if(controls.parentElement!==container){if(mode==='reply')container.append(controls);else container.insertBefore(controls,$('mark-status'));}
    $('mark-read').hidden=mode==='reply';
    $('reply-latest').hidden=mode!=='reply'||!ready||!!reply?.auxiliary||['compose','search','activity'].includes(reply?.target?.kind);
    $('inbox-latest').hidden=$('reply-latest').hidden;
    $('inbox-back').hidden=!detailMode();
    $('inbox-back').title=reply?.target?.kind==='activity'?'Close Activity':reply?.target?.kind==='search'?'Close search results':'Close conversation';
    $('inbox-back').setAttribute('aria-label',reply?.target?.kind==='activity'?'Close Activity and return to inbox':reply?.target?.kind==='search'?'Close search results and return to inbox':'Close conversation and return to inbox');
    $('reply-back').hidden=['compose','search','activity'].includes(reply?.target?.kind);
    controls.hidden=mode==='reply'&&['compose','search','activity'].includes(reply?.target?.kind);
    const failed=!openingKey&&!ready&&reply?.state!=='loading';
    $('reply-chrome').hidden=mode!=='reply'||!failed||!!quickReply;
    const cover=$('reply-placeholder');cover.hidden=mode!=='reply'||!!quickReply;
    cover.dataset.state=ready?'ready':failed?'error':'loading';
    cover.setAttribute('aria-hidden',String(ready||cover.hidden));
    const destination=openingKey?items().find(i=>i.key===openingKey):reply?.target;
    $('reply-destination').textContent=destination?`${destination.workspaceName||snapshot.workspaceDirectory?.find(w=>w.id===destination.workspaceId)?.name||destination.workspaceId} · ${destination.name}${destination.threadTs?' · Thread':''}`:'Native Slack conversation';
    $('reply-state').textContent=openingKey?'Opening native conversation…':ready?'Slack’s editor · ⌘⇧Y collapses and keeps your draft':reply?.reason||'Native reply is unavailable.';
    $('reply-placeholder-message').textContent=ready?'':failed?(reply?.state==='error'?reply.reason:'The conversation changed. Retry or choose another inbox item.'):'Loading conversation…';
    $('reply-retry').hidden=!failed;renderQuick(reply,ready);
  }
  const quickCard=document.createElement('section');quickCard.id='quick-card';quickCard.hidden=true;
  quickCard.innerHTML='<header><div><strong id="quick-title"></strong><small id="quick-subtitle"></small></div><button id="quick-close" aria-label="Close quick reply" title="Close">×</button></header><footer><span id="quick-status" role="status"></span><button id="quick-inbox">Open inbox</button></footer>';
  shadow.append(quickCard);
  function renderQuick(reply,ready){
    quickCard.hidden=mode!=='reply'||!quickReply;if(quickCard.hidden)return;
    $('quick-title').textContent=quickReply.preview.title;$('quick-subtitle').textContent=quickReply.preview.subtitle;
    $('quick-status').textContent=ready?'':reply?.reason||'Opening Slack’s conversation…';
    if(reply?.send?.confirmed)$('quick-status').textContent='Sent';
  }
  function paintPillDismissal(){
    // Native navigation can synchronously render a large Slack tree. Give the
    // removed badge a paint first; background frame throttling must not stall read.
    return new Promise(resolve=>{
      let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve();};
      const timer=setTimeout(finish,100);
      requestAnimationFrame(()=>requestAnimationFrame(finish));
    });
  }
  async function readFromPill(request,{inbox=false,unread=false,resolveUnknown=false}={}){
    const readMode=inbox?'queue':'cluster',source=inbox?items:notificationItems,paint=inbox?render:renderPill;
    if(mode!==readMode||!connected()||pillReadPending||!window.__PME_REPLY__||unread&&!inbox)return {ok:false};
    const item=source().find(i=>i.key===request?.key&&(i.unread===!unread||inbox&&resolveUnknown));
    if(!item)return {ok:false};
    // The cache check may reach the host while the detail pane closes. If it
    // already confirms our intended state, no native navigation is necessary.
    if(inbox&&resolveUnknown&&item.unread===unread)return {ok:true};
    const run=++pillReadRun;pillReadPending={key:item.key,latest:Number(item.latest)||0,unread};paint();schedulePillCollapse();
    document.body.setAttribute('data-pme-background-read','');
    try{
      await paintPillDismissal();
      if(run!==pillReadRun||disposed)return {cancelled:true};
      const opened=await window.__PME_REPLY__.open(item,{focusEditor:false});
      if(run!==pillReadRun||disposed)return {cancelled:true};
      if(!opened?.ok)return {ok:false};
      if(unread){
        const result=window.__PME_REPLY__.markUnreadNative?.();
        if(!result?.ok)return {ok:false,error:result?.error||'unavailable'};
        await window.__PME_REPLY__.park?.();
      }else window.__PME_REPLY__.markReadNative();
      const deadline=Date.now()+8000;
      while(run===pillReadRun&&mode===readMode&&Date.now()<deadline){
        if(source().find(i=>i.key===item.key)?.unread===unread)return {ok:true};
        await new Promise(resolve=>setTimeout(resolve,200));
      }
      return run!==pillReadRun?{cancelled:true}:{ok:false};
    }finally{
      if(run===pillReadRun){window.__PME_REPLY__?.suspend();const parked=await window.__PME_REPLY__?.park?.();if(run===pillReadRun){if(parked?.ok===false)$('notice').textContent=parked.error;pillReadPending=null;document.body.removeAttribute('data-pme-background-read');paint();touch();}}
    }
  }
  function quick(request){
    if(mode!=='cluster'||!connected()||!['reply','inbox'].includes(request?.action))return {ok:false};
    const item=notificationItems().find(i=>i.key===request.target?.key&&i.unread===true);
    if(!item)return {ok:false};
    if(request.action==='inbox')openItem(item.key);
    else void startReply(item,{quick:{preview:request.preview,at:Date.now()}});
    return {ok:true};
  }
  window.addEventListener('pme-native-quick-confirmed',event=>{
    if(mode==='reply'&&quickReply&&event.detail?.key===window.__PME_REPLY__?.status().target?.key)dismissRepliedItem(event.detail);
  },{signal:abort.signal});
  window.addEventListener('pme-native-quick-sent',()=>{if(mode==='reply'&&quickReply)void transition('cluster');},{signal:abort.signal});
  window.addEventListener('pme-native-compose-closed',()=>{if(mode==='reply')void transition('queue');},{signal:abort.signal});
  async function nativeHeaderAction(event){
    const reply=window.__PME_REPLY__?.status();
    if(mode!=='reply'||!reply?.ready)return;
    const action=event.detail?.action;if(!['stock','queue','conversation'].includes(action))return;
    if(action==='conversation'){
      const target=reply.target;if(!target?.threadTs||reply.auxiliary)return;
      const key=`${target.workspaceId}:${target.channelId}:`;
      const parent=items().find(item=>item.key===key)||notificationItems().find(item=>item.key===key);
      await startReply(parent||{workspaceId:target.workspaceId,channelId:target.channelId,workspaceName:target.workspaceName,name:target.name,key,threadTs:null});
      return;
    }
    const editor=action==='stock'?document.querySelector('[data-pme-native-reply-pane] [data-qa="texty_input"][contenteditable="true"]'):null;
    // Keep Slack's mounted destination and draft. Do not navigate to its parent
    // channel or invoke the native Close button when restoring the full window.
    await transition(action==='queue'&&quickReply?'cluster':action);
    if(action==='stock'&&mode==='stock'&&editor?.isConnected)editor.focus({preventScroll:true});
  }
  window.addEventListener('pme-native-header-action',nativeHeaderAction,{signal:abort.signal});
  async function nativeThreadAction(event){
    const reply=window.__PME_REPLY__?.status(),target=reply?.target,threadTs=event.detail?.threadTs;
    if(mode!=='reply'||!reply?.ready||reply.auxiliary||!target||target.kind==='compose'||target.threadTs||
      event.detail?.sourceKey!==target.key||!/^\d+\.\d+$/.test(threadTs||''))return;
    const key=`${target.workspaceId}:${target.channelId}:${threadTs}`;
    const cached=items().find(item=>item.key===key)||notificationItems().find(item=>item.key===key);
    await startReply(cached||{...target,key,threadTs,messageTs:null});
  }
  window.addEventListener('pme-native-thread-action',nativeThreadAction,{signal:abort.signal});
  async function nativeLinkAction(event){
    const reply=window.__PME_REPLY__?.status(),request=event.detail,destination=request?.destination;
    if(mode!=='reply'||!reply?.ready||request?.sourceKey!==reply.target?.key||typeof request.navigate!=='function'||
      !destination||!/^[TE][A-Z0-9]+$/.test(destination.workspaceId)||!/^[CDG][A-Z0-9]+$/.test(destination.channelId)||
      destination.threadTs&&!/^\d+\.\d+$/.test(destination.threadTs))return;
    const key=`${destination.workspaceId}:${destination.channelId}:${destination.threadTs||''}`;
    const cached=items().find(item=>item.key===key)||notificationItems().find(item=>item.key===key);
    const parent=items().find(item=>item.workspaceId===destination.workspaceId&&item.channelId===destination.channelId&&!item.threadTs);
    const known=cached||parent;
    await startReply({...known,...destination,key,name:known?.name||destination.channelId},{nativeNavigate:known?null:request.navigate,preservePosition:true,focusAfter:'messages'});
  }
  window.addEventListener('pme-native-link-action',nativeLinkAction,{signal:abort.signal});
  async function openNativeSwitcher(){
    if(densityMenu.matches(':popover-open'))closeDensityPicker();
    if(!connected()||mode==='stock'||workspaceDialog.open||!window.__PME_REPLY__?.openSwitcher)return;
    if(['strip','cluster','hidden'].includes(mode)||quickReply)await transition('queue');
    const workspaceId=mode==='reply'?window.__PME_REPLY__.status().target?.workspaceId:viewTeam()==='*'?team():viewTeam();
    if(!await window.__PME_REPLY__.openSwitcher(workspaceId))$('notice').textContent='Close the current Slack popup before opening search.';
  }
  window.addEventListener('pme-native-switcher-action',async event=>{
    if(!window.__PME_REPLY__?.switcherOpen()||!['queue','reading','reply'].includes(mode))return;
    const {destination,navigate}=event.detail||{};if(typeof navigate!=='function')return;
    if(!destination){
      // Workflows and uncached destinations remain fully usable
      // in Slack. Do not infer recipients from labels or assume the old route.
      navigate();await transition('stock');return;
    }
    await startReply(destination,{nativeNavigate:navigate,preservePosition:true});
  },{signal:abort.signal});
  window.addEventListener('pme-native-search-open',event=>{
    const reply=window.__PME_REPLY__?.status();
    const workspaceId=event.detail?.workspaceId;
    if(!['queue','reading','reply'].includes(mode)||!connected()||workspaceId!==team())return;
    void startReply({kind:'search',workspaceId,key:`${workspaceId}:search`,name:'Search results'},{preservePosition:true,focusAfter:'messages'});
  },{signal:abort.signal});
  window.addEventListener('pme-native-fallback',event=>{
    if(mode==='reply'&&event.detail?.key===selection&&event.detail.key===window.__PME_REPLY__?.status().target?.key)void transition('stock');
  },{signal:abort.signal});
  window.addEventListener('pme-native-reply-state',renderReply,{signal:abort.signal});
  window.addEventListener('pme-native-reply-installed',()=>{const r=window.__PME_REPLY__?.status();if(r?.target&&(r.active||mode==='reply'))void startReply(r.target);},{signal:abort.signal});
  function openReader(key){++openSequence;openingKey=null;selection=key;void transition('reading');requestHistory();}
  function openItem(key,{reader=false}={}){
    const item=items().find(i=>i.key===key)||notificationItems().find(i=>i.key===key);if(!item)return;
    if(viewTeam()!=='*'&&item.workspaceId!==viewTeam())window.__pmeTriageAction?.(JSON.stringify({workspaceId:viewTeam(),action:'switch',target:item.workspaceId}));
    if(reader)openReader(key);else void startReply(item);
  }

  // Count actionable unread destinations, never invent an exact message total.
  const notificationWorkspaces=()=>snapshot.notificationWorkspaces||snapshot.workspaces;
  const notificationItems=()=>notificationWorkspaces().flatMap(w=>w.items||[]);
  const repliedPillItems=new Map();
  function dismissRepliedItem({key,ts}){
    if(!key||!/^\d+\.\d+$/.test(ts))return;
    repliedPillItems.set(key,{latest:Number(ts),until:Date.now()+25000});
    while(repliedPillItems.size>100)repliedPillItems.delete(repliedPillItems.keys().next().value);
    renderPill();
  }
  function replyDismissed(item){
    const dismissed=repliedPillItems.get(item.key);if(!dismissed)return false;
    if(item.unread===false||Date.now()>=dismissed.until||Number(item.latest||0)>dismissed.latest){repliedPillItems.delete(item.key);return false;}
    return true;
  }
  const pillItems=()=>notificationItems().filter(i=>!replyDismissed(i)&&i.unread===true&&!i.pendingRead&&!pendingInboxRead(i)&&!['done','later'].includes(i.triage?.state));
  function createPillActivityTracker(){
    let scope=null,seen=new Map(),workspaces=new Set(),since=0;
    return (value,{reset=false,now=Date.now()}={})=>{
      if(value.notificationWorkspaces)value={selectedWorkspace:value.notificationScope||'*',workspaces:value.notificationWorkspaces};
      const changed=reset||scope!==value.selectedWorkspace;
      if(changed){scope=value.selectedWorkspace;seen.clear();workspaces.clear();since=now/1000;}
      let activity=false;
      for(const workspace of value.workspaces){
        const established=workspaces.has(workspace.id);workspaces.add(workspace.id);
        for(const item of workspace.items){
          const previous=seen.get(item.key),latest=Number(item.latest)||0;
          const newer=latest>=(since-2)&&latest>(previous?.latest||0);
          const becameUnread=!!previous&&previous.unread!==true&&item.unread===true&&(previous.unread===false||latest>=since-2);
          const countIncreased=previous?.unread===true&&Number.isInteger(previous.count)&&Number.isInteger(item.unreadCount)&&item.unreadCount>previous.count;
          if(established&&item.unread===true&&!['done','later'].includes(item.triage?.state)&&(newer||becameUnread||countIncreased))activity=true;
          seen.set(item.key,{latest:Math.max(latest,previous?.latest||0),unread:item.unread,count:item.unreadCount});
        }
      }
      // Observations are bounded too; retain a little history for transiently
      // missing rows without accumulating every conversation ever visited.
      while(seen.size>8000)seen.delete(seen.keys().next().value);
      return !changed&&activity;
    };
  }
  const detectPillActivity=createPillActivityTracker();
  function revealPillActivity(){
    if(disposed||settings.expandOnActivity===false)return;
    if(mode==='strip'&&nativeStripRequest)void transition('cluster',{passive:true});
    else if(mode==='cluster')touch();
  }
  let pillSignature='',pillHeightSignature='';
  function pillHeight(kind,count){return kind==='strip'?Math.max(88,16+Math.min(count,48)*7+(count>48?32:0)):Math.max(132,96+Math.min(count,12)*38);}
  function renderPill(){
    const unread=pillItems(),count=unread.length;
    const label=`${count} active unread ${count===1?'conversation or thread':'conversations and threads'}`;
    const signature=JSON.stringify([selection,notificationWorkspaces().map(w=>[w.id,w.name]),unread.map(i=>[i.key,i.name,i.kind,i.messages.at(-1)?.text,i.messages.at(-1)?.author])]);
    $('edge-tab').setAttribute('aria-label',`${label}. Reveal triage`);$('edge-tab').title=`${label} · Hover to preview · Click to open triage`;
    $('edge-tab').classList.toggle('empty',!count);
    $('home').title='Open queue';
    $('pill-empty').hidden=!!count||mode!=='cluster';
    if(signature!==pillSignature){
      pillSignature=signature;
      const dots=document.createDocumentFragment();for(let i=0;i<Math.min(count,48);i++)dots.append(el('span','edge-dot'));
      $('edge-dots').replaceChildren(dots);$('edge-overflow').hidden=count<=48;$('edge-overflow').textContent=count>48?`+${count-48}`:'';
      const rail=$('pill-items'),scroll=rail.scrollTop,focused=shadow.activeElement?.classList.contains('pill-item')?shadow.activeElement.dataset.key:null;
      const buttons=document.createDocumentFragment();
      for(const item of unread){
        const kind=item.kind==='thread'?'Thread':item.kind==='channel'?'Channel':item.kind==='groupDM'?'Group chat':'DM';
        const workspace=notificationWorkspaces().find(w=>w.id===item.workspaceId)?.name||'';
        const last=item.messages.at(-1),preview=last?.text?.replace(/\s+/g,' ').trim().slice(0,260)||'Hover for a cached message preview.';
        const label=`${displayName(item)} · ${kind}${workspace?' · '+workspace:''}\n${last?.author?last.author+': ':''}${preview}`;
        const button=el('button','pill-item');button.dataset.key=item.key;
        button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(selection===item.key));
        const words=item.name.replace(/^[@#]/,'').trim().split(/[\s_-]+/),initials=words.slice(0,2).map(w=>Array.from(w)[0]||'').join('').toLocaleUpperCase();
        button.append(el('span','pill-initials',initials||'?'),el('span','pill-kind',item.kind==='thread'?'↳':item.kind==='channel'?'#':item.kind==='groupDM'?'◉':'@'));
        const hue=Array.from(item.key).reduce((n,c)=>(n*31+c.charCodeAt(0))%360,0);button.style.setProperty('--pill-hue',String(hue));buttons.append(button);
      }
      rail.replaceChildren(buttons);rail.scrollTop=scroll;if(focused)[...rail.children].find(b=>b.dataset.key===focused)?.focus({preventScroll:true});
    }
    const heightSignature=`${mode}:${count}`;
    if(pillPreview&&!unread.some(i=>i.key===pillPreview.key))setPillPreview(null);
    // Transitions already apply geometry; only resize here for a live count change.
    const resize=heightSignature!==pillHeightSignature&&pillHeightSignature.startsWith(mode+':');
    pillHeightSignature=heightSignature;
    if(resize&&['strip','cluster'].includes(mode))nativeQueue=nativeQueue.catch(()=>{}).then(()=>{if(!disposed&&['strip','cluster'].includes(mode))return geometry(mode);}).catch(()=>{});
  }
  function render() {
    if (disposed) return;
    renderReply();renderPill();
    const density=settings.inboxDensity||'expanded';host.setAttribute('data-density',density);
    $('density-picker').title=`Inbox density · ${density[0].toUpperCase()+density.slice(1)}`;$('density-picker').disabled=!connected();
    for(const button of densityMenu.querySelectorAll('button')){const selected=button.dataset.density===density;button.setAttribute('aria-pressed',String(selected));button.querySelector('.density-check').textContent=selected?'✓':'';}

    try{sessionStorage.setItem(viewKey,JSON.stringify({selection,filter,resumeReply}));}catch{}
    for (const button of shadow.querySelectorAll('[data-filter]')) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
    const activeWorkspace=snapshot.workspaces[0],activity=activeWorkspace?.activity;
    const waiting=Math.max(0,Math.ceil(((activity?.nextAt||0)-Date.now())/1000));
    const unavailable=!snapshot.customReadsAvailable||!connected()||viewTeam()==='*'||activity?.status==='loading'||activity?.queued||waiting>0;
    $('activity-refresh').disabled=unavailable;
    $('activity-refresh').title='Optional extra Slack API reads for the selected workspace. No background polling.';
    $('activity-more').hidden=viewTeam()==='*'||!activity?.hasMore;$('activity-more').disabled=unavailable;
    shadow.querySelector('.activity-controls').hidden=!snapshot.customReadsAvailable;
    $('activity-status').textContent=snapshot.network==='offline'?'Slack is offline':
      activity?.status==='loading'?'Refreshing…':activity?.status==='error'?'Refresh failed. Try again.':'';
    $('activity-status').hidden=!$('activity-status').textContent;
    const composeTeam=viewTeam(),composeChoices=(snapshot.workspaceDirectory||[]).filter(w=>w.connected);
    $('compose').disabled=!connected()||!window.__PME_REPLY__||!(composeTeam==='*'?composeChoices.length:composeChoices.some(w=>w.id===composeTeam));
    $('inbox-activity').disabled=!connected()||!window.__PME_REPLY__;
    $('inbox-switcher').disabled=!connected()||!window.__PME_REPLY__?.openSwitcher;
    const searchTeam=mode==='reply'?window.__PME_REPLY__?.status().target?.workspaceId:composeTeam==='*'?team():composeTeam;
    $('inbox-switcher').title=`Search ${snapshot.workspaceDirectory?.find(w=>w.id===searchTeam)?.name||'Slack'} · ⌘K`;
    $('compose').title=(composeTeam==='*'?'Choose workspace to compose':`Compose in ${composeChoices.find(w=>w.id===composeTeam)?.name||'current workspace'}`)+' · N';
    if(composeTeam==='*'){$('compose').setAttribute('aria-haspopup','dialog');$('compose').setAttribute('aria-controls','workspace-dialog');}else{$('compose').removeAttribute('aria-haspopup');$('compose').removeAttribute('aria-controls');}
    const picker=$('workspace-picker'),selected=viewTeam()||'',directory=[...(snapshot.workspaceDirectory||[])];
    const name=selected==='*'?'All workspaces':directory.find(w=>w.id===selected)?.name||snapshot.workspaces.find(w=>w.id===selected)?.name||'Workspace';
    picker.textContent=name;picker.setAttribute('aria-label',`${name}, choose workspace`);picker.title=`Switch workspace · ${name}`;picker.disabled=!connected();
    const options=$('workspace-options'),workspaceSignature=JSON.stringify([selected,directory,connected(),workspacePickerPurpose]);
    if(options.dataset.signature!==workspaceSignature){
      const focused=shadow.activeElement?.dataset.workspace;
      const choices=workspacePickerPurpose!=='switch'?directory:[{id:'*',name:'All workspaces',connected:true},...directory];
      const rows=choices.map(w=>{
        const button=el('button','workspace-option');button.type='button';button.dataset.workspace=w.id;button.disabled=!connected()||!w.connected;
        button.setAttribute('aria-pressed',String(workspacePickerPurpose==='switch'&&w.id===selected));
        button.append(el('span','workspace-name',w.name));const check=el('span','workspace-check',workspacePickerPurpose==='switch'&&w.id===selected?'✓':'');check.setAttribute('aria-hidden','true');button.append(check);return button;
      });
      options.replaceChildren(...rows);options.dataset.signature=workspaceSignature;
      if(workspaceDialog.open&&focused)rows.find(b=>b.dataset.workspace===focused&&!b.disabled)?.focus();
    }
    $('inbox-next-unread').disabled=!connected()||!nextUnreadItem(1);
    const rows = filtered();
    const listScroll = $('list').scrollTop;
    const focusKey = shadow.activeElement?.classList.contains('row')?shadow.activeElement.dataset.key:null;
    $('list').replaceChildren();
    if (!rows.length) $('list').append(el('div','empty',filter === 'all' ? 'No conversations observed yet. Browse a conversation in normal Slack to load it here.' : 'No observed conversations match this filter. This does not mean the workspace has no other activity.'));
    for (const item of rows) {
      const button = el('button', `row${item.key === selection ? ' selected' : ''}`); button.dataset.key = item.key;button.title='Open native Slack conversation · Option-click for read-only view';
      button.setAttribute('aria-pressed', String(item.key === selection));
      const head = el('div','row-head'); head.append(el('span','kind',item.kind === 'thread' ? '↳' : item.kind === 'channel' ? '#' : '◌'),el('span','name',displayName(item)));
      if(item.triage?.pinned)head.append(el('span','badge','Pinned'));
      if (inboxUnread(item)) { const dot = el('span','unread'); dot.title = 'Observed unread'; head.append(dot); }
      if (inboxUnread(item) && item.unreadCount !== null && item.unreadCount > 0) head.append(el('span','badge',String(item.unreadCount)));
      const last = item.messages.at(-1),workspace=snapshot.workspaces.length>1?snapshot.workspaces.find(w=>w.id===item.workspaceId)?.name:null;
      if(workspace)head.append(el('span','row-workspace',workspace));
      if(last)head.append(el('span','row-time',time(last.ts)));
      button.append(head);
      button.append(el('div','preview',last?.text || (['queued','loading'].includes(item.history?.status)?'Loading messages…':item.history?.status==='error'?'Could not load · open to retry':item.history?.status==='ready'?'No messages returned':'Open to load messages')));
      button.append(el('div','meta',[snapshot.workspaces.length>1?snapshot.workspaces.find(w=>w.id===item.workspaceId)?.name:null,item.kind === 'thread' ? 'Thread' : item.kind === 'channel' ? 'Channel' : 'Direct message', pendingInboxUnread(item)?'Marking unread…':pendingInboxRead(item)?'Marking read…':item.unread === null ? 'Unread unknown' : item.countsStale ? 'Unread state may be stale' : inboxUnread(item) ? 'Unread observed' : 'Read observed',last ? time(last.ts) : null].filter(Boolean).join(' · ')));
      const summary=[displayName(item),threadAlias(item.key)?item.name:null,item.triage?.pinned?'Pinned':null,inboxUnread(item)?'Unread':null,inboxUnread(item)&&item.unreadCount>0?`${item.unreadCount} unread`:null,button.querySelector('.meta')?.textContent,last?.text].filter(Boolean).join(' · ');
      button.setAttribute('aria-label',summary);button.dataset.pointerTitle=`${summary.slice(0,400)}\nJ/K: move · H/L: filters · /: filter text · Enter: reply · X: toggle read / unread · Option-click: read-only`;button.title=host.getAttribute('data-inbox-input')==='keyboard'?'':button.dataset.pointerTitle;button.setAttribute('aria-keyshortcuts','h j k l ArrowLeft ArrowRight ArrowDown ArrowUp Enter x');
      $('list').append(button);
    }
    $('list').scrollTop = listScroll;
    if (focusKey) [...$('list').children].find(e => e.dataset.key === focusKey)?.focus({ preventScroll: true });
    const item = items().find(i => i.key === selection);
    $('conversation').textContent = displayName(item) || 'Choose a conversation';
    $('reply').disabled=!item||!window.__PME_REPLY__;$('handoff').disabled=!item;$('handoff').textContent=item?.threadTs?'Open conversation in Slack ↗':'Open in Slack ↗';
    for(const id of ['done','later','pin','reopen'])$(id).disabled=!item||!connected()||!!pendingLocal;
    const mark=item?.readMark;
    if(pendingMark&&(item?.key===pendingMark.key&&mark?.through===pendingMark.ts||Date.now()-pendingMark.at>12000))pendingMark=null;
    const marking=mark?.status==='pending'||pendingMark?.key===item?.key&&!!pendingMark;
    $('mark-read').disabled=!connected()||!snapshot.markReadAvailable||!window.__PME_MARK_READ__||!item||!!item.threadTs||!item.messages.length||!!marking||(mark?.retryAt||0)>Date.now();
    $('mark-read').textContent=marking?'Marking…':'Mark read';
    $('mark-read').title=item?.threadTs?'Thread read state is separate. Use Reply in triage or Normal Slack.':'Mark Slack read through the latest message loaded here. Does not change local Done.';
    const markErrors={cursor_unavailable:'Slack’s current read position is unavailable. Nothing was changed.',workspace_mismatch:'Account verification failed. Nothing was changed.',workspace_changed:'The Slack context changed before marking. Try again.',adapter_disabled:'Mark read is disabled.',outcome_unknown:'Read result unknown. Refresh activity before trying again.',ratelimited:'Slack is limiting requests. Wait before trying again.',missing_scope:'Slack did not allow this read-state change.'};
    $('mark-status').textContent=item?.threadTs?'Thread Mark read is not yet available.':marking?'Saving Slack read position…':mark?.status==='success'?`Slack read through ${time(mark.through)}${item.unread?' · newer unread activity remains':''}. Local Done unchanged.`:mark?.status==='saved'?'Read position saved; unread refresh pending.':mark?markErrors[mark.error]||'Could not mark read. Refresh and try again.':'';
    $('snooze').disabled=!!pendingLocal;$('undo').disabled=!!pendingLocal;
    $('done').textContent=pendingLocal?.action==='done'?'Saving…':'Done →';$('later').textContent=pendingLocal?.action==='later'?'Saving…':'Later →';
    $('reopen').hidden=!item||item.triage?.state==='active';$('undo').hidden=!snapshot.canUndo;
    $('pin').textContent=item?.triage?.pinned?'Unpin':'Pin';
    if(!connected())$('notice').textContent=lastHostUpdate?'Triage disconnected · showing previous observations. Normal Slack is still available.':'Connecting to triage…';
    else if(snapshot.localError)$('notice').textContent=snapshot.localError;
    else if($('notice').textContent.startsWith('Triage disconnected')||$('notice').textContent==='Connecting to triage…')$('notice').textContent='';
    const history=item?.history,loading=['loading','queued'].includes(history?.status);
    $('coverage').textContent = item ? `${item.messages.length} messages in memory · ${history?.status==='ready'?'history loaded':'partial context'}${history?.hasMore?' · more available':''}` : '';
    $('refresh').disabled=!snapshot.customReadsAvailable||!connected()||!item||loading||(history?.retryAt||0)>Date.now();
    $('refresh').textContent=history?.status==='error'?'Retry':'Refresh';
    $('older').hidden=!history?.canLoadOlder;$('older').disabled=loading||$('refresh').disabled;
    $('older').textContent=item?.threadTs?'Load more replies':'Load older';
    $('history-status').textContent=!snapshot.customReadsAvailable?'Showing messages already loaded by Slack · no API requests':loading?'Loading from Slack…':history?.status==='error'?(loadErrors[history.error]||'Could not load messages. Retry when ready.'):
      history?.bounded?'Memory limit reached · showing recent messages':history?.hasMore&&!history.canLoadOlder?'More history exists, but Slack supplied no next page.':
      history?.status==='ready'?'Loaded without a mark-read request.':'';
    const signature = JSON.stringify([selection, item?.messages,history?.status]);
    if (signature !== readerSignature) {
      const sameSelection = readerSelection === selection;
      const nearBottom = $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 70;
      const scroll = $('messages').scrollTop;
      $('messages').replaceChildren();
      if (!item?.messages.length) $('messages').append(el('div','empty',loading?'Loading messages…':history?.status==='ready'?'No messages returned for this conversation.':snapshot.customReadsAvailable?'No messages loaded yet. Use Retry or Refresh above.':'Slack has not loaded these messages yet. Open Native chat to read them.'));
      for (const message of item?.messages || []) {
        const article = el('article','message'); const header = el('div','message-head');
        header.append(el('span','author',message.author),el('time','time',time(message.ts)));const body=el('div','body');for(const part of message.parts||[{type:'text',text:message.text||'[No text content]'}]){const node=el(['a','strong','em','s','code','pre'].includes(part.type)?part.type:'span',part.type==='mention'?'mention':'',part.text);if(part.type==='a'&&/^https?:\/\//.test(part.href)){node.href=part.href;node.target='_blank';node.rel='noopener noreferrer';}body.append(node);}article.append(header,body);
        if (message.hasAttachments) article.append(el('div','attachment','Attachment present · view in Slack'));
        if(message.replyCount>0&&!item.threadTs){const button=el('button','thread-link',`View thread · ${message.replyCount} ${message.replyCount===1?'reply':'replies'}`);
          button.dataset.thread=`${item.workspaceId}:${item.channelId}:${message.ts}`;article.append(button);}
        $('messages').append(article);
      }
      if(olderAnchor?.key===selection&&history?.status==='ready'&&history.action==='older'){
        $('messages').scrollTop=olderAnchor.thread?olderAnchor.top:olderAnchor.top+$('messages').scrollHeight-olderAnchor.height;olderAnchor=null;
      }else $('messages').scrollTop = !sameSelection || nearBottom ? $('messages').scrollHeight : scroll;
      readerSignature = signature; readerSelection = selection;
    }
  }
  function applyLayout() {
    closeWorkspacePicker(false);
    host.dataset.edge=edge;
    host.toggleAttribute('data-quick',!!quickReply&&mode==='reply');
    document.body.toggleAttribute('data-pme-quick',!!quickReply&&mode==='reply');
    document.body.toggleAttribute('data-pme-quick-read',!!quickReply?.readOnly&&mode==='reply');
    $('opener').hidden = mode !== 'stock';$('edge-tab').hidden=mode!=='strip';
    shadow.querySelector('.shell').hidden = ['stock','hidden','strip'].includes(mode);
    shadow.querySelector('.shell').classList.toggle('cluster',mode === 'cluster');
    shadow.querySelector('.shell').classList.toggle('reading',mode === 'reading');
    shadow.querySelector('.shell').classList.toggle('reply',mode === 'reply');renderReply();
    shadow.querySelector('.queue').hidden = mode === 'cluster';
    shadow.querySelector('.reader').hidden = mode !== 'reading';
  }
  function setDetailMotion(width=400){
    host.dataset.detailMotion='true';host.style.setProperty('--pme-detail-width',`${width}px`);
    document.body.setAttribute('data-pme-detail-motion','');document.body.style.setProperty('--pme-detail-width',`${width}px`);
  }
  function clearDetailMotion(){
    stagedDetail=false;delete host.dataset.detailMotion;host.style.removeProperty('--pme-detail-width');
    document.body.removeAttribute('data-pme-detail-motion');document.body.style.removeProperty('--pme-detail-width');
  }
  async function geometry(next,{animate=false}={}) {
    compactBounds=null;
    if(next!=='strip'){nativeStripRequest=null;nativeStripHidden=false;}
    const w = window.desktop?.window;
    if (!w?.callBrowserWindowMethod) { $('notice').textContent = 'Window controls unavailable; triage uses the current window.'; return; }
    const id = await w.getWindowId(); const call = (method,...args) => w.callBrowserWindowMethod(id,method,...args);
    await call('setWindowButtonVisibility',next==='stock').catch(()=>{});
    if(next==='hidden'){await call('hide');return;}
    if(await call('isMinimized'))await call('restore');
    if(!await call('isVisible')&&!(next==='strip'&&nativeStripHidden))await call('showInactive');
    if (next === 'stock') {
      if (original) {
        await call('setMinimumSize',...original.min); await call('setBounds',original.bounds); await call('setAlwaysOnTop',original.top);
        if(typeof original.spaces==='boolean')await call('setVisibleOnAllWorkspaces',original.spaces,{visibleOnFullScreen:false});
        original = null;spacesApplied=false;
      }
      try { sessionStorage.removeItem(layoutKey); } catch {}
      return;
    }
    if (!original) original = { min:await call('getMinimumSize'),bounds:await call('getBounds'),top:await call('isAlwaysOnTop'),spaces:await call('isVisibleOnAllWorkspaces').catch(()=>null) };
    try { sessionStorage.setItem(layoutKey,JSON.stringify({original,mode:next,edge})); } catch {}
    const displays = await desktop.screen.getAllDisplays();
    displayInfo=displays.map((d,i)=>({id:String(d.id),name:d.label||`Display ${i+1}`}));
    const main=typeof desktop.screen.getPrimaryDisplay==='function'?await desktop.screen.getPrimaryDisplay():displays[0];
    const display=(settings.display!=='main'?displays.find(d=>String(d.id)===settings.display):null)||main||displays[0];
    const area = display.workArea;
    const width = Math.min(next==='reply'&&quickReply?460:{strip:12,cluster:44,queue:420,reading:820,reply:820}[next],area.width);
    await call('setMinimumSize',12,44);
    await call('setAlwaysOnTop',true);
    if(!spacesApplied&&typeof original.spaces==='boolean'){
      await call('setVisibleOnAllWorkspaces',true,{visibleOnFullScreen:true});spacesApplied=true;
    }
    const compact=['cluster','strip'].includes(next);
    const height=next==='reply'&&quickReply?Math.min(660,area.height):compact?Math.min(pillHeight(next,pillItems().length),area.height):area.height;
    const y=compact||next==='reply'&&quickReply?area.y+Math.round((area.height-height)/2):area.y;
    const bounds={x:edge==='right'?area.x+area.width-width:area.x,y,width,height};
    const sideWidth=Math.max(width,innerWidth)-420;
    const moving=animate&&sideWidth>230;
    if(moving)setDetailMotion(sideWidth);
    try{await call('setBounds',bounds,moving);}
    catch(error){if(!moving)throw error;await call('setBounds',bounds);}
    // The native callback can precede the renderer's final resize frame.
    if(moving)await new Promise(resolve=>setTimeout(resolve,50));
    if(compact)compactBounds=bounds;
    if(next==='strip'){
      if(nativeStripRequest?.edge!==edge||JSON.stringify(nativeStripRequest?.bounds)!==JSON.stringify(bounds))
        nativeStripRequest={id:`${Date.now()}-${++stripSequence}`,edge,bounds};
      reportShell();syncNativeStrip();
    }
  }
  function transition(next,{stage=false,passive=false,reuseLayout=false}={}) {
    if (disposed || !['stock','hidden','strip','cluster','queue','reading','reply'].includes(next)) return Promise.resolve();
    if(aliasDialog.open)closeAlias();
    if(workspaceDialog.open)closeWorkspacePicker(false);
    if(densityMenu.matches(':popover-open'))densityMenu.hidePopover();
    if(pillReadPending){++pillReadRun;pillReadPending=null;window.__PME_REPLY__?.suspend();document.body.removeAttribute('data-pme-background-read');}
    if(next!=='reply')window.__PME_REPLY__?.cancelSwitcher?.({restore:false});
    clearTimeout(hoverTimer);hoverIntent=null;clearTimeout(pillIdleTimer);
    setPillPreview(null);
    if(next!=='reply'&&!passive){++openSequence;openingKey=null;}
    nativeQueue = nativeQueue.catch(()=>{}).then(async()=>{
      if(disposed||passive&&(mode!=='strip'||!nativeStripRequest))return;
      const from=mode,isDetail=value=>['reading','reply'].includes(value);
      const closing=isDetail(from)&&next==='queue'&&innerWidth>650&&!quickReply;
      const expanding=(from==='queue'||stagedDetail)&&isDetail(next);
      const animate=!stage&&(closing||expanding)&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (from === 'stock' && next !== 'stock') previousFocus = document.activeElement;
      try{
        // Keep the current pane mounted while it slides back under the queue.
        if(closing&&animate){setDetailMotion(innerWidth-420);await geometry(next,{animate:true});}
        if(from==='reply'&&next!=='reply'){resumeReply=false;window.__PME_REPLY__?.suspend();}
        if(next==='stock')resumeReply=false;
        if(['stock','queue'].includes(next))heldRow=null;
        if(stage){stagedDetail=true;setDetailMotion();}
        else if(animate&&expanding)setDetailMotion();
        if(next!=='reply')quickReply=null;
        mode=next;applyLayout();render();
        if(!['stock','reply'].includes(next)){const parked=await window.__PME_REPLY__?.park?.();if(parked?.ok===false)$('notice').textContent=parked.error;}
        if(!stage&&!(closing&&animate)&&!(reuseLayout&&from==='reply'&&next==='reply'&&!expanding))await geometry(next,{animate});
      }catch{$('notice').textContent='Window layout could not be applied. Normal Slack restores the saved layout.';}
      finally{if(!stage)clearDetailMotion();}
      if(!stage&&!passive){
        if (next === 'queue') focusInbox();
        if (next === 'reading') $('back').focus({preventScroll:true});
        if (next === 'reply'&&!window.__PME_REPLY__?.status().ready) $(quickReply?'quick-close':'inbox-back').focus({preventScroll:true});
        if (next === 'strip') $('edge-tab').focus({preventScroll:true});
        if (next === 'cluster') (shadow.querySelector('.pill-item')||(!$('pill-empty').hidden?$('pill-empty'):$('restore'))).focus({preventScroll:true});
        if (next === 'stock') previousFocus?.focus?.({preventScroll:true});
      }
      if(next!=='cluster')pillPointerInside=false;
      if(next==='cluster')touch();else schedulePillCollapse();
      reportShell(!passive&&['strip','hidden','cluster'].includes(next));
    });return nativeQueue;
  }
  shadow.addEventListener('click',event=>{
    event.stopPropagation();const button=event.target.closest('button');if(!button)return;
    touch();clearTimeout(hoverTimer);hoverIntent=null;
    if(button.id==='quick-close'){resumeReply=false;void transition('cluster');}
    else if(button.id==='quick-inbox'){const target=window.__PME_REPLY__?.status().target;if(target)void startReply(target);}
    else if(button.id==='workspace-picker')openWorkspacePicker();
    else if(button.id==='workspace-close')closeWorkspacePicker();
    else if(button.dataset.workspace){const target=button.dataset.workspace,purpose=workspacePickerPurpose;closeWorkspacePicker();if(purpose==='compose')void startCompose(target);else if(purpose==='activity')void startActivity(target);else window.__pmeTriageAction?.(JSON.stringify({workspaceId:viewTeam(),action:'switch',target}));}
    else if(['inbox-settings','pill-settings'].includes(button.id))window.__pmeTriageAction?.(JSON.stringify({workspaceId:viewTeam(),action:'preferences'}));
    else if(button.id==='inbox-stock')void transition('stock');
    else if(button.id==='inbox-collapse')void transition(restMode());
    else if(button.id==='inbox-back')void transition('queue');
    else if(button.id==='density-picker')showDensityPicker();
    else if(button.dataset.density){window.__pmeTriageAction?.(JSON.stringify({workspaceId:viewTeam(),action:'settings',patch:{inboxDensity:button.dataset.density}}));closeDensityPicker();}
    else if(button.id==='inbox-next-unread')void nextUnread(1);
    else if(button.id==='inbox-activity')void startActivity();
    else if(button.id==='inbox-switcher')void openNativeSwitcher();
    else if(button.id==='inbox-latest')window.__PME_REPLY__?.jumpToLatest();
    else if(button.dataset.key)openItem(button.dataset.key,{reader:event.altKey});
    else if(button.dataset.thread)openItem(button.dataset.thread);
    else if(['done','later','pin','reopen','undo'].includes(button.id))localAction(button.id);
    else if(button.id==='compose')void startCompose();
    else if(button.id==='mark-read')markRead();
    else if(button.id==='reply'||button.id==='reply-retry')void startReply(button.id==='reply-retry'?window.__PME_REPLY__?.status().target:undefined);
    else if(button.id==='reply-back')openReader(selection);
    else if(button.id==='reply-latest')window.__PME_REPLY__?.jumpToLatest();
    else if(button.id==='reply-queue')void transition('queue');
    else if(button.id==='reply-stock')void transition('stock');
    else if(button.id==='reply-collapse')void transition(restMode());
    else if(button.id==='handoff')void handoff();
    else if(['activity-refresh','activity-more'].includes(button.id))window.__pmeTriageAction?.(JSON.stringify({workspaceId:viewTeam(),action:'activity',more:button.id==='activity-more'}));
    else if(button.id==='refresh')requestHistory('refresh');
    else if(button.id==='older')requestHistory('older');
    else if(button.dataset.filter){filter=button.dataset.filter;render();}
    else if(button.id==='pill-empty'){resumeReply=false;void transition('queue');}
    else if(['opener','home','edge-tab'].includes(button.id)){if(resumeReply&&window.__PME_REPLY__?.status().target)void startReply(window.__PME_REPLY__.status().target);else void transition('queue');}
    else if(button.id==='restore')void transition('stock');
    else if(button.id==='collapse')void transition(mode==='cluster'?'queue':restMode());
    else if(button.id==='back')void transition('queue');
  },{signal:abort.signal});
  const pendingInboxRead=item=>pillReadPending?.unread!==true&&item.key===pillReadPending?.key&&Number(item.latest||0)<=pillReadPending.latest;
  const pendingInboxUnread=item=>pillReadPending?.unread===true&&item.key===pillReadPending.key;
  const inboxUnread=item=>pendingInboxUnread(item)||item.unread===true&&!pendingInboxRead(item);
  function inboxKeyItem(){
    const rows=filtered(),key=shadow.activeElement?.dataset?.key||selection;
    return rows.find(item=>item.key===key)||rows[0];
  }
  function moveInboxCursor(direction){
    const rows=filtered();if(!rows.length)return;
    const key=shadow.activeElement?.dataset?.key||selection,index=rows.findIndex(item=>item.key===key);
    const item=rows[index<0?(direction>0?0:rows.length-1):(index+direction+rows.length)%rows.length];
    // Selecting a row must not navigate Slack or steal focus into its composer.
    if(mode==='queue')selection=item.key;
    render();const row=[...$('list').children].find(node=>node.dataset.key===item.key);
    row?.focus({preventScroll:true});row?.scrollIntoView({block:'nearest'});
  }
  function moveInboxFilter(direction){
    const filters=['all','unread','mentions','dms','threads'],index=filters.indexOf(filter);
    filter=filters[(index+direction+filters.length)%filters.length];
    render();focusInbox();
  }
  async function readInboxItem(){
    const item=inboxKeyItem();if(!item||!connected()||pillReadPending)return;
    const unknown=typeof item.unread!=='boolean';
    let observed=item.unread;
    if(unknown){try{observed=window.__PME_OBSERVER__?.readState(item);}catch{observed=null;}}
    // Missing state is not evidence of "read". If a fresh local cache check
    // still cannot resolve it, X explicitly marks read rather than blocking.
    const unread=observed===false;
    const rows=filtered(),at=rows.findIndex(row=>row.key===item.key),next=rows[at+1]||rows[at-1];
    // Reuse the hidden native read flow. Closing the detail pane first keeps
    // its old editor from appearing under a different conversation label.
    if(mode!=='queue')await transition('queue');
    if(mode!=='queue'||!connected())return;
    heldRow=null;$('notice').textContent='';
    const reading=readFromPill(item,{inbox:true,unread,resolveUnknown:unknown});
    selection=filtered().some(row=>row.key===item.key)?item.key:next?.key||null;render();focusInbox();
    try{const result=await reading;if(!result.ok&&!result.cancelled)$('notice').textContent=result.error==='no-reply'?'This thread has no loaded replies to mark unread. You can mark its parent conversation unread instead.':result.error==='unavailable'?'Slack’s mark-unread action is unavailable for this item. Try it in Normal Slack.':`Slack has not confirmed this item as ${unread?'unread':'read'}. Showing its last observed state.`;}
    catch{$('notice').textContent=`Could not mark ${unread?'unread':'read'} in Slack. Try opening the conversation.`;}
    // Slack may focus a native element while changing conversations, even
    // without focusEditor. Restore queue navigation, but never steal focus
    // from a field or another row the user selected during the operation.
    if(mode==='queue'&&!shadow.activeElement)focusInbox();
  }
  function composeToggleKey(event){
    if(!['queue','reading','reply'].includes(mode)||quickReply||event.defaultPrevented||event.isComposing||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||event.key.toLowerCase()!=='n')return false;
    if(event.composedPath().some(node=>node?.matches?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')))return false;
    event.preventDefault();event.stopImmediatePropagation();touch();
    if(!event.repeat){
      if(mode==='reply'&&(openingKey?.endsWith(':compose')||window.__PME_REPLY__?.status().target?.kind==='compose'))void transition('queue');
      else void startCompose();
    }
    return true;
  }
  function inboxNavigationKey(event){
    if(!['queue','reading','reply'].includes(mode)||quickReply||event.defaultPrevented||event.isComposing||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!event.composedPath().includes(host))return false;
    const active=shadow.activeElement,key=event.key.toLowerCase();
    const typing=event.composedPath().some(node=>node?.matches?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'));
    const horizontal=['ArrowLeft','ArrowRight'].includes(event.key),arrows=['ArrowDown','ArrowUp'].includes(event.key),enter=event.key==='Enter';
    if(typing&&!(active===$('search')&&(arrows||enter)))return false;
    if(!arrows&&!horizontal&&!['h','j','k','l','x','/'].includes(key)&&!enter)return false;
    // Keep Enter's ordinary button activation on header and filter controls.
    if(enter&&!active?.dataset?.key&&active!==$('search'))return false;
    event.preventDefault();event.stopImmediatePropagation();touch();
    if(key==='/'){$('search').focus({preventScroll:true});$('search').select();}
    else if(horizontal||key==='h'||key==='l')moveInboxFilter(event.key==='ArrowLeft'||key==='h'?-1:1);
    else if(arrows||key==='j'||key==='k')moveInboxCursor(event.key==='ArrowUp'||key==='k'?-1:1);
    else if(!event.repeat&&key==='x')void readInboxItem();
    else if(!event.repeat&&enter){
      const item=inboxKeyItem(),reply=window.__PME_REPLY__;
      if(item){if(mode==='reply'&&reply?.status().ready&&reply.status().target?.key===item.key&&!reply.status().auxiliary)reply.focus();else openItem(item.key);}
    }
    return true;
  }
  function nextUnreadItem(direction){
    const rows=filtered(),at=rows.findIndex(item=>item.key===selection);
    const start=at<0?(direction>0?-1:0):at;
    for(let step=1;step<=rows.length;step++){
      const item=rows[(start+direction*step+rows.length)%rows.length];
      if(item.key!==selection&&inboxUnread(item)&&!item.pendingRead&&!replyDismissed(item)&&!['done','later'].includes(item.triage?.state))return item;
    }
    return null;
  }
  async function nextUnread(direction){
    if(!connected()||!['queue','reading','reply'].includes(mode)||quickReply)return;
    const item=nextUnreadItem(direction);
    if(!item){$('notice').textContent='No other unread items in this view.';return;}
    $('notice').textContent='';await startReply(item,{focusAfter:'messages'});
  }
  function focusInbox(){
    const row=[...$('list').children].find(node=>node.dataset?.key===selection);
    const next=row||$('list').children[0];
    // Empty filters keep a non-editable focus target so H/L can continue.
    (next?.dataset?.key?next:shadow.querySelector(`[data-filter="${filter}"]`))?.focus({preventScroll:true});next?.scrollIntoView?.({block:'nearest'});
  }
  function cycleTriageFocus(direction){
    const reply=window.__PME_REPLY__;
    if(mode!=='reply'||!reply?.status().ready||reply.status().auxiliary){focusInbox();return;}
    const pane=document.querySelector('[data-pme-native-reply-pane]'),active=document.activeElement;
    const area=active===host?0:active?.closest?.('[data-qa="message_input"],[data-qa="composer_page"]')?2:pane?.contains(active)?1:0;
    const regions=reply.status().readOnly?[0,1]:[0,1,2];
    const next=regions[(Math.max(0,regions.indexOf(area))+direction+regions.length)%regions.length];
    if(next===0)focusInbox();else if(next===1)reply.focusMessages();else reply.focus();
  }
  function triageNavigationKey(event){
    if(!['queue','reading','reply'].includes(mode)||quickReply||event.defaultPrevented||event.isComposing)return false;
    const unread=event.altKey&&event.shiftKey&&!event.metaKey&&!event.ctrlKey&&['ArrowDown','ArrowUp'].includes(event.key);
    const focus=event.key==='F6'&&!event.altKey&&!event.metaKey&&!event.ctrlKey;
    if(!unread&&!focus)return false;
    event.preventDefault();event.stopImmediatePropagation();
    if(!event.repeat){if(unread)void nextUnread(event.key==='ArrowDown'?1:-1);else cycleTriageFocus(event.shiftKey?-1:1);}
    return true;
  }
  function closeWorkspacePicker(restoreFocus=true){
    if(!workspaceDialog.open)return;workspaceDialog.close();$('workspace-picker').setAttribute('aria-expanded','false');$('compose').setAttribute('aria-expanded','false');$('inbox-activity').setAttribute('aria-expanded','false');
    if(restoreFocus)$(workspacePickerPurpose==='compose'?'compose':workspacePickerPurpose==='activity'?'inbox-activity':'workspace-picker').focus({preventScroll:true});
  }
  function openWorkspacePicker(purpose='switch'){
    if(workspaceDialog.open)return;workspacePickerPurpose=purpose;
    $('workspace-dialog-title').textContent=purpose==='compose'?'Compose in…':purpose==='activity'?'Activity in…':'Workspaces';render();
    workspaceDialog.showModal();$(purpose==='compose'?'compose':purpose==='activity'?'inbox-activity':'workspace-picker').setAttribute('aria-expanded','true');
    (workspaceDialog.querySelector('.workspace-option[aria-pressed="true"]:not(:disabled)')||workspaceDialog.querySelector('.workspace-option:not(:disabled)')||$('workspace-close')).focus();
  }
  workspaceDialog.addEventListener('cancel',event=>{event.preventDefault();closeWorkspacePicker();},{signal:abort.signal});
  workspaceDialog.addEventListener('click',event=>{if(event.target===workspaceDialog){const r=workspaceDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeWorkspacePicker();}},{signal:abort.signal});
  $('search').addEventListener('input',render,{signal:abort.signal});
  // Run navigation chords before Slack's document-level shortcuts so their
  // unread traversal cannot bypass the selected triage workspace and filters.
  function shortcutMatches(event,value){
    if(value==='cmd-shift-y'||value==='cmd-shift-u')return !!event.metaKey&&!!event.shiftKey&&!event.ctrlKey&&!event.altKey&&event.code===(value==='cmd-shift-y'?'KeyY':'KeyU');
    return event.code==='Space'&&!!event.altKey&&!event.metaKey&&!event.shiftKey&&(value==='ctrl-option-space'?!!event.ctrlKey:value==='option-space'&&!event.ctrlKey);
  }
  let inboxPointerPosition=null;
  function setInboxInput(input){
    if(host.getAttribute('data-inbox-input')===input)return;
    host.setAttribute('data-inbox-input',input);
    for(const row of $('list').children)if(row.dataset?.key)row.title=input==='keyboard'?'':row.dataset.pointerTitle||'';
  }
  function inboxPointerMoved(event){
    if(!event.isTrusted||!['mouse','pen'].includes(event.pointerType))return;
    // Use screen coordinates: keyboard scrolling, row replacement and window
    // resizing can move content under a parked mouse without user movement.
    const point={x:event.screenX,y:event.screenY};
    const moved=inboxPointerPosition?point.x!==inboxPointerPosition.x||point.y!==inboxPointerPosition.y:!!(event.movementX||event.movementY);
    inboxPointerPosition=point;
    if(moved)setInboxInput('pointer');
  }
  document.addEventListener('pointermove',inboxPointerMoved,{capture:true,signal:abort.signal});
  document.addEventListener('pointerdown',event=>{if(event.isTrusted)setInboxInput('pointer');},{capture:true,signal:abort.signal});
  window.addEventListener('keydown',event=>{
    if(['queue','reading','reply'].includes(mode)&&!quickReply&&(event.composedPath().includes(host)||event.key==='F6'||event.altKey&&event.shiftKey&&['ArrowDown','ArrowUp'].includes(event.key)))setInboxInput('keyboard');
    if(!event.isComposing){
      const action=shortcutMatches(event,settings.shortcut||'cmd-shift-y')&&!snapshot.nativeHotkey?'toggle':shortcutMatches(event,settings.stockShortcut||'cmd-shift-u')&&!snapshot.nativeStockHotkey?'stock-toggle':null;
      if(action){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)void command(action);return;}
    }
    if(mode!=='stock'&&!event.isComposing&&(event.metaKey||event.ctrlKey)&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='k'){
      if(workspaceDialog.open||aliasDialog.open)return;
      event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)void openNativeSwitcher();return;
    }
    if(aliasDialog.open||densityMenu.matches(':popover-open')||workspaceDialog.open||window.__PME_REPLY__?.switcherOpen?.()||window.__PME_REPLY__?.overlayOpen?.())return;
    if(!composeToggleKey(event)&&!inboxNavigationKey(event))triageNavigationKey(event);
  },{capture:true,signal:abort.signal});
  document.addEventListener('keydown',event=>{
    touch();
    if(aliasDialog.open)return;
    if(densityKey(event))return;
    if(workspaceDialog.open){
      event.stopImmediatePropagation();
      if(event.key==='Escape'){event.preventDefault();closeWorkspacePicker();}
      else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();const options=[...workspaceDialog.querySelectorAll('.workspace-option:not(:disabled)')];
        const current=options.indexOf(shadow.activeElement),delta=event.key==='ArrowUp'?-1:1;
        const index=event.key==='Home'?0:event.key==='End'?options.length-1:current<0?(delta>0?0:options.length-1):(current+delta+options.length)%options.length;
        options[index]?.focus();
      }
      return;
    }
    if (mode==='stock')return;
    if(window.__PME_REPLY__?.switcherOpen?.()||mode==='reply'&&window.__PME_REPLY__?.overlayOpen?.())return;
    if(event.key==='Escape'&&event.composedPath().includes(host)&&shadow.activeElement?.matches('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')){
      if(event.defaultPrevented||event.isComposing)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(!event.repeat)focusInbox();return;
    }
    if(mode==='reply'&&event.key==='Escape'&&window.__PME_REPLY__?.status().auxiliary){
      if(event.defaultPrevented||event.isComposing)return;
      event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)window.__PME_REPLY__.closeAuxiliary();return;
    }
    const fromTriage=event.composedPath().includes(host);
    const editable='input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
    const nativeTyping=document.activeElement!==host&&document.activeElement?.closest?.(editable)||
      !fromTriage&&event.composedPath().some(n=>n?.closest?.(editable));
    if(mode==='reply'&&event.key==='Escape'){
      if(event.isComposing||event.defaultPrevented)return;
      const composer=document.activeElement?.closest?.('[data-pme-native-reply-pane] [data-qa="texty_input"][contenteditable="true"]');
      if(nativeTyping&&!composer)return;
      event.preventDefault();event.stopImmediatePropagation();
      // A held Escape must not blur the composer and immediately close its pane.
      if(event.repeat)return;
      if(composer){document.activeElement.blur();return;}
      void transition(quickReply?'cluster':'queue');return;
    }
    // Other composition keys stay with Slack.
    if(mode==='reply'&&!fromTriage)return;
    if(fromTriage)event.stopImmediatePropagation();
    const typing=event.composedPath().some(n=>n?.matches?.('input,textarea,select,[contenteditable="true"]'));
    if(detailMode()&&!typing&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&!event.isComposing){
      const action={e:'done',l:'later',p:'pin'}[event.key.toLowerCase()];
      if(action||event.key.toLowerCase()==='r'){event.preventDefault();event.stopImmediatePropagation();if(action)localAction(action);else void startReply();return;}
    }
    if(event.key==='Tab'){
      const controls=[...shadow.querySelectorAll('button,input,select')].filter(e=>!e.disabled&&e.getClientRects().length);
      const current=controls.indexOf(shadow.activeElement);
      if(current<0||event.shiftKey&&current===0||!event.shiftKey&&current===controls.length-1){
        event.preventDefault();event.stopImmediatePropagation();controls[event.shiftKey?controls.length-1:0]?.focus();
      }return;
    }
    if(event.key==='Escape'){
      if(event.defaultPrevented||event.isComposing||nativeTyping)return;
      event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)void transition(detailMode()?'queue':restMode());return;
    }

  },{capture:true,signal:abort.signal});

  function reportShell(returnFocus=false,resumed=false){window.__pmeShellState?.(JSON.stringify({workspaceId:team(),mode,focused:document.hasFocus(),returnFocus,resumed,online:navigator.onLine,displays:displayInfo,edgeStrip:mode==='strip'?nativeStripRequest:null,preview:pillPreview}));}
  function syncNativeStrip(){
    const hide=mode==='strip'&&connected()&&!!nativeStripRequest&&snapshot.nativeStripReady===nativeStripRequest.id;
    if(disposed||mode!=='strip'||stripSyncPending||hide===nativeStripHidden)return;
    stripSyncPending=true;
    nativeQueue=nativeQueue.catch(()=>{}).then(async()=>{
      if(disposed||mode!=='strip')return;
      const ready=connected()&&!!nativeStripRequest&&snapshot.nativeStripReady===nativeStripRequest.id;
      const w=window.desktop?.window;if(!w?.callBrowserWindowMethod)return;
      await w.callBrowserWindowMethod(await w.getWindowId(),ready?'hide':'showInactive');nativeStripHidden=ready;
    }).catch(()=>{}).finally(()=>{stripSyncPending=false;});
  }
  function setPillPreview(button){
    const rect=button?.getBoundingClientRect();
    const next=mode==='cluster'&&compactBounds&&rect?{key:button.dataset.key,edge,anchor:{x:compactBounds.x+rect.x,y:compactBounds.y+rect.y,width:rect.width,height:rect.height}}:null;
    if(JSON.stringify(next)!==JSON.stringify(pillPreview)){pillPreview=next;reportShell();}
  }
  async function command(op){
    if(op==='stock-toggle'){
      await nativeQueue.catch(()=>{});
      if(mode!=='stock')return command('stock');
      const w=desktop.window,id=await w.getWindowId(),call=method=>w.callBrowserWindowMethod(id,method);
      if(await call('isVisible')&&!await call('isMinimized')){await call('hide');reportShell(true);return {mode:'stock',returnFocus:true};}
      if(await call('isMinimized'))await call('restore');await call('show');await call('focus');reportShell();return {mode:'stock',returnFocus:false};
    }
    if(op==='peek'&&mode!=='strip')return {mode};
    const next=op==='peek'?'cluster':op==='toggle'?(['reading','queue','reply'].includes(mode)?restMode():'queue'):op==='rest'?restMode():op==='hide'?'hidden':op;
    if(op==='toggle'&&resumeReply&&['stock','strip','cluster','hidden'].includes(mode)&&window.__PME_REPLY__?.status().target){await startReply(window.__PME_REPLY__.status().target);const w=desktop.window;await w.callBrowserWindowMethod(await w.getWindowId(),'focus');return {mode};}
    if(op==='minimize'){if(mode!=='stock')await transition('queue');nativeStripRequest=null;const w=desktop.window;await w.callBrowserWindowMethod(await w.getWindowId(),'minimize');reportShell(true);return {mode,returnFocus:true};}
    if(!['stock','hidden','strip','cluster','queue','reading','reply'].includes(next))return {mode};
    touch();await transition(next);
    if(['stock','queue','reading','reply'].includes(next)){const w=desktop.window;await w.callBrowserWindowMethod(await w.getWindowId(),'focus');}
    return {mode,returnFocus:['strip','hidden','cluster'].includes(mode)};
  }
  function schedulePillCollapse(){
    clearTimeout(pillIdleTimer);
    if(disposed||mode!=='cluster'||pillPointerInside||snapshot.previewHeld||pillReadPending||settings.idleSeconds<=0)return;
    const delay=Math.max(0,settings.idleSeconds*1000-(Date.now()-lastInteraction));
    pillIdleTimer=setTimeout(()=>{
      if(disposed||mode!=='cluster'||pillPointerInside||snapshot.previewHeld||pillReadPending||settings.idleSeconds<=0)return;
      if(Date.now()-lastInteraction<settings.idleSeconds*1000){schedulePillCollapse();return;}
      void transition('strip');
    },delay);
  }
  function touch(){lastInteraction=Date.now();schedulePillCollapse();}
  function pillHover(inside){
    const changed=pillPointerInside!==inside;pillPointerInside=inside;
    if(inside||changed)touch();
    const intent=inside&&mode==='strip'?'cluster':null;
    if(intent===hoverIntent)return;
    clearTimeout(hoverTimer);hoverIntent=intent;
    if(intent){
      const from=mode;
      hoverTimer=setTimeout(async()=>{
        let visible=true;
        try{const w=window.desktop?.window;if(w?.callBrowserWindowMethod){const id=await w.getWindowId();visible=await w.callBrowserWindowMethod(id,'isVisible')&&!await w.callBrowserWindowMethod(id,'isMinimized');}}catch{visible=false;}
        if(!disposed&&mode===from&&hoverIntent===intent){hoverIntent=null;if(visible)void transition(intent);}
      },180);
    }
  }
  shadow.addEventListener('pointermove',()=>{touch();if(['strip','cluster'].includes(mode))pillHover(true);},{signal:abort.signal});
  host.addEventListener('pointerleave',()=>{pillHover(false);setPillPreview(null);},{signal:abort.signal});
  host.addEventListener('pointerenter',()=>pillHover(true),{signal:abort.signal});
  $('edge-tab').addEventListener('pointerenter',()=>pillHover(true),{signal:abort.signal});
  $('edge-tab').addEventListener('pointerleave',()=>{if(mode==='strip')pillHover(false);},{signal:abort.signal});
  // Inactive macOS windows may receive no DOM hover events. This reads only the
  // local pointer, never Slack state/network, and never activates the window.
  const cursorTimer=setInterval(async()=>{
    const bounds=compactBounds,currentMode=mode;
    if(currentMode==='strip'&&nativeStripHidden)return;
    if(disposed||cursorCheckPending||!bounds||!['strip','cluster'].includes(mode)||typeof window.desktop?.screen?.getCursorScreenPoint!=='function')return;
    cursorCheckPending=true;
    try{
      const point=await desktop.screen.getCursorScreenPoint();
      let inside=point.x>=bounds.x&&point.x<bounds.x+bounds.width&&point.y>=bounds.y&&point.y<bounds.y+bounds.height;
      if(inside){const w=desktop.window,id=await w.getWindowId();inside=await w.callBrowserWindowMethod(id,'isVisible')&&!await w.callBrowserWindowMethod(id,'isMinimized');}
      if(!disposed&&mode===currentMode&&compactBounds===bounds){
        pillHover(inside);
        const button=inside&&mode==='cluster'?[...$('pill-items').children].find(b=>{const r=b.getBoundingClientRect(),rail=$('pill-items').getBoundingClientRect(),x=point.x-bounds.x,y=point.y-bounds.y;return x>=r.left&&x<r.right&&y>=Math.max(r.top,rail.top)&&y<Math.min(r.bottom,rail.bottom);}):null;
        setPillPreview(button);
      }
    }catch{/* DOM hover remains available if a future bridge omits cursor access. */}
    finally{cursorCheckPending=false;}
  },150);
  window.addEventListener('focus',()=>reportShell(),{signal:abort.signal});
  window.addEventListener('online',()=>{reportShell(false,true);render();},{signal:abort.signal});
  window.addEventListener('offline',()=>{reportShell();render();},{signal:abort.signal});
  let lastPulse=Date.now();
  const shellTimer=setInterval(async()=>{
    if(disposed)return;
    const pulse=Date.now();reportShell(false,pulse-lastPulse>15000);lastPulse=pulse;syncNativeStrip();
    if(hostDisconnected===connected()){hostDisconnected=!connected();if(hostDisconnected){snapshot.previewHeld=false;touch();}render();}
    try{const displays=await desktop.screen.getAllDisplays();const signature=JSON.stringify(displays.map(d=>[d.id,d.workArea]));
      if(displaySignature&&signature!==displaySignature&&!['stock','hidden'].includes(mode))void transition(mode);displaySignature=signature;
    }catch{}
  },2000);
  function observe() {
    if(disposed||!team()||typeof window.__pmeReadOnlySnapshot!=='function')return;
    // Slack can update its URL before replacing the previous workspace's DOM.
    // Never attribute that transient sidebar or message pane to the new team.
    if(document.querySelector('[data-qa="team_sidebar_item"][data-team-active="true"]')?.getAttribute('data-team')!==team())return;
    const channelId=location.pathname.match(/^\/client\/[TE][A-Z0-9]+\/([CDG][A-Z0-9]+)/)?.[1]||null;
    const rows=Array.from(document.querySelectorAll('[data-qa="channel-sidebar-channel"]')).slice(0,150);
    const conversations=rows.map(row=>({
      channelId:row.getAttribute('data-qa-channel-sidebar-channel-id'),
      name:(()=>{const name=row.querySelector('[data-qa^="channel_sidebar_name_"]')?.cloneNode(true);name?.querySelector('[data-qa="channel_sidebar_name_you"]')?.remove();return name?.textContent?.trim().slice(0,180)||'';})(),
      kind:row.getAttribute('data-qa-channel-sidebar-channel-type')==='im'?'dm':row.getAttribute('data-qa-channel-sidebar-channel-type')==='mpim'?'groupDM':'channel',
      unread:row.classList.contains('p-channel_sidebar__channel--unread'),
      unreadObserved:row.classList.contains('p-channel_sidebar__channel')
    }));
    const messageNodes=Array.from(document.querySelectorAll('[data-qa="message_pane"] [data-qa="message_container"][data-msg-ts]')).filter(n=>n.getAttribute('data-msg-channel-id')===channelId).slice(-60);
    const messages=messageNodes.map(n=>({ts:n.getAttribute('data-msg-ts'),
      author:n.querySelector('[data-qa="message_sender_name"]')?.textContent?.trim().slice(0,160)||'',
      text:n.querySelector('[data-qa="message-text"],.c-message_kit__text,.c-message__body')?.textContent?.trim().slice(0,4000)||''}));
    domHealth={sidebarRows:rows.length,messageRows:messageNodes.length};
    let knownWorkspaces=[];try{knownWorkspaces=Object.values(JSON.parse(localStorage.getItem('localConfig_v2')||'{}').teams||{}).filter(w=>/^[TE][A-Z0-9]+$/.test(w.id)).map(w=>({id:w.id,name:String(w.name||w.id).slice(0,180)})).slice(0,12);}catch{}
    const observation={workspaceId:team(),knownWorkspaces,workspaceName:document.querySelector('[data-qa="workspace_actions_button"]')?.textContent?.trim().slice(0,180),
      channelId,channelName:document.querySelector('[data-qa="channel_name"]')?.textContent?.trim().slice(0,180),conversations,messages};
    const serialized=JSON.stringify(observation);if(serialized===lastObservation && Date.now()-lastPublished<15000)return;
    lastObservation=serialized;lastPublished=Date.now();window.__pmeReadOnlySnapshot(serialized);
  }
  const observer=new MutationObserver(mutations=>{
    if(mutations.every(m=>m.target===host||host.contains(m.target)))return;
    if(domTimer)return;domTimer=setTimeout(()=>{domTimer=null;observe();},500);
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','data-msg-ts','data-team-active']});
  idle=setInterval(observe,10000);
  window.__PME_TRIAGE__={threadAlias,version:'0.20.0',update:value=>{const activity=detectPillActivity(value,{reset:!connected()});lastHostUpdate=Date.now();hostDisconnected=false;const before=JSON.stringify({...settings,inboxDensity:undefined}),previewWasHeld=snapshot.previewHeld;snapshot=value;acceptAliasResult();if(value.previewHeld||previewWasHeld!==value.previewHeld)touch();syncNativeStrip();acceptLocalResult();settings={...settings,...value.settings};edge=settings.edge;render();if(before!==JSON.stringify({...settings,inboxDensity:undefined})&&!['stock','hidden'].includes(mode))void transition(mode);if(activity)revealPillActivity();},transition,command,quick,readFromPill,activity:startActivity,open:openItem,
    status:()=>({mode,edge,reply:window.__PME_REPLY__?.status().state,connected:connected(),network:snapshot.network||'unknown',workspace:viewTeam(),items:items().length,messages:items().reduce((n,i)=>n+i.messages.length,0),...domHealth}),
    dispose:async()=>{if(disposed)return;setPillPreview(null);disposed=true;abort.abort();observer.disconnect();clearTimeout(domTimer);clearInterval(idle);clearInterval(shellTimer);clearInterval(cursorTimer);clearTimeout(hoverTimer);clearTimeout(pillIdleTimer);
      window.__PME_REPLY__?.cancelSwitcher?.({restore:false});window.__PME_REPLY__?.suspend();await nativeQueue.catch(()=>{});clearDetailMotion();document.body.removeAttribute('data-pme-quick');document.body.removeAttribute('data-pme-quick-read');document.body.removeAttribute('data-pme-background-read');++pillReadRun;await geometry('stock').catch(()=>{});host.remove();delete window.__PME_TRIAGE__;
    }};
  observe();render();
  if(window.__PME_REPLY__?.status().active&&window.__PME_REPLY__.status().target)void startReply(window.__PME_REPLY__.status().target);
  else if(savedLayout)void transition(['reading','reply'].includes(savedLayout.mode)?'queue':savedLayout.mode);
})();
