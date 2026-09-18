(() => {
  if (window.top !== window) return;
  const key = '__PME_WORKFLOW_PANEL__';
  window[key]?.dispose();
  const abort = new AbortController();
  let host;
  let panel;
  let clicks = 0;
  let originalFocus;
  const mount = () => {
    if (abort.signal.aborted || host?.isConnected) return;
    host = document.createElement('div');
    host.id = 'pme-workflow-panel';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { position: fixed; right: 24px; bottom: 24px; z-index: 2147483646; }
        * { box-sizing: border-box; }
        button { cursor: pointer; font: inherit; }
        #panel { width: 330px; padding: 22px; border: 1px solid #666a86; border-radius: 16px;
          background: #171a2b; color: #f4f5ff; box-shadow: 0 16px 60px #0008;
          font: 14px/1.5 -apple-system, sans-serif; }
        #panel[hidden] { display: none; }
        h2 { font-size: 20px; margin: 5px 0 10px; }
        .eyebrow { color: #a8a5ff; font-size: 11px; letter-spacing: 1.5px; }
        p { color: #c8cbe2; }
        button { border: 0; border-radius: 7px; padding: 9px 12px; background: #b9b5ff; color: #161528; }
        #close { float: right; padding: 2px 7px; background: transparent; color: white; }
        #status { display: block; margin-top: 12px; color: #aee9ce; min-height: 42px; }
        kbd { color: #c7c6dc; font-size: 12px; }
      </style>
      <section id="panel" role="dialog" aria-label="Workflow Lab">
        <button id="close" aria-label="Close Workflow Lab">×</button>
        <span class="eyebrow">PIMP MY ELECTRON / LAB</span>
        <h2>Your workflow, inside Slack.</h2>
        <p>This panel is a local JavaScript mod running inside the official client.</p>
        <button id="host">Test local companion</button>
        <output id="status">No messages or workspace data are accessed.</output>
        <kbd>⌘⇧Y / Ctrl⇧Y toggles this panel</kbd>
      </section>`;
    panel = shadow.getElementById('panel');
    shadow.getElementById('close').addEventListener('click', () => {
      panel.hidden = true;
      originalFocus?.focus?.();
    }, { signal: abort.signal });
    shadow.getElementById('host').addEventListener('click', () => {
      clicks++;
      const status = shadow.getElementById('status');
      if (typeof window.__pmeHostDescribe !== 'function') { status.textContent = 'Companion not attached.'; return; }
      window.__pmeHostDescribe(JSON.stringify({ op: 'describe', requestId: clicks }));
      status.textContent = 'Waiting for local companion…';
    }, { signal: abort.signal });
    document.body.append(host);
  };
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'KeyY' && !event.repeat) {
      if (!panel) return;
      event.preventDefault();
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        originalFocus = document.activeElement;
        host.shadowRoot.getElementById('host').focus();
      } else originalFocus?.focus?.();
    }
  }, { capture: true, signal: abort.signal });
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true, signal: abort.signal });
  // Reattach if the application replaces its body or removes the mod's root.
  const observer = new MutationObserver(() => { if (document.body && !host?.isConnected) mount(); });
  observer.observe(document, { childList: true, subtree: true });
  window[key] = {
    version: '0.1.0',
    status: () => ({ mounted: !!host?.isConnected, hidden: panel?.hidden, clicks }),
    reply: text => { if (host?.isConnected) host.shadowRoot.getElementById('status').textContent = String(text); },
    dispose: () => { abort.abort(); observer.disconnect(); host?.remove(); delete window[key]; }
  };
})();
