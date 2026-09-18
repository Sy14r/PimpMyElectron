(async () => {
  if (location.origin !== 'https://app.slack.com' || location.pathname !== '/ssb/first') throw Error('Signed-out lab only');
  await window.__PME_TRIAGE_LAB__?.dispose();
  const w = window.desktop?.window;
  if (!w?.callBrowserWindowMethod) throw Error('Slack window bridge unavailable');
  const id = await w.getWindowId();
  const call = (method, ...args) => w.callBrowserWindowMethod(id, method, ...args);
  const original = { bounds: await call('getBounds'), min: await call('getMinimumSize'), top: await call('isAlwaysOnTop') };
  const display = (await desktop.screen.getAllDisplays())[0].workArea;
  const abort = new AbortController();
  const host = document.createElement('div');
  host.id = 'pme-triage-lab';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#151925';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host{font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:#e9ecf5}
      *{box-sizing:border-box}button,textarea{font:inherit}button{cursor:pointer;color:inherit}
      button:focus-visible{outline:2px solid #d0bdff;outline-offset:2px}
      button{border:1px solid #ffffff16;background:#ffffff06;border-radius:9px;padding:8px 11px}
      button:hover{background:#ffffff12}.app{display:flex;height:100vh;min-height:100px}
      nav{width:44px;flex-shrink:0;background:#11151f;display:flex;flex-direction:column;align-items:center;padding:12px 0;gap:9px;border-right:1px solid #ffffff0e}
      nav button{width:32px;height:32px;padding:0;font-size:11px;background:#323245}
      nav .brand{background:#afa1eb;color:#12121c;font-weight:800}.spacer{flex:1}
      .list{width:344px;flex-shrink:0;padding:23px 18px;border-right:1px solid #ffffff0e}
      .eyebrow{font-size:10px;letter-spacing:1.5px;color:#aaa0cb;text-transform:uppercase}
      h1{font-size:25px;line-height:1.2;margin:9px 0 8px;letter-spacing:-.6px}
      .muted{color:#8c96ad;font-size:12px}.filters{display:flex;gap:6px;margin:22px 0 18px}.filters span{padding:4px 9px;border-radius:20px;background:#ffffff07;font-size:11px}.filters .active{background:#b09dec26;color:#c4b6ee}
      .row{display:block;text-align:left;width:100%;padding:15px 12px;margin-bottom:7px;border-radius:11px}.row strong{display:block;font-size:13px}.row small{color:#8995ab}.row p{font-size:12px;margin:7px 0 0;color:#aeb8cb}.row.selected{background:#b09dec13;border-color:#b09dec42}
      .dot{float:right;margin-top:6px;width:6px;height:6px;border-radius:50%;background:#b9abef}
      .bottom{margin-top:23px;display:flex;gap:7px}.bottom button{font-size:11px;padding:6px 8px}
      .reading{flex:1;min-width:0;padding:24px;background:#191e2b}.reading h2{font-size:17px;margin:8px 0 4px}.message{margin-top:32px;display:flex;gap:10px}.avatar{background:#394853;border-radius:9px;width:33px;height:33px;display:grid;place-items:center;flex-shrink:0;font-size:11px}.message p{font-size:13px;color:#c3cad8;margin-top:7px}.draft{margin-top:36px;border:1px solid #ffffff1f;border-radius:12px;padding:12px}textarea{background:transparent;border:0;resize:none;color:#c3cad8;width:100%;height:90px;outline:none}.draft button{font-size:11px;color:#b8a9e7}.note{font-size:10px;color:#76839c;margin-top:18px}
      [hidden]{display:none!important}
    </style>
    <div class="app">
      <nav aria-label="Triage controls"><button class="brand" data-mode="expanded" aria-label="Expand triage">L</button><button data-mode="reading" aria-label="Open sample conversation">AR</button><button data-mode="expanded" aria-label="Show queue">JM</button><div class="spacer"></div><button data-mode="expanded" aria-label="Expand">›</button></nav>
      <section class="list">
        <div class="eyebrow">Triage lab · synthetic data</div><h1>Waiting for you</h1><div class="muted">A small queue, beside your work.</div>
        <div class="filters"><span class="active">Priority · 3</span><span>DMs</span><span>Threads</span></div>
        <button class="row selected" data-mode="reading"><span class="dot"></span><strong>Alex Rivera</strong><small>Direct message · 4m</small><p>One quick decision on the launch brief.</p></button>
        <button class="row" data-mode="reading"><strong># product-design</strong><small>Thread mention · 12m</small><p>Your feedback is the last open item.</p></button>
        <button class="row" data-mode="reading"><strong>Jamie Morgan</strong><small>Direct message · 28m</small><p>Can wait until your next break.</p></button>
        <div class="bottom"><button id="dock">Dock left</button><button data-mode="cluster">Collapse</button></div>
        <p class="note">⌘⇧Y expands / collapses · Esc steps back<br>This is an experiment inside the official Slack window.</p>
      </section>
      <section class="reading" hidden><div class="eyebrow">A little more context</div><h2>Alex Rivera</h2><div class="muted">Sample conversation</div><div class="message"><div class="avatar">AR</div><div><strong>Alex</strong><p>Ready to share the brief. Does Thursday work, or should we leave a little more room?</p></div></div><div class="draft"><textarea aria-label="Synthetic draft" placeholder="Keep a thought here…"></textarea><button id="done">Done for now</button></div><p class="note">Local mock only. Nothing is sent, read, or marked read in Slack.</p></section>
    </div>`;
  document.body.append(host);
  let mode = 'expanded';
  let edge = 'right';
  let disposed = false;
  let queue = Promise.resolve();
  const resize = () => {
    const width = Math.min({ cluster: 44, expanded: 388, reading: 772 }[mode], display.width);
    root.querySelector('.list').hidden = mode === 'cluster';
    root.querySelector('.reading').hidden = mode !== 'reading';
    root.querySelector('#dock').textContent = `Dock ${edge === 'left' ? 'right' : 'left'}`;
    return call('setBounds', { x: edge === 'left' ? display.x : display.x + display.width - width,
      y: display.y, width, height: mode === 'cluster' ? 240 : Math.min(display.height, 760) });
  };
  const transition = (next, nextEdge = edge) => {
    if (!['cluster', 'expanded', 'reading'].includes(next) || !['left', 'right'].includes(nextEdge)) throw Error('Invalid triage state');
    queue = queue.then(async () => { if (disposed) return; mode = next; edge = nextEdge; await resize(); });
    return queue;
  };
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.mode) transition(button.dataset.mode);
    else if (button.id === 'dock') transition(mode, edge === 'left' ? 'right' : 'left');
    else if (button.id === 'done') transition('expanded');
  }, { signal: abort.signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); transition(mode === 'reading' ? 'expanded' : 'cluster'); }
    else if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'KeyY') {
      event.preventDefault(); transition(mode === 'cluster' ? 'expanded' : 'cluster');
    }
  }, { capture: true, signal: abort.signal });
  window.__PME_TRIAGE_LAB__ = { transition, status: () => ({ mode, edge }), dispose: async () => {
    disposed = true;
    abort.abort();
    await queue.catch(() => {});
    host.remove();
    try {
      await call('setMinimumSize', ...original.min);
      await call('setBounds', original.bounds);
      await call('setAlwaysOnTop', original.top);
    } finally { delete window.__PME_TRIAGE_LAB__; }
  } };
  await call('setMinimumSize', 12, 44);
  await call('setAlwaysOnTop', true);
  await resize();
})();
