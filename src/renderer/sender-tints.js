(() => {
  if (window.__PME_SENDER_TINTS__ || location.origin !== 'https://app.slack.com') return;

  const PALETTE = [8, 32, 52, 102, 150, 181, 207, 232, 265, 292, 320, 344];
  const MAX_SENDERS = 4096;
  const MAX_MESSAGES = 12000;
  const senderIndexes = new Map();
  const senderColors = new Map();
  const messageSenders = new Map();

  function remember(table, key, value, limit) {
    table.set(key, value);
    while (table.size > limit) table.delete(table.keys().next().value);
    return value;
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value || '')) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function index(key) {
    if (senderIndexes.has(key)) return senderIndexes.get(key);
    return remember(senderIndexes, key, stableHash(key) % PALETTE.length, MAX_SENDERS);
  }

  function color(key, alpha = 0.105) {
    const opacity = Number.isFinite(alpha) ? Math.min(0.3, Math.max(0, alpha)) : 0.105;
    const cacheKey = `${key}\u0000${opacity}`;
    if (senderColors.has(cacheKey)) return senderColors.get(cacheKey);
    return remember(senderColors, cacheKey, `hsla(${PALETTE[index(key)]},72%,58%,${opacity})`, MAX_SENDERS * 2);
  }

  function actorId(value) {
    if (typeof value === 'string' && /^[A-Z][A-Z0-9]+$/.test(value)) return value;
    if (!value || typeof value !== 'object') return null;
    for (const field of ['id', 'user_id', 'userId', 'member_id', 'memberId', 'bot_id', 'botId', 'app_id', 'appId']) {
      const id = value[field];
      if (typeof id === 'string' && /^[A-Z][A-Z0-9]+$/.test(id)) return id;
    }
    return null;
  }

  function actorFromRecord(record) {
    if (!record || typeof record !== 'object') return null;
    for (const field of ['user', 'user_id', 'userId', 'member', 'member_id', 'memberId', 'sender', 'sender_id', 'senderId', 'bot_id', 'botId', 'app_id', 'appId']) {
      const id = actorId(record[field]);
      if (id) return id;
    }
    return null;
  }

  function fiberSenderId(message) {
    const timestamp = message?.getAttribute?.('data-msg-ts') || message?.getAttribute?.('data-ts');
    let fiber = message?.[Object.keys(message || {}).find(key => key.startsWith('__reactFiber$'))];
    for (let depth = 0; fiber && depth < 24; depth++, fiber = fiber.return) {
      for (const props of [fiber.memoizedProps, fiber.pendingProps]) {
        if (!props || typeof props !== 'object') continue;
        const records = [props.message, props.msg, props.item?.message, props.item?.msg];
        if (timestamp && [props.ts, props.messageTs, props.message_ts].includes(timestamp)) records.push(props);
        for (const record of records) {
          const id = actorFromRecord(record);
          if (id) return id;
        }
      }
    }
    return null;
  }

  function domSenderId(message) {
    for (const attribute of ['data-message-sender', 'data-msg-sender', 'data-sender-id', 'data-member-id', 'data-user-id', 'data-msg-user', 'data-message-user-id']) {
      const value = message?.getAttribute?.(attribute);
      if (/^[A-Z][A-Z0-9]+$/.test(value || '')) return value;
    }
    const sender = message?.querySelector?.('[data-qa="message_sender_name"],.c-message__sender,.c-message_kit__sender');
    const member = sender?.closest?.('[data-member-id],[data-user-id]');
    for (const attribute of ['data-member-id', 'data-user-id']) {
      const value = member?.getAttribute?.(attribute);
      if (/^[A-Z][A-Z0-9]+$/.test(value || '')) return value;
    }
    const link = sender?.closest?.('a[href]') || sender?.querySelector?.('a[href]');
    const memberId = /\/team\/([A-Z][A-Z0-9]+)/.exec(link?.getAttribute?.('href') || '')?.[1];
    return memberId || null;
  }

  function messageIdentity(message) {
    const workspace = location.pathname.match(/^\/client\/([TE][A-Z0-9]+)(?:\/|$)/)?.[1];
    const channel = message?.getAttribute?.('data-msg-channel-id') || message?.getAttribute?.('data-channel-id');
    const timestamp = message?.getAttribute?.('data-msg-ts') || message?.getAttribute?.('data-ts');
    return workspace && /^[CDG][A-Z0-9]+$/.test(channel || '') && /^\d+\.\d+$/.test(timestamp || '') ? `${workspace}:${channel}:${timestamp}` : null;
  }

  function senderKey(message) {
    const identity = messageIdentity(message);
    if (identity && messageSenders.has(identity)) return messageSenders.get(identity);
    const id = domSenderId(message) || fiberSenderId(message);
    if (id) {
      const key = `id:${id}`;
      if (identity) remember(messageSenders, identity, key, MAX_MESSAGES);
      return key;
    }
    // Rendered names are a compatibility fallback only when Slack exposes no
    // stable message identity. Never let a virtualized message switch between
    // a display name and an authoritative actor ID across remounts.
    if (identity) return null;
    const sender = message?.querySelector?.('[data-qa="message_sender_name"],.c-message__sender,.c-message_kit__sender');
    const name = sender?.textContent?.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    return name ? `name:${name.slice(0, 160)}` : null;
  }

  function hasRenderedSender(message) {
    return !!message?.querySelector?.('[data-qa="message_sender_name"],.c-message__sender,.c-message_kit__sender');
  }

  function messageGroup(message) {
    const item = message?.closest?.('[data-qa="virtual-list-item"],[role="listitem"]');
    if (item) return item;
    const parent = message?.parentElement;
    return parent?.querySelectorAll?.('[data-qa="message_container"]').length > 1 ? parent : null;
  }

  // Slack omits the sender element for consecutive messages in the same
  // rendered message group. Resolve the group as a batch so those rows inherit
  // only the nearest authoritative sender inside that exact group. Never carry
  // a sender across virtual-list items, threads, or separately rendered panes.
  function senderKeys(messages) {
    const resolved = new Map();
    const lastByGroup = new Map();
    for (const message of messages || []) {
      const group = messageGroup(message);
      const own = senderKey(message);
      if (own) {
        resolved.set(message, own);
        if (group) lastByGroup.set(group, own);
      } else if (group && !hasRenderedSender(message) && lastByGroup.has(group)) {
        resolved.set(message, lastByGroup.get(group));
      } else {
        resolved.set(message, null);
      }
    }
    return resolved;
  }

  function currentUserKey() {
    try {
      const workspace = location.pathname.match(/^\/client\/([TE][A-Z0-9]+)(?:\/|$)/)?.[1];
      const team = JSON.parse(localStorage.getItem('localConfig_v2') || '{}').teams?.[workspace];
      const id = team?.user_id || team?.member_id || team?.userId;
      return /^[A-Z][A-Z0-9]+$/.test(id || '') ? `id:${id}` : null;
    } catch {
      return null;
    }
  }

  function isCurrentUser(key) {
    const own = currentUserKey();
    return !!own && key === own;
  }

  const api = {
    version: '0.4.0',
    stableHash,
    index,
    color,
    senderKey,
    senderKeys,
    currentUserKey,
    isCurrentUser,
    stats: () => ({senders: senderIndexes.size, colors: senderColors.size, messages: messageSenders.size}),
    dispose() {
      senderIndexes.clear();senderColors.clear();messageSenders.clear();
      if (window.__PME_SENDER_TINTS__ === api) delete window.__PME_SENDER_TINTS__;
    },
  };
  window.__PME_SENDER_TINTS__ = api;
})();
