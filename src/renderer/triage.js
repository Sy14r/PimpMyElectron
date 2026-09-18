(function installTriage() {
  if (window.top !== window || location.origin !== 'https://app.slack.com') return;
  const team = () => location.pathname.match(/^\/client\/([TE][A-Z0-9]+)/)?.[1];
  if (!team() || window.__PME_TRIAGE__) return;
  if (!document.body) { document.addEventListener('DOMContentLoaded', installTriage, { once: true }); return; }
  const abort = new AbortController();
  let settings={edge:'right',rest:'strip',display:'main',idleSeconds:60},lastInteraction=Date.now(),displayInfo=[],displaySignature='',hoverTimer,hoverIntent=null;
  let compactBounds=null,cursorCheckPending=false;
  let pillPreview=null;
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
      button{border:0;background:transparent;border-radius:8px}button:hover{background:#ffffff0e}
      button:focus-visible,input:focus-visible{outline:2px solid #b7a8ec;outline-offset:2px}button:disabled{opacity:.4;cursor:default}
      [hidden]{display:none!important}#opener{position:fixed;right:18px;bottom:18px;pointer-events:auto;padding:10px 15px;background:#262337;border:1px solid #827097;border-radius:24px;box-shadow:0 4px 20px #0006;display:flex;gap:9px;align-items:center;font-weight:600}
      .signal{width:7px;height:7px;border-radius:50%;background:#99d3b9}.shell{pointer-events:auto;position:fixed;inset:0;background:#141925;display:flex;box-shadow:0 0 60px #0007}
      .rail{width:44px;flex-shrink:0;background:#10141f;border-right:1px solid #ffffff0c;display:flex;flex-direction:column;align-items:center;gap:9px;padding:12px 0}.rail button{width:32px;height:32px;font-size:13px;background:#ffffff07;color:#a4adc0}.rail .brand{background:#b6a5e8;color:#20182b;font-weight:800}.spacer{flex:1}
      .queue{width:376px;flex-shrink:0;display:flex;flex-direction:column;padding:22px 16px 12px;border-right:1px solid #ffffff10;min-height:0}.eyebrow{font-size:10px;font-weight:600;letter-spacing:1.7px;color:#b3a4d5;text-transform:uppercase}h1{font-size:25px;line-height:1.2;letter-spacing:-.6px;margin:8px 0}#workspace{color:#8f9aaf;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .scope{display:flex;align-items:center;gap:6px;margin:17px 0 12px;font-size:11px;color:#9eacbc}.scope .signal{width:5px;height:5px}#search{width:100%;border:1px solid #ffffff12;border-radius:8px;background:#ffffff05;padding:9px 11px;outline-offset:0;font-size:12px}#search::placeholder{color:#758196}
      .filters{display:flex;gap:4px;flex-wrap:wrap;margin:12px 0}.filters button{padding:5px 9px;font-size:11px;color:#94a2b8}.filters button[aria-pressed="true"]{color:#d0bdf5;background:#ab8cdd20}
      #list{overflow:auto;flex:1;min-height:60px;padding:2px}.row{display:block;width:100%;text-align:left;border:1px solid transparent;padding:12px 10px;margin-bottom:4px}.row.selected{background:#a492d017;border-color:#b6a1e940}.row-head{display:flex;gap:7px;align-items:center}.kind{color:#7787a0;font-size:15px;width:15px;flex-shrink:0}.name{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;flex:1}.unread{width:6px;height:6px;background:#bca9f0;border-radius:50%}.badge{font-size:10px;color:#c5b3ee}.preview{font-size:11.5px;line-height:1.5;color:#8796ae;margin:7px 0 0 22px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.meta{font-size:10px;color:#748299;margin:5px 0 0 22px}
      .empty{padding:24px 10px;color:#8796af;font-size:12px;line-height:1.6}#notice:empty{display:none}
      .reader{flex:1;min-width:0;display:flex;flex-direction:column;background:#191f2c}.reader-header{padding:22px 23px 16px;border-bottom:1px solid #ffffff0a}.reader-header h2{font-size:18px;margin:8px 0 4px;overflow-wrap:anywhere}#coverage{font-size:11px;color:#8494ab;line-height:1.6}.reader-header button{float:right;color:#94a2b8;padding:3px 7px}.messages{flex:1;overflow:auto;padding:8px 23px}.message{padding:17px 0;border-bottom:1px solid #ffffff07}.message-head{display:flex;align-items:baseline;gap:9px}.author{font-weight:650;font-size:12px;color:#cdd4e4}.time{color:#77869d;font-size:10px}.body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.65;color:#bcc6d8;margin-top:6px}.attachment{font-size:10px;color:#9a8eb5;margin-top:7px}.read-only{padding:12px 23px;border-top:1px solid #ffffff0c;color:#829690;font-size:11px;display:flex;gap:8px;align-items:center}#notice{font-size:11px;color:#dbbca1;margin-top:9px;white-space:normal}
      .triage-controls{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.triage-controls button{float:none;background:#ab8cdd20;color:#d6c8ef;padding:6px 9px;font-size:11px}.history-controls{display:flex;gap:8px;margin-top:12px}.reader-header .history-controls button{float:none;border:1px solid #ffffff18;padding:5px 10px;font-size:11px}#history-status{font-size:11px;color:#b5a6d5;margin-top:9px}.body a{color:#b8c7fa;text-decoration:underline}.body code,.body pre{background:#ffffff0a;border-radius:4px;padding:2px 4px;font-size:12px}.body pre{padding:10px;overflow:auto;white-space:pre-wrap}.mention{color:#c3b3ef}.thread-link{font-size:11px;margin-top:8px;padding:5px 8px;background:#ab8cdd16;color:#c5b3ee}
      #edge-tab{position:fixed;inset:0;pointer-events:auto;background:#18171c;border-radius:0;color:#d7ccef;padding:8px 1px;font-size:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;overflow:hidden;box-shadow:inset 0 0 0 1px #ffffff0c}#edge-tab:hover{background:#28232f;box-shadow:inset 0 0 0 1px #cbb5f133}
      :host([data-edge="left"]) #edge-tab,:host([data-edge="left"]) .shell.cluster{border-radius:0 12px 12px 0}:host([data-edge="right"]) #edge-tab,:host([data-edge="right"]) .shell.cluster{border-radius:12px 0 0 12px}
      #edge-dots{display:flex;flex-direction:column;align-items:center;gap:4px}.edge-dot{width:3px;height:3px;background:currentColor;border-radius:50%;flex:none}#edge-overflow{font-size:8px;writing-mode:vertical-rl;line-height:9px}#edge-tab.empty::after{content:'';width:2px;height:28px;border-radius:2px;background:#a69bae99}
      .shell.cluster{overflow:hidden;background:#18171c}.shell.cluster .rail{border:0;width:44px;padding:7px 0;gap:6px;background:#18171c}.shell.cluster #rail-unread,.shell.cluster #collapse,.shell.cluster .rail>.spacer{display:none}.shell:not(.cluster) #pill-items,.shell:not(.cluster) #pill-empty{display:none}.shell.cluster #home{flex-shrink:0;width:30px;height:27px;font-size:11px}.shell.cluster #restore{flex-shrink:0;height:25px;width:30px;margin-top:auto;font-size:12px;color:#a99bbb}
      #pill-items{display:flex;flex-direction:column;gap:6px;overflow:auto;min-height:0;padding:2px 4px;scrollbar-width:none}#pill-items::-webkit-scrollbar{display:none}#pill-items .pill-item{position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;min-height:32px;padding:0;background:hsl(var(--pill-hue) 26% 25%);border:1px solid hsl(var(--pill-hue) 25% 39%);border-radius:10px;color:#f1eafc;font-size:11px;font-weight:650}#pill-items .pill-item:hover,#pill-items .pill-item:focus-visible{background:hsl(var(--pill-hue) 28% 36%);border-color:#cebbf5}#pill-items .pill-kind{position:absolute;bottom:-1px;right:-1px;font-size:8px;line-height:11px;min-width:11px;border-radius:4px;background:#11131d;color:#cebdf4}#pill-empty{font-size:14px;color:#acbda9;padding:12px 0}

      #workspace-picker{margin-top:8px;background:#202735;color:inherit;border:1px solid #ffffff15;border-radius:5px;padding:5px;width:100%}.activity-controls{display:flex;gap:6px;margin-top:10px}.activity-controls button{font-size:10px;color:#b5a6d5;padding:3px 5px}#activity-status{font-size:10px;color:#a3a1a9}
      .shell.reply{width:420px;right:auto}.reply-chrome{position:fixed;left:420px;right:0;top:0;height:144px;pointer-events:auto;background:#191f2c;border-bottom:1px solid #ffffff16;padding:12px 16px;color:#cdd4e4;display:flex;flex-direction:column;gap:5px}.reply-chrome strong{font-size:13px}.reply-chrome small{font-size:10px;color:#a3adc0}.reply-chrome nav{display:flex;gap:8px}.reply-chrome button{font-size:11px;padding:3px 7px;background:#ffffff0a}.reply-placeholder{position:fixed;left:420px;right:0;top:144px;bottom:0;pointer-events:auto;background:#191f2c;padding:24px;color:#a3adc0;font-size:13px}
      @media(max-width:650px){.shell.reply{width:44px}.shell.reply .queue{display:none}.reply-chrome,.reply-placeholder{left:44px}}
      @media(prefers-reduced-motion:no-preference){.row{transition:background .12s}#edge-tab{transition:background .16s,box-shadow .16s}.shell.cluster .rail{animation:pill-reveal .18s ease-out}@keyframes pill-reveal{from{opacity:.5}to{opacity:1}}}@media(max-width:650px){.shell.reading .queue{display:none}.reader{width:calc(100vw - 44px)}}
    </style>
    <button id="edge-tab" hidden aria-label="Reveal triage" title="Reveal triage"><span id="edge-dots" aria-hidden="true"></span><span id="edge-overflow" hidden aria-hidden="true"></span></button>
    <button id="opener" aria-label="Open triage"><span class="signal"></span>Triage</button>
    <section class="shell" hidden aria-label="Slack triage">
      <nav class="rail" aria-label="Triage views"><button class="brand" id="home" aria-label="Show queue">T</button><button id="rail-unread" aria-label="Unread observed conversations">●</button><div id="pill-items" aria-label="Unread conversations and threads"></div><span id="pill-empty" hidden title="No active unread items">✓</span><div class="spacer"></div><button id="restore" aria-label="Return to normal Slack" title="Normal Slack">↗</button><button id="collapse" aria-label="Collapse to rail" title="Collapse">›</button></nav>
      <section class="queue"><div class="eyebrow">Your attention, in one place</div><h1>Your attention</h1><div id="workspace"></div><select id="workspace-picker" aria-label="Workspace"></select><div class="scope"><span class="signal"></span><span id="scope">Reading what Slack has loaded</span></div><input id="search" type="search" placeholder="Filter conversations…" aria-label="Filter observed conversations" autocomplete="off">
        <div class="activity-controls"><button id="activity-refresh">Refresh activity</button><button id="activity-more" hidden>More conversations</button></div><div id="activity-status" role="status"></div><div class="filters" role="group" aria-label="Filter activity"><button data-filter="attention" aria-pressed="true">Attention</button><button data-filter="all" aria-pressed="false">All</button><button data-filter="unread" aria-pressed="false">Unread</button><button data-filter="mentions" aria-pressed="false">Mentions</button><button data-filter="dms" aria-pressed="false">DMs</button><button data-filter="threads" aria-pressed="false">Threads</button><button data-filter="later" aria-pressed="false">Later</button><button data-filter="done" aria-pressed="false">Done</button></div><div id="list" aria-label="Observed conversations"></div>
        <div id="notice" role="status"></div>
      </section>
      <section class="reader" hidden aria-label="Captured messages"><div class="reader-header"><button id="back" aria-label="Back to queue">←</button><div class="eyebrow">Message reader</div><h2 id="conversation"></h2><div id="coverage"></div><div class="triage-controls"><button id="done" title="E · Save Done locally, then open the next item">Done →</button><button id="mark-read" title="Mark Slack read through the latest message loaded here. Does not change local Done.">Mark read</button><button id="later" title="L · Snooze locally, then open the next item">Later →</button><select id="snooze" aria-label="Snooze duration" style="background:#202735;color:inherit;border:1px solid #ffffff15;border-radius:5px"><option value="15">15 min</option><option value="60" selected>1 hour</option><option value="240">4 hours</option><option value="1440">24 hours</option></select><button id="pin" title="P · Toggle local pin">Pin</button><button id="reopen" hidden>Bring back</button><button id="undo" hidden>Undo</button></div><div id="mark-status" role="status" style="font-size:11px;color:#b5a6d5;margin-top:8px"></div><div class="history-controls"><button id="refresh">Refresh</button><button id="reply" title="Use Slack’s native editor. Opening the conversation may mark it read.">Native chat</button><button id="handoff" title="Open this conversation in ordinary Slack. Slack may mark it read.">Open in Slack ↗</button><button id="older" hidden>Load older</button></div><div id="history-status" role="status" aria-live="polite"></div></div><div class="messages" id="messages"></div><div class="read-only"><span class="signal"></span>Reading alone does not mark read. Done is local; Mark read updates Slack.</div></section>
    </section><section id="reply-chrome" class="reply-chrome" hidden aria-label="Native Slack conversation"><strong id="reply-destination"></strong><small id="reply-state"></small><nav><button id="reply-queue">← Queue</button><button id="reply-back">Read-only view</button><button id="reply-retry" hidden>Retry</button><button id="reply-stock">Normal Slack ↗</button><button id="reply-collapse">Collapse</button></nav></section><div id="reply-placeholder" class="reply-placeholder" hidden role="status"></div>`;
  document.body.append(host);
  const $ = id => shadow.getElementById(id);
  let snapshot = { workspaces: [] }, mode = 'stock', edge = 'right', filter = 'attention', selection = null;
  let resumeReply=false,openSequence=0,openingKey=null,heldRow=null;
  const detailMode=()=>['reading','reply'].includes(mode);
  let original = null, disposed = false, nativeQueue = Promise.resolve(), previousFocus = null, spacesApplied = false;
  const viewKey='__pme_triage_view_v1';
  try{const view=JSON.parse(sessionStorage.getItem(viewKey)||'{}');resumeReply=view.resumeReply===true;if(typeof view.selection==='string')selection=view.selection;if(['attention','all','unread','dms','threads','later','done','mentions'].includes(view.filter))filter=view.filter;}catch{}
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
    return (!query || item.name.toLocaleLowerCase().includes(query)) &&
      (filter === 'mentions' && (item.mentions>0||item.mentionObserved===true) || filter === 'attention' && (item.triage?.needsAction || heldRow?.key===item.key&&heldRow.filter===filter&&item.triage?.state==='active') || filter === 'later' && item.triage?.state==='later' || filter === 'done' && item.triage?.state==='done' || filter === 'all' || filter === 'unread' && (item.unread === true || heldRow?.key===item.key&&heldRow.filter===filter&&item.triage?.state==='active') || filter === 'dms' && ['dm','groupDM'].includes(item.kind) || filter === 'threads' && item.kind === 'thread');
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
  async function startReply(item=items().find(i=>i.key===selection)||window.__PME_REPLY__?.status().target){
    if(!item)return;
    if(!window.__PME_REPLY__){openReader(item.key);$('notice').textContent='Native chat is unavailable · opened the read-only view.';return;}
    const run=++openSequence;
    heldRow=filtered().some(i=>i.key===item.key)?{key:item.key,filter}:null;
    selection=item.key;resumeReply=false;openingKey=item.key;
    // Mask and cancel the previous editor before waiting for window geometry.
    window.__PME_REPLY__.suspend();
    const destination={...item,workspaceName:item.workspaceName||snapshot.workspaceDirectory?.find(w=>w.id===item.workspaceId)?.name||item.workspaceId};
    await transition('reply');if(run!==openSequence||mode!=='reply'||disposed)return;
    openingKey=null;
    await window.__PME_REPLY__?.open(destination);
    if(run===openSequence&&!disposed)render();
  }
  function renderReply(){
    const reply=window.__PME_REPLY__?.status(),ready=!openingKey&&reply?.ready===true&&reply.target?.key===selection;
    const controls=shadow.querySelector('.triage-controls'),container=mode==='reply'?$('reply-chrome'):shadow.querySelector('.reader-header');
    if(controls.parentElement!==container){if(mode==='reply')container.append(controls);else container.insertBefore(controls,$('mark-status'));}
    $('mark-read').hidden=mode==='reply';
    $('reply-chrome').hidden=mode!=='reply'||ready;$('reply-placeholder').hidden=mode!=='reply'||ready;
    const destination=openingKey?items().find(i=>i.key===openingKey):reply?.target;
    $('reply-destination').textContent=destination?`${destination.workspaceName||snapshot.workspaceDirectory?.find(w=>w.id===destination.workspaceId)?.name||destination.workspaceId} · ${destination.name}${destination.threadTs?' · Thread':''}`:'Native Slack conversation';
    $('reply-state').textContent=openingKey?'Opening native conversation…':ready?'Slack’s editor · ⌘⇧Y collapses and keeps your draft':reply?.reason||'Native reply is unavailable.';
    $('reply-placeholder').textContent=openingKey?'Opening native conversation…':reply?.reason||'Native chat is unavailable. Use Read-only view or Normal Slack.';
    $('reply-retry').hidden=reply?.state!=='error';
  }
  window.addEventListener('pme-native-reply-state',renderReply,{signal:abort.signal});
  window.addEventListener('pme-native-reply-installed',()=>{const r=window.__PME_REPLY__?.status();if(r?.target&&(r.active||mode==='reply'))void startReply(r.target);},{signal:abort.signal});
  function openReader(key){++openSequence;openingKey=null;selection=key;void transition('reading');requestHistory();}
  function openItem(key,{reader=false}={}){if(reader)openReader(key);else void startReply(items().find(i=>i.key===key));}

  // Count actionable unread destinations, never invent an exact message total.
  const pillItems=()=>items().filter(i=>i.unread===true&&!['done','later'].includes(i.triage?.state));
  let pillSignature='',pillHeightSignature='';
  function pillHeight(kind,count){return kind==='strip'?Math.max(88,16+Math.min(count,48)*7+(count>48?32:0)):Math.max(132,96+Math.min(count,12)*38);}
  function renderPill(){
    const unread=pillItems(),count=unread.length;
    const label=`${count} active unread ${count===1?'conversation or thread':'conversations and threads'}`;
    const signature=JSON.stringify([selection,snapshot.workspaces.map(w=>[w.id,w.name]),unread.map(i=>[i.key,i.name,i.kind,i.messages.at(-1)?.text,i.messages.at(-1)?.author])]);
    $('edge-tab').setAttribute('aria-label',`${label}. Reveal triage`);$('edge-tab').title=`${label} · Hover to preview · Click to open triage`;
    $('edge-tab').classList.toggle('empty',!count);
    $('home').textContent=mode==='cluster'?String(count):'T';$('home').title=`${label} · Open queue`;
    $('pill-empty').hidden=!!count||mode!=='cluster';
    if(signature!==pillSignature){
      pillSignature=signature;
      const dots=document.createDocumentFragment();for(let i=0;i<Math.min(count,48);i++)dots.append(el('span','edge-dot'));
      $('edge-dots').replaceChildren(dots);$('edge-overflow').hidden=count<=48;$('edge-overflow').textContent=count>48?`+${count-48}`:'';
      const rail=$('pill-items'),scroll=rail.scrollTop,focused=shadow.activeElement?.classList.contains('pill-item')?shadow.activeElement.dataset.key:null;
      const buttons=document.createDocumentFragment();
      for(const item of unread){
        const kind=item.kind==='thread'?'Thread':item.kind==='channel'?'Channel':item.kind==='groupDM'?'Group chat':'DM';
        const workspace=snapshot.workspaces.find(w=>w.id===item.workspaceId)?.name||'';
        const last=item.messages.at(-1),preview=last?.text?.replace(/\s+/g,' ').trim().slice(0,260)||'No message preview cached yet.';
        const label=`${item.name} · ${kind}${workspace?' · '+workspace:''}\n${last?.author?last.author+': ':''}${preview}`;
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
    try{sessionStorage.setItem(viewKey,JSON.stringify({selection,filter,resumeReply}));}catch{}
    $('workspace').textContent = snapshot.workspaces.map(w => w.name).join(' · ') || 'Waiting for workspace activity…';
    $('scope').textContent = `${items().length} observed · coverage is partial`;
    for (const button of shadow.querySelectorAll('[data-filter]')) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
    const activeWorkspace=snapshot.workspaces[0],activity=activeWorkspace?.activity;
    const waiting=Math.max(0,Math.ceil(((activity?.nextAt||0)-Date.now())/1000));
    const unavailable=!snapshot.customReadsAvailable||!connected()||viewTeam()==='*'||activity?.status==='loading'||activity?.queued||waiting>0;
    $('activity-refresh').disabled=unavailable;
    $('activity-refresh').title='Optional extra Slack API reads for the selected workspace. No background polling.';
    $('activity-more').hidden=viewTeam()==='*'||!activity?.hasMore;$('activity-more').disabled=unavailable;
    const detail=!snapshot.customReadsAvailable?'Custom API reads disabled':viewTeam()==='*'?'Select a workspace for an optional refresh':activity?.status==='loading'?'Refreshing on request…':activity?.queued?'Refresh queued…':
      activity?.status==='error'?activity.error:waiting?`Manual refresh available in ${waiting}s`:activity?.countsAvailable===false?'Some unread/thread information unavailable':activity?.hasMore?'More conversations available on request':'';
    $('activity-status').textContent=snapshot.network==='offline'?'Slack reports offline · cached messages and local triage are available':
      [snapshot.workspaces.some(w=>w.clientState?.at&&Date.now()-w.clientState.at<45000)?'Observing Slack’s cached state · no background polling':'Using Slack’s activity · no background polling',snapshot.workspaces.some(w=>w.clientState?.truncated)?'Cache coverage limited':detail].filter(Boolean).join(' · ');
    const picker=$('workspace-picker'),directory=snapshot.workspaceDirectory||[];
    if(JSON.stringify(directory)!==picker.dataset.signature){picker.replaceChildren();const all=el('option','','All workspaces');all.value='*';picker.append(all);for(const w of directory){const option=el('option','',w.name);option.value=w.id;option.disabled=!w.connected;picker.append(option);}picker.dataset.signature=JSON.stringify(directory);}
    picker.value=viewTeam();picker.disabled=!connected();picker.hidden=directory.length<2;
    const rows = filtered();
    const listScroll = $('list').scrollTop;
    const focusKey = shadow.activeElement?.classList.contains('row')?shadow.activeElement.dataset.key:null;
    $('list').replaceChildren();
    if (!rows.length) $('list').append(el('div','empty',filter === 'all' ? 'No conversations observed yet. Browse a conversation in normal Slack to load it here.' : 'No observed conversations match this filter. This does not mean the workspace has no other activity.'));
    for (const item of rows) {
      const button = el('button', `row${item.key === selection ? ' selected' : ''}`); button.dataset.key = item.key;button.title='Open native Slack conversation · Option-click for read-only view';
      button.setAttribute('aria-pressed', String(item.key === selection));
      const head = el('div','row-head'); head.append(el('span','kind',item.kind === 'thread' ? '↳' : item.kind === 'channel' ? '#' : '◌'),el('span','name',item.name));
      if(item.triage?.pinned)head.append(el('span','badge','Pinned'));
      if (item.unread === true) { const dot = el('span','unread'); dot.title = 'Observed unread'; head.append(dot); }
      if (item.unreadCount !== null && item.unreadCount > 0) head.append(el('span','badge',String(item.unreadCount)));
      button.append(head);
      const last = item.messages.at(-1);
      button.append(el('div','preview',last?.text || (['queued','loading'].includes(item.history?.status)?'Loading messages…':item.history?.status==='error'?'Could not load · open to retry':item.history?.status==='ready'?'No messages returned':'Open to load messages')));
      button.append(el('div','meta',[snapshot.workspaces.length>1?snapshot.workspaces.find(w=>w.id===item.workspaceId)?.name:null,item.kind === 'thread' ? 'Thread' : item.kind === 'channel' ? 'Channel' : 'Direct message', item.unread === null ? 'Unread unknown' : item.countsStale ? 'Unread state may be stale' : item.unread ? 'Unread observed' : 'Read observed',last ? time(last.ts) : null].filter(Boolean).join(' · ')));
      $('list').append(button);
    }
    $('list').scrollTop = listScroll;
    if (focusKey) [...$('list').children].find(e => e.dataset.key === focusKey)?.focus({ preventScroll: true });
    const item = items().find(i => i.key === selection);
    $('conversation').textContent = item?.name || 'Choose a conversation';
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
    host.dataset.edge=edge;
    $('opener').hidden = mode !== 'stock';$('edge-tab').hidden=mode!=='strip';
    shadow.querySelector('.shell').hidden = ['stock','hidden','strip'].includes(mode);
    shadow.querySelector('.shell').classList.toggle('cluster',mode === 'cluster');
    shadow.querySelector('.shell').classList.toggle('reading',mode === 'reading');
    shadow.querySelector('.shell').classList.toggle('reply',mode === 'reply');renderReply();
    shadow.querySelector('.queue').hidden = mode === 'cluster';
    shadow.querySelector('.reader').hidden = mode !== 'reading';
  }
  async function geometry(next) {
    compactBounds=null;
    const w = window.desktop?.window;
    if (!w?.callBrowserWindowMethod) { $('notice').textContent = 'Window controls unavailable; triage uses the current window.'; return; }
    const id = await w.getWindowId(); const call = (method,...args) => w.callBrowserWindowMethod(id,method,...args);
    await call('setWindowButtonVisibility',next==='stock').catch(()=>{});
    if(next==='hidden'){await call('hide');return;}
    if(await call('isMinimized'))await call('restore');
    if(!await call('isVisible'))await call('showInactive');
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
    const width = Math.min({strip:12,cluster:44,queue:420,reading:820,reply:820}[next],area.width);
    await call('setMinimumSize',12,44);
    await call('setAlwaysOnTop',true);
    if(!spacesApplied&&typeof original.spaces==='boolean'){
      await call('setVisibleOnAllWorkspaces',true,{visibleOnFullScreen:true});spacesApplied=true;
    }
    const compact=['cluster','strip'].includes(next);
    const height=compact?Math.min(pillHeight(next,pillItems().length),area.height):area.height;
    const y=compact?area.y+Math.round((area.height-height)/2):area.y;
    const bounds={x:edge==='right'?area.x+area.width-width:area.x,y,width,height};
    await call('setBounds',bounds);
    if(compact)compactBounds=bounds;
  }
  function transition(next) {
    if (disposed || !['stock','hidden','strip','cluster','queue','reading','reply'].includes(next)) return Promise.resolve();
    clearTimeout(hoverTimer);hoverIntent=null;
    setPillPreview(null);
    if(next!=='reply'){++openSequence;openingKey=null;}
    nativeQueue = nativeQueue.catch(()=>{}).then(async()=>{
      if(disposed)return;
      if (mode === 'stock' && next !== 'stock') previousFocus = document.activeElement;
      if(mode==='reply'&&next!=='reply'){resumeReply=['strip','hidden','cluster'].includes(next);window.__PME_REPLY__?.suspend();}
      if(next==='stock')resumeReply=false;
      if(['stock','queue'].includes(next))heldRow=null;
      mode=next;applyLayout();render();
      try { await geometry(next); } catch { $('notice').textContent='Window layout could not be applied. Normal Slack restores the saved layout.'; }
      if (next === 'queue') $('search').focus({preventScroll:true});
      if (next === 'reading') $('back').focus({preventScroll:true});
      if (next === 'reply') $('reply-back').focus({preventScroll:true});
      if (next === 'strip') $('edge-tab').focus({preventScroll:true});
      if (next === 'cluster') $('home').focus({preventScroll:true});
      if (next === 'stock') previousFocus?.focus?.({preventScroll:true});
      reportShell(['strip','hidden','cluster'].includes(next));
    });return nativeQueue;
  }
  shadow.addEventListener('click',event=>{
    event.stopPropagation();const button=event.target.closest('button');if(!button)return;
    lastInteraction=Date.now();clearTimeout(hoverTimer);hoverIntent=null;
    if(button.dataset.key)openItem(button.dataset.key,{reader:event.altKey});
    else if(button.dataset.thread)openItem(button.dataset.thread);
    else if(['done','later','pin','reopen','undo'].includes(button.id))localAction(button.id);
    else if(button.id==='mark-read')markRead();
    else if(button.id==='reply'||button.id==='reply-retry')void startReply(button.id==='reply-retry'?window.__PME_REPLY__?.status().target:undefined);
    else if(button.id==='reply-back')openReader(selection);
    else if(button.id==='reply-queue')void transition('queue');
    else if(button.id==='reply-stock')void transition('stock');
    else if(button.id==='reply-collapse')void transition(restMode());
    else if(button.id==='handoff')void handoff();
    else if(['activity-refresh','activity-more'].includes(button.id))window.__pmeTriageAction?.(JSON.stringify({workspaceId:viewTeam(),action:'activity',more:button.id==='activity-more'}));
    else if(button.id==='refresh')requestHistory('refresh');
    else if(button.id==='older')requestHistory('older');
    else if(button.dataset.filter){filter=button.dataset.filter;render();}
    else if(['opener','home','edge-tab'].includes(button.id)){if(resumeReply&&window.__PME_REPLY__?.status().target)void startReply(window.__PME_REPLY__.status().target);else void transition('queue');}
    else if(button.id==='rail-unread'){filter='unread';void transition('queue');}
    else if(button.id==='restore')void transition('stock');
    else if(button.id==='collapse')void transition(mode==='cluster'?'queue':restMode());
    else if(button.id==='back')void transition('queue');
  },{signal:abort.signal});
  $('workspace-picker').addEventListener('change',()=>window.__pmeTriageAction?.(JSON.stringify({workspaceId:viewTeam(),action:'switch',target:$('workspace-picker').value})),{signal:abort.signal});
  $('search').addEventListener('input',render,{signal:abort.signal});
  document.addEventListener('keydown',event=>{
    lastInteraction=Date.now();
    if ((event.metaKey||event.ctrlKey)&&event.shiftKey&&event.code==='KeyY'&&(!snapshot.nativeHotkey||!connected())){
      event.preventDefault();event.stopImmediatePropagation();void command('toggle');return;
    }
    if (mode==='stock')return;
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
      void transition('queue');return;
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
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();void transition(detailMode()?'queue':restMode());return;}
    if(!event.composedPath().includes(host))return;
    if(typing&&shadow.activeElement!==$('search'))return;
    if(['ArrowDown','ArrowUp'].includes(event.key)){
      event.preventDefault();event.stopImmediatePropagation();const list=filtered();if(!list.length)return;
      const index=list.findIndex(i=>i.key===selection);selection=list[index<0?(event.key==='ArrowDown'?0:list.length-1):(index+(event.key==='ArrowDown'?1:-1)+list.length)%list.length].key;render();
      if(mode==='reading')requestHistory();
      else if(mode==='reply')openItem(selection);
      [...$('list').children].find(e=>e.dataset.key===selection)?.scrollIntoView({block:'nearest'});
    }else if(event.key==='Enter'&&!event.isComposing){
      if(shadow.activeElement===$('search')){event.preventDefault();event.stopImmediatePropagation();const list=filtered();selection=list.some(i=>i.key===selection)?selection:list[0]?.key;if(selection)openItem(selection);}
    }
  },{capture:true,signal:abort.signal});

  function reportShell(returnFocus=false,resumed=false){window.__pmeShellState?.(JSON.stringify({workspaceId:team(),mode,focused:document.hasFocus(),returnFocus,resumed,online:navigator.onLine,displays:displayInfo,preview:pillPreview}));}
  function setPillPreview(button){
    const rect=button?.getBoundingClientRect();
    const next=mode==='cluster'&&compactBounds&&rect?{key:button.dataset.key,edge,anchor:{x:compactBounds.x+rect.x,y:compactBounds.y+rect.y,width:rect.width,height:rect.height}}:null;
    if(JSON.stringify(next)!==JSON.stringify(pillPreview)){pillPreview=next;reportShell();}
  }
  async function command(op){
    const next=op==='toggle'?(['reading','queue','reply'].includes(mode)?restMode():'queue'):op==='rest'?restMode():op==='hide'?'hidden':op;
    if(op==='toggle'&&resumeReply&&['stock','strip','cluster','hidden'].includes(mode)&&window.__PME_REPLY__?.status().target){await startReply(window.__PME_REPLY__.status().target);const w=desktop.window;await w.callBrowserWindowMethod(await w.getWindowId(),'focus');return {mode};}
    if(op==='minimize'){const w=desktop.window;await w.callBrowserWindowMethod(await w.getWindowId(),'minimize');reportShell(true);return {mode,returnFocus:true};}
    if(!['stock','hidden','strip','cluster','queue','reading','reply'].includes(next))return {mode};
    lastInteraction=Date.now();await transition(next);
    if(['stock','queue','reading','reply'].includes(next)){const w=desktop.window;await w.callBrowserWindowMethod(await w.getWindowId(),'focus');}
    return {mode,returnFocus:['strip','hidden','cluster'].includes(mode)};
  }
  function pillHover(inside){
    if(inside)lastInteraction=Date.now();
    const intent=inside&&mode==='strip'?'cluster':!inside&&mode==='cluster'&&restMode()==='strip'?'strip':null;
    if(intent===hoverIntent)return;
    clearTimeout(hoverTimer);hoverIntent=intent;
    if(intent){
      const from=mode;
      hoverTimer=setTimeout(async()=>{
        let visible=true;
        try{const w=window.desktop?.window;if(w?.callBrowserWindowMethod){const id=await w.getWindowId();visible=await w.callBrowserWindowMethod(id,'isVisible')&&!await w.callBrowserWindowMethod(id,'isMinimized');}}catch{visible=false;}
        if(!disposed&&mode===from&&hoverIntent===intent){hoverIntent=null;if(visible)void transition(intent);}
      },inside?180:600);
    }
  }
  shadow.addEventListener('pointermove',()=>{lastInteraction=Date.now();if(['strip','cluster'].includes(mode))pillHover(true);},{signal:abort.signal});
  host.addEventListener('pointerleave',()=>{pillHover(false);setPillPreview(null);},{signal:abort.signal});
  host.addEventListener('pointerenter',()=>pillHover(true),{signal:abort.signal});
  $('edge-tab').addEventListener('pointerenter',()=>pillHover(true),{signal:abort.signal});
  $('edge-tab').addEventListener('pointerleave',()=>{if(mode==='strip')pillHover(false);},{signal:abort.signal});
  // Inactive macOS windows may receive no DOM hover events. This reads only the
  // local pointer, never Slack state/network, and never activates the window.
  const cursorTimer=setInterval(async()=>{
    const bounds=compactBounds,currentMode=mode;
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
    const pulse=Date.now();reportShell(false,pulse-lastPulse>15000);lastPulse=pulse;
    if(hostDisconnected===connected()){hostDisconnected=!connected();render();}
    if(['queue','cluster'].includes(mode)&&settings.idleSeconds>0&&Date.now()-lastInteraction>settings.idleSeconds*1000)void transition(restMode());
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
  window.__PME_TRIAGE__={version:'0.15.3',update:value=>{lastHostUpdate=Date.now();hostDisconnected=false;const before=JSON.stringify(settings);snapshot=value;acceptLocalResult();settings={...settings,...value.settings};edge=settings.edge;render();if(before!==JSON.stringify(settings)&&!['stock','hidden'].includes(mode))void transition(mode);},transition,command,open:openItem,
    status:()=>({mode,edge,reply:window.__PME_REPLY__?.status().state,connected:connected(),network:snapshot.network||'unknown',workspace:viewTeam(),items:items().length,messages:items().reduce((n,i)=>n+i.messages.length,0),...domHealth}),
    dispose:async()=>{if(disposed)return;setPillPreview(null);disposed=true;abort.abort();observer.disconnect();clearTimeout(domTimer);clearInterval(idle);clearInterval(shellTimer);clearInterval(cursorTimer);clearTimeout(hoverTimer);
      window.__PME_REPLY__?.suspend();await nativeQueue.catch(()=>{});await geometry('stock').catch(()=>{});host.remove();delete window.__PME_TRIAGE__;
    }};
  observe();render();
  if(window.__PME_REPLY__?.status().active&&window.__PME_REPLY__.status().target)void startReply(window.__PME_REPLY__.status().target);
  else if(savedLayout)void transition(['reading','reply'].includes(savedLayout.mode)?'queue':savedLayout.mode);
})();
