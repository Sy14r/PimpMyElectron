// CDP metadata, never renderer-supplied IDs, establishes callback authority.
const workspace = value => {
  try { const u = new URL(value); return u.origin === 'https://app.slack.com' ? u.pathname.match(/^\/client\/([TE][A-Z0-9]+)(?:\/|$)/)?.[1] : null; }
  catch { return null; }
};
export function createContextGuard(cdp) {
  const pages = new Map();
  function frame(sessionId, value) {
    if (!value || value.parentId || typeof value.id !== 'string' || !value.id) return;
    const old = pages.get(sessionId);
    pages.set(sessionId, {frame: value, contexts: old && old.frame.id === value.id && old.frame.loaderId === value.loaderId ? old.contexts : new Map()});
  }
  function event({method, sessionId, params: p = {}}) {
    if (method === 'Target.detachedFromTarget') { pages.delete(p.sessionId); return; }
    if (method === 'Page.frameNavigated') { frame(sessionId, p.frame); return; }
    const page = pages.get(sessionId); if (!page) return;
    if (method === 'Page.navigatedWithinDocument' && p.frameId === page.frame.id) page.frame = {...page.frame, url: p.url};
    if (method === 'Runtime.executionContextsCleared' || method === 'Page.frameDetached' && p.frameId === page.frame.id) page.contexts.clear();
    if (method === 'Runtime.executionContextDestroyed') page.contexts.delete(p.executionContextId);
    if (method === 'Runtime.executionContextCreated') {
      const c = p.context;
      if (Number.isInteger(c?.id) && c.origin === 'https://app.slack.com' && c.auxData?.isDefault === true && c.auxData.frameId === page.frame.id)
        page.contexts.set(c.id, {id: c.id, uniqueId: c.uniqueId});
    }
  }
  cdp.on('event', event);
  function current(entry) {
    const page = pages.get(entry.sessionId), team = workspace(page?.frame.url);
    if (!team || team !== workspace(entry.url) || page.contexts.size !== 1) return null;
    return page.contexts.values().next().value;
  }
  return {frame, current, url: sessionId => pages.get(sessionId)?.frame.url,
    allows(message, entry) { const c = current(entry); return !!c && message.params?.executionContextId === c.id; },
    detach: sessionId => pages.delete(sessionId),
    dispose() { cdp.off('event', event); pages.clear(); }
  };
}
