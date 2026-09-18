import fs from 'node:fs/promises';
import path from 'node:path';
const { ActivityStore, READ_METHODS, requestMetadata, workspaceID } = await import(`./activity-store.mjs?revision=${Date.now()}`);
const { createActivityRefresher } = await import(`./activity-refresh.mjs?revision=${Date.now()}`);
const { createHistoryLoader } = await import(`./history-loader.mjs?revision=${Date.now()}`);
const { createReadMarker } = await import(`./read-marker.mjs?revision=${Date.now()}`);
const { createShellServer } = await import(`./shell-server.mjs?revision=${Date.now()}`);
const { createModLoader } = await import(`./mod-loader.mjs?revision=${Date.now()}`);
const { TriageState } = await import(`./triage-state.mjs?revision=${Date.now()}`);

const teamFromURL = value => { try { const url = new URL(value); if (url.origin !== 'https://app.slack.com') return null;
  return url.pathname.match(/^\/client\/([TE][A-Z0-9]+)(?:\/|$)/)?.[1] || null; } catch { return null; } };
export async function createRuntime({ cdp, sessions, root, runtimeDir=path.join(root,'.lab/dev'), slackPID=0, slackVersion }) {
  const store = new ActivityStore({maxMessagesPerItem:200,maxWorkspaces:12});
  const local=await new TriageState(path.join(runtimeDir,'triage-state.json')).load();
  let actionError=null,returnEpoch=0,nativeHotkey=false;
  const knownWorkspaces=new Map(),selectedWorkspaces=new Map();
  const uiStates=new Map(),actionResults=new Map();let lastSnapshot={workspaces:[]};
  const sessionInfo=JSON.parse(await fs.readFile(path.join(runtimeDir,'session.json'),'utf8').catch(()=>'{}'));

  const requests = new Map(), attached = new Set();
  const observedMethods = new Map(), shapes = new Map();
  const customApi={since:Date.now(),requests:0,ratelimited:0,authFailed:0,methods:{}};
  const metricMethods=new Set(['auth.test','users.conversations','client.counts','subscriptions.thread.getView','conversations.history','conversations.replies','users.info','conversations.mark']);
  const socketTypes = new Map();
  const stats = { readResponses: 0, domSnapshots: 0, clientStateSnapshots:0, skippedBodies: 0, errors: 0, lastPush: 0 };
  const mods=await createModLoader({cdp,root,runtimeDir,slackVersion});
  let disposed = false, polling = false, bodyReads = 0;
  const entryFor = sessionId => [...sessions.values()].find(e => e.sessionId === sessionId);
  const evaluate = (e, expression) => cdp.evaluate(expression, e.sessionId);
  const history = createHistoryLoader({store,read:async request=>{
    const entry=pickEntry(request.workspaceId)||pickEntry();
    if(!entry)return {ok:false,error:'workspace_changed'};
    if(!mods.enabled('history-reader'))return {ok:false,error:'adapter_disabled'};
    return evaluate(entry,`window.__PME_READS__?.read(${JSON.stringify(request)})`);
  }});
  const readMarker=createReadMarker({store,onResult:()=>{},mark:async request=>{
    if(!mods.enabled('mark-read'))return {ok:false,error:'adapter_disabled'};
    const entry=pickEntry(request.workspaceId)||pickEntry();if(!entry)return {ok:false,error:'workspace_changed'};
    return evaluate(entry,`window.__PME_MARK_READ__?.mark(${JSON.stringify(request)})`);
  }});

  function pickEntry(workspaceId){return [...sessions.values()].filter(e=>teamFromURL(e.url)&&(!workspaceId||teamFromURL(e.url)===workspaceId)).sort((a,b)=>(uiStates.get(b.sessionId)?.activeAt||0)-(uiStates.get(a.sessionId)?.activeAt||0))[0];}
  const scopeFor=entry=>selectedWorkspaces.get(entry.sessionId)||(local.settings.workspace==='*'||knownWorkspaces.has(local.settings.workspace)?local.settings.workspace:null)||teamFromURL(entry.url);
  const inScope=(entry,workspace)=>workspace===scopeFor(entry)||scopeFor(entry)==='*'&&knownWorkspaces.has(workspace);
  async function shellCommand(op,workspaceId){const entry=pickEntry(workspaceId)||pickEntry();if(!entry)throw Error('No connected workspace');
    if(op==='switch'&&knownWorkspaces.has(workspaceId)){selectedWorkspaces.set(entry.sessionId,workspaceId);await local.configure({workspace:workspaceId});}
    if(op==='stock'&&!await evaluate(entry,'!!window.__PME_TRIAGE__')){await evaluate(entry,`(async()=>{const w=desktop.window,id=await w.getWindowId();await w.callBrowserWindowMethod(id,'show');await w.callBrowserWindowMethod(id,'focus');})()`);return {mode:'stock'};}
    return evaluate(entry,`window.__PME_TRIAGE__?.command(${JSON.stringify(op==='switch'?'queue':op)})`);
  }
  const shell=await createShellServer({file:path.join(runtimeDir,'shell.sock'),
    state:request=>{if(typeof request.hotKeyOK==='boolean')nativeHotkey=request.hotKeyOK;return {slackPID:slackPID||sessionInfo.slackPid||0,returnEpoch,settings:local.settings,
      attention:lastSnapshot.workspaces.reduce((n,w)=>n+w.items.filter(i=>i.triage?.needsAction).length,0),
      displays:[...uiStates.values()].find(s=>s.displays?.length)?.displays||[],
      workspaces:[...knownWorkspaces.values()].map(w=>({...w,connected:true}))};},
    configure:async patch=>{await local.configure(patch);return {settings:local.settings};},command:shellCommand});
  const refreshes=createActivityRefresher({load:async request=>{
    const entry=pickEntry(request.workspaceId)||pickEntry();
    if(!entry||!mods.enabled('history-reader'))return {ok:false,error:'adapter_disabled'};
    return evaluate(entry,`window.__PME_READS__?.activity(${JSON.stringify(request)})`);
  },onData:(workspaceId,result)=>{
    store.ingest({method:'users.conversations',workspaceId},{ok:true,channels:result.channels,users:result.users});
    if(result.counts)store.ingest({method:'client.counts',workspaceId},result.counts);
    if(result.threads)store.ingest({method:'subscriptions.thread.getView',workspaceId},result.threads);
  }});
  function refreshActivity(entry,more=false,workspaceId=scopeFor(entry)){
    // Enrichment is explicit and scoped: All workspaces must not fan out API calls.
    if(workspaceId!=='*')refreshes.request(workspaceId,{more,reason:'manual'});
  }
  function syncConnectivity(){
    const reports=[...uiStates.values()].filter(s=>typeof s.online==='boolean');
    refreshes.setOnline(!reports.length||reports.some(s=>s.online));
  }
  async function attach(entry) {
    if (attached.has(entry.sessionId)) return;
    await cdp.send('Network.enable', { maxTotalBufferSize: 12 * 1024 * 1024, maxResourceBufferSize: 4 * 1024 * 1024 }, entry.sessionId);
    await cdp.send('Runtime.addBinding', { name: '__pmeReadOnlySnapshot' }, entry.sessionId);
    await cdp.send('Runtime.addBinding', { name: '__pmeLoadHistory' }, entry.sessionId);
    await cdp.send('Runtime.addBinding', { name: '__pmeTriageAction' }, entry.sessionId);
    await cdp.send('Runtime.addBinding', { name: '__pmeShellState' }, entry.sessionId);
    await cdp.send('Runtime.addBinding', { name: '__pmeApiMetric' }, entry.sessionId);
    await cdp.send('Runtime.addBinding', { name: '__pmeClientState' }, entry.sessionId);
    await mods.reconcile(entry);
    attached.add(entry.sessionId);
  }
  function event(message) {
    if (disposed) return;
    const entry = entryFor(message.sessionId);
    if (!entry) return;
    const p = message.params;
    if(message.method==='Runtime.bindingCalled'&&p.name==='__pmeClientState'){
      if(typeof p.payload!=='string'||p.payload.length>300000)return;
      try{const r=JSON.parse(p.payload),current=teamFromURL(entry.url);
        if(!current||r.rendererWorkspaceId!==current||!workspaceID(r.workspaceId))return;
        for(const w of Array.isArray(r.knownWorkspaces)?r.knownWorkspaces.slice(0,12):[])if(workspaceID(w.id)&&typeof w.name==='string'){
          knownWorkspaces.set(w.id,{id:w.id,name:w.name.slice(0,180)});store.workspace(w.id).name=w.name.slice(0,180);
        }
        if(r.workspaceId!==current&&!knownWorkspaces.has(r.workspaceId))return;
        if(store.ingestClientState(r))stats.clientStateSnapshots++;
      }catch{stats.errors++;}return;
    }
    if(message.method==='Runtime.bindingCalled'&&p.name==='__pmeApiMetric'){
      if(!teamFromURL(entry.url)||typeof p.payload!=='string'||p.payload.length>250)return;
      try{const r=JSON.parse(p.payload);
        if(!['read','mark-read'].includes(r.adapter)||!metricMethods.has(r.method))return;
        if(r.event==='request'){customApi.requests++;customApi.methods[r.method]=(customApi.methods[r.method]||0)+1;}
        else if(r.event==='ratelimited')customApi.ratelimited++;
        else if(r.event==='auth_failed')customApi.authFailed++;
      }catch{}return;
    }
    if(message.method==='Runtime.bindingCalled'&&p.name==='__pmeShellState'){
      if(typeof p.payload!=='string'||p.payload.length>4000)return;
      try{const r=JSON.parse(p.payload);if(r.workspaceId!==teamFromURL(entry.url))return;
        const previous=uiStates.get(entry.sessionId)||{};
        uiStates.set(entry.sessionId,{...previous,mode:r.mode,online:typeof r.online==='boolean'?r.online:previous.online,activeAt:r.focused?Date.now():previous.activeAt,
          displays:Array.isArray(r.displays)?r.displays.filter(d=>typeof d.id==='string'&&/^\d+$/.test(d.id)&&typeof d.name==='string').slice(0,12):previous.displays});
        syncConnectivity();if(r.resumed===true)refreshes.resume();
        if(r.returnFocus===true)returnEpoch++;
      }catch{}return;
    }
    if(message.method==='Runtime.bindingCalled'&&p.name==='__pmeTriageAction'){
      if(typeof p.payload!=='string'||p.payload.length>2000)return;
      try{const r=JSON.parse(p.payload),workspace=teamFromURL(entry.url);
        if(!workspace||!inScope(entry,r.workspaceId))return;
        if(r.action==='activity'){void refreshActivity(entry,r.more===true);return;}
        if(r.action==='switch'&&(r.target==='*'||knownWorkspaces.has(r.target))){selectedWorkspaces.set(entry.sessionId,r.target);void local.configure({workspace:r.target}).catch(()=>{actionError='Could not save workspace preference.';});return;}
        const item=store.workspaces.get(r.workspaceId)?.items.get(r.key);
        if(r.action==='mark-read'){void readMarker.mark(r.workspaceId,r.key,r.ts);return;}
        const requestId=typeof r.requestId==='string'&&/^[a-z0-9-]{1,60}$/.test(r.requestId)?r.requestId:null;
        const task=r.action==='settings'?local.configure(r.patch||{}):item?local.act(item,r.action,{minutes:r.minutes}):Promise.resolve(false);
        void task.then(ok=>{actionError=null;if(requestId)actionResults.set(entry.sessionId,{requestId,ok:ok===true,key:r.key,action:r.action});}).catch(()=>{actionError='Could not save local changes. Your previous state is intact.';if(requestId)actionResults.set(entry.sessionId,{requestId,ok:false,key:r.key,action:r.action});});
      }catch{}return;
    }
    if(message.method==='Runtime.bindingCalled'&&p.name==='__pmeLoadHistory'){
      if(typeof p.payload!=='string'||p.payload.length>1000)return;
      try{const request=JSON.parse(p.payload),workspace=teamFromURL(entry.url);
        if(workspace&&inScope(entry,request.workspaceId))void history.load(request.workspaceId,request.key,request.action);
      }catch{/* Invalid requests never reach the API adapter. */}
      return;
    }
    if (message.method === 'Network.webSocketFrameReceived' && p.response?.opcode === 1 && p.response.payloadData.length < 512000) {
      try {
        const frame = JSON.parse(p.response.payloadData);
        const type = typeof frame.type === 'string' ? frame.type : 'unknown';
        if (socketTypes.size < 80 || socketTypes.has(type)) socketTypes.set(type, (socketTypes.get(type) || 0) + 1);
        const current=teamFromURL(entry.url);
        const sourceTeam=frame.team||frame.team_id;
        const candidates=[...store.workspaces.values()].filter(w=>w.items.has(`${w.id}:${frame.channel}:`));
        const eventTeam=sourceTeam?(workspaceID(sourceTeam)&&(knownWorkspaces.has(sourceTeam)||sourceTeam===current)?sourceTeam:null):candidates.length===1?candidates[0].id:null;
        if(current&&type==='hello')refreshes.resume();
        if(current)store.ingestEvent(eventTeam, frame);
      } catch { /* Non-JSON or unsupported frames are ignored. */ }
    }
    if (message.method === 'Page.frameNavigated' && !p.frame.parentId) entry.url = p.frame.url;
    if (message.method === 'Network.requestWillBeSent') {
      // Slack can issue background-team requests from the visible team's page.
      // A page URL is therefore not sufficient evidence of response ownership.
      const meta = requestMetadata(p.request, null);
      if (!meta) return;
      observedMethods.set(meta.method, (observedMethods.get(meta.method) || 0) + 1);
      if (observedMethods.size > 150) observedMethods.delete(observedMethods.keys().next().value);
      if (READ_METHODS.has(meta.method) && teamFromURL(entry.url) && meta.workspaceId &&
          (meta.workspaceId===teamFromURL(entry.url)||knownWorkspaces.has(meta.workspaceId))) {
        requests.set(`${entry.sessionId}:${p.requestId}`, { meta, at: Date.now() });
        if (requests.size > 500) requests.delete(requests.keys().next().value);
      }
    }
    if (message.method === 'Network.loadingFailed') requests.delete(`${entry.sessionId}:${p.requestId}`);
    if (message.method === 'Network.loadingFinished') {
      const key = `${entry.sessionId}:${p.requestId}`;
      const request = requests.get(key); requests.delete(key);
      if (!request) return;
      if (bodyReads >= 4 || p.encodedDataLength > 4 * 1024 * 1024) { stats.skippedBodies++; return; }
      bodyReads++;
      void cdp.send('Network.getResponseBody', { requestId: p.requestId }, entry.sessionId).then(result => {
        if (disposed) return;
        if (result.body.length > 6 * 1024 * 1024) { stats.skippedBodies++; return; }
        const raw = JSON.parse(result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body);
        // Only structural field names reach diagnostics. Bodies, headers, tokens,
        // IDs, names and messages are never written by the collector to disk.
        shapes.set(request.meta.method, { keys: Object.keys(raw).slice(0, 50),
          arrays: Object.fromEntries(Object.entries(raw).filter(([,v]) => Array.isArray(v) && v.length).slice(0, 12)
            .map(([k,v]) => [k, typeof v[0] === 'object' && v[0] ? Object.keys(v[0]).slice(0, 35) : [typeof v[0]]])) });
        if (store.ingest(request.meta, raw)) stats.readResponses++;
      }).catch(() => { stats.errors++; }).finally(() => { bodyReads--; });
    }
    if (message.method === 'Runtime.bindingCalled' && p.name === '__pmeReadOnlySnapshot') {
      if (p.payload.length > 350000) return;
      try {
        const observation = JSON.parse(p.payload);
        const currentWorkspace = teamFromURL(entry.url);
        if (!workspaceID(observation.workspaceId) || currentWorkspace !== observation.workspaceId) return;
        for(const w of Array.isArray(observation.knownWorkspaces)?observation.knownWorkspaces.slice(0,12):[])if(workspaceID(w.id)&&typeof w.name==='string'){knownWorkspaces.set(w.id,{id:w.id,name:w.name.slice(0,180)});const ws=store.workspace(w.id);ws.name=w.name.slice(0,180);}
        store.ingestDOM(observation); stats.domSnapshots++;
      } catch { stats.errors++; }
    }
  }
  cdp.on('event', event);
  let lastTick=Date.now();
  const timer = setInterval(async () => {
    if (disposed || polling) return; polling = true;
    try {
      const tick=Date.now();if(tick-lastTick>15000)refreshes.resume();lastTick=tick;
      if(mods.enabled('history-reader'))refreshes.tick(new Set([...sessions.values()].map(e=>teamFromURL(e.url)).filter(Boolean).concat([...knownWorkspaces.keys()])));
      for (const [key, req] of requests) if (Date.now() - req.at > 30000) requests.delete(key);
      const snapshot = store.snapshot();
      snapshot.settings=local.settings;snapshot.nativeHotkey=shell.connected()&&nativeHotkey;snapshot.localError=local.error||actionError;
      snapshot.canUndo=!!local.undo&&Date.now()-local.undo.at<30000;
      snapshot.undoKey=snapshot.canUndo?local.undo.key:null;
      snapshot.apiPolicy='manual-only';snapshot.customReadsAvailable=mods.enabled('history-reader');snapshot.markReadAvailable=mods.enabled('mark-read');snapshot.network=refreshes.status().online?'available':'offline';
      for(const workspace of snapshot.workspaces)for(const item of workspace.items){item.triage=local.project(item);item.readMark=readMarker.state(item.key);}
      snapshot.workspaceDirectory=[...knownWorkspaces.values()].map(w=>({...w,connected:true,stale:refreshes.get(w.id).status!=='ready'||Date.now()-(refreshes.get(w.id).countsAt||0)>150000}));
      for(const w of snapshot.workspaces)w.activity=refreshes.get(w.id);
      lastSnapshot=snapshot;
      for (const entry of sessions.values()) {
        const workspace = teamFromURL(entry.url);
        if (!workspace) continue;
        // Deliver the explicitly selected scope only to a still-authorized Slack page.
        const scope=scopeFor(entry);
        const scoped = { ...snapshot, actionResult:actionResults.get(entry.sessionId)||null,selectedWorkspace:scope,workspaces: snapshot.workspaces.filter(w => scope==='*'?knownWorkspaces.has(w.id):w.id===scope) };
        await mods.reconcile(entry);
        await evaluate(entry, `if(location.origin==='https://app.slack.com' && location.pathname.match(/^\\/client\\/([TE][A-Z0-9]+)(?:\\/|$)/)?.[1]===${JSON.stringify(workspace)})window.__PME_TRIAGE__?.update(${JSON.stringify(scoped)})`);
      }
      stats.lastPush = Date.now();
    } catch { /* Reloads destroy execution contexts; next tick recovers. */ }
    finally { polling = false; }
  }, 1500);
  return {
    attach,
    async detach(entry) { attached.delete(entry.sessionId);uiStates.delete(entry.sessionId);actionResults.delete(entry.sessionId);selectedWorkspaces.delete(entry.sessionId);mods.detach(entry);syncConnectivity(); },
    status: () => ({ ...store.status(), ...stats, customApi:{...customApi,methods:{...customApi.methods}}, methods: Object.fromEntries(observedMethods), shapes: Object.fromEntries(shapes), socketTypes: Object.fromEntries(socketTypes),
      shell:{connected:shell.connected(),hotkeyRegistered:nativeHotkey},network:refreshes.status().online?'available':'offline',apiPolicy:'manual-only',refreshQueue:{active:refreshes.status().active,queued:refreshes.status().queued},activity:refreshes.status().workspaces.map(a=>({status:a.status,at:a.at,attemptAt:a.attemptAt,nextAt:a.nextAt,hasMore:a.hasMore,countsAvailable:a.countsAvailable,threadsAvailable:a.threadsAvailable})),history:history.status(),mode: 'triage-with-native-reply', mods:mods.status(),liveUI:mods.enabled('triage-surface'), partial: true }),
    async dispose() {
      if(disposed)return;
      disposed = true; clearInterval(timer); cdp.off('event', event);
      history.dispose();readMarker.dispose();refreshes.dispose();await shell.close();await mods.dispose(sessions);
      for (const e of sessions.values()) {
        await cdp.send('Runtime.removeBinding', { name: '__pmeReadOnlySnapshot' }, e.sessionId).catch(() => {});
        await cdp.send('Runtime.removeBinding', { name: '__pmeLoadHistory' }, e.sessionId).catch(() => {});
        await cdp.send('Runtime.removeBinding', { name: '__pmeTriageAction' }, e.sessionId).catch(() => {});
        await cdp.send('Runtime.removeBinding', { name: '__pmeShellState' }, e.sessionId).catch(() => {});
        await cdp.send('Runtime.removeBinding', { name: '__pmeApiMetric' }, e.sessionId).catch(() => {});
        await cdp.send('Runtime.removeBinding', { name: '__pmeClientState' }, e.sessionId).catch(() => {});
        await cdp.send('Network.disable', {}, e.sessionId).catch(() => {});
      }
      // Complete already accepted local decisions before shutdown returns.
      await local.tail.catch(()=>{});
      requests.clear(); attached.clear(); store.workspaces.clear();
    }
  };
}
