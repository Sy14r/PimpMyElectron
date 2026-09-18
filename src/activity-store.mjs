import {messageParts} from './message-format.mjs';
// Normalized observations and read results. No credentials or network client.
export const READ_METHODS = new Set(['client.boot', 'client.counts', 'users.conversations',
  'conversations.list', 'conversations.info', 'conversations.history', 'conversations.replies',
  'users.info', 'users.list', 'subscriptions.thread.getView']);
const channelID = value => typeof value === 'string' && /^[CDG][A-Z0-9]+$/.test(value);
export const workspaceID = value => typeof value === 'string' && /^[TE][A-Z0-9]+$/.test(value);
const text = (value, max = 4000) => typeof value === 'string' ? value.slice(0, max) : '';
const count = value => Number.isInteger(value) && value >= 0 ? value : null;
const bool = value => typeof value === 'boolean' ? value : value === 1 ? true : value === 0 ? false : null;
const timestamp = value => typeof value === 'string' && /^\d+\.\d+$/.test(value) ? value : null;
export function compareTs(a = '', b = '') {
  const [ai = '', af = ''] = a.split('.'), [bi = '', bf = ''] = b.split('.');
  const left = ai.padStart(20, '0') + af.padEnd(20, '0');
  const right = bi.padStart(20, '0') + bf.padEnd(20, '0');
  return left < right ? -1 : left > right ? 1 : 0;
}
export function requestMetadata(request, fallbackWorkspace) {
  let url;
  try { url = new URL(request.url); } catch { return null; }
  if (url.protocol !== 'https:' || !(url.hostname === 'slack.com' || url.hostname.endsWith('.slack.com'))) return null;
  const match = url.pathname.match(/^\/api\/([a-zA-Z][a-zA-Z0-9.]+)$/);
  if (!match) return null;
  const method = match[1];
  const fields = {};
  const keys = ['team_id', '_x_team_id', 'channel', 'conversation_id', 'thread_ts', 'ts'];
  for (const key of keys) fields[key] = url.searchParams.get(key);
  const body = request.postData;
  if (typeof body === 'string' && body.length < 256000) {
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = Object.fromEntries(new URLSearchParams(body)); }
    for (const key of keys) {
      if (typeof parsed?.[key] === 'string') fields[key] = parsed[key];
      // Slack commonly uses multipart form data, including for read requests.
      const m = body.match(new RegExp(`name="${key}"\\r?\\n\\r?\\n([^\\r\\n]+)`));
      if (m) fields[key] = m[1];
    }
  }
  const team = fields.team_id || fields._x_team_id || fallbackWorkspace;
  return { method, workspaceId: workspaceID(team) ? team : null,
    channelId: channelID(fields.channel || fields.conversation_id) ? fields.channel || fields.conversation_id : null,
    threadTs: timestamp(fields.thread_ts || fields.ts) };
}

export class ActivityStore {
  workspaces = new Map();
  revision = 0;
  constructor({ now = Date.now, maxWorkspaces = 8, maxItems = 600, maxUsers = 1200, maxMessages = 1000, maxMessagesPerItem = 60 } = {}) {
    Object.assign(this, { now, maxWorkspaces, maxItems, maxUsers, maxMessages, maxMessagesPerItem });
  }
  workspace(id) {
    if (!workspaceID(id)) return null;
    if (!this.workspaces.has(id)) {
      if (this.workspaces.size >= this.maxWorkspaces) this.workspaces.delete(this.workspaces.keys().next().value);
      this.workspaces.set(id, { id, name: id, items: new Map(), users: new Map(), observedAt: 0, methods: new Set() });
    }
    return this.workspaces.get(id);
  }
  upsert(ws, channel, fields = {}, threadTs = null) {
    if (!channelID(channel)) return null;
    const key = `${ws.id}:${channel}:${threadTs || ''}`;
    let item = ws.items.get(key);
    if (!item) item = { key, workspaceId: ws.id, channelId: channel, threadTs,
      name: channel, kind: threadTs ? 'thread' : channel.startsWith('D') ? 'dm' : 'channel',
      unread: null, unreadCount: null, mentions: null, countsAt: 0, latest: null,
      observedAt: this.now(), messages: new Map(), source: 'slack-response', historyObserved: false };
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) item[k] = v;
    item.observedAt = this.now(); ws.observedAt = this.now();
    ws.items.delete(key); ws.items.set(key, item);
    while (ws.items.size > this.maxItems) ws.items.delete(ws.items.keys().next().value);
    this.revision++;
    return item;
  }
  user(ws, u) {
    if (typeof u?.id !== 'string' || !/^[UW][A-Z0-9]+$/.test(u.id)) return;
    ws.users.delete(u.id);
    ws.users.set(u.id, text(u.profile?.display_name || u.profile?.real_name || u.real_name || u.name || u.id, 160));
    while (ws.users.size > this.maxUsers) ws.users.delete(ws.users.keys().next().value);
  }
  conversation(ws, raw, kind) {
    if (!raw || !channelID(raw.id)) return;
    const actualKind = raw.is_im ? 'dm' : raw.is_mpim ? 'groupDM' : kind || 'channel';
    const fields = { kind: actualKind, peer: text(raw.user, 40) || undefined,
      name: text(raw.name || raw.name_normalized, 180) || undefined, archived: raw.is_archived === true };
    const exact = count(raw.dm_count) ?? count(raw.unread_count_display) ?? count(raw.unread_count);
    const flag = bool(raw.has_unreads);
    const mentions = count(raw.mention_count_display) ?? count(raw.mention_count);
    if (exact !== null || flag !== null) Object.assign(fields, { unreadCount: exact, unread: exact !== null ? exact > 0 : flag, countsAt: this.now() });
    if (mentions !== null) fields.mentions = mentions;
    const existing=ws.items.get(`${ws.id}:${raw.id}:`);
    if (timestamp(raw.latest)&&(!existing?.latest||compareTs(raw.latest,existing.latest)>0)) fields.latest = raw.latest;
    const item = this.upsert(ws, raw.id, fields);
    if (raw.latest && typeof raw.latest === 'object') this.message(ws, item, raw.latest);
  }
  message(ws, item, raw) {
    if (!item || !raw || !timestamp(raw.ts)) return;
    const previous = item.messages.get(raw.ts);
    const message = { ts: raw.ts, userId: text(raw.user, 40) || previous?.userId || '', author: text(raw.username || raw.bot_profile?.name, 160) || previous?.author || '',
      text: typeof raw.text === 'string' ? text(raw.text) : previous?.text || '',
      threadTs: timestamp(raw.thread_ts) || previous?.threadTs || null,
      replyCount: count(raw.reply_count) ?? previous?.replyCount ?? null,
      hasAttachments: raw.files === undefined && raw.attachments === undefined ? previous?.hasAttachments || false :
        Array.isArray(raw.files) && raw.files.length > 0 || Array.isArray(raw.attachments) && raw.attachments.length > 0,
      observedAt: this.now() };
    item.messages.set(raw.ts, message);
    item.observedAt = this.now();
    const latest=item.threadTs&&timestamp(raw.latest_reply)&&compareTs(raw.latest_reply,raw.ts)>0?raw.latest_reply:raw.ts;
    if (!item.latest || compareTs(latest, item.latest) > 0) item.latest = latest;
    if (item.messages.size > this.maxMessagesPerItem) {
      const ordered = [...item.messages.keys()].sort(compareTs);
      for (const key of ordered.slice(0, -this.maxMessagesPerItem)) item.messages.delete(key);
    }
    this.revision++;
  }
  trimMessages() {
    const all = [];
    for (const ws of this.workspaces.values()) for (const item of ws.items.values()) {
      for (const message of item.messages.values()) all.push({ item, message });
    }
    if (all.length > this.maxMessages) {
      all.sort((a, b) => a.message.observedAt - b.message.observedAt);
      for (const { item, message } of all.slice(0, all.length - this.maxMessages)) item.messages.delete(message.ts);
    }
  }
  ingest(meta, body) {
    if (!meta || !READ_METHODS.has(meta.method) || !body || body.ok === false) return false;
    const responseTeam = (typeof body.team === 'string' ? body.team : body.team?.id) || body.team_id;
    if (responseTeam && workspaceID(responseTeam) && meta.workspaceId && responseTeam !== meta.workspaceId) return false;
    const ws = this.workspace(meta.workspaceId || responseTeam);
    if (!ws) return false;
    ws.methods.add(meta.method); ws.observedAt = this.now();
    if (body.team?.name) ws.name = text(body.team.name, 180);
    for (const u of [body.user, ...(Array.isArray(body.users) ? body.users : []), ...(Array.isArray(body.members) ? body.members : [])].slice(0, 1500)) this.user(ws, u);
    for (const [key, kind] of [['channels', 'channel'], ['groups', 'channel'], ['ims', 'dm'], ['mpims', 'groupDM']]) {
      for (const ch of (Array.isArray(body[key]) ? body[key] : []).slice(0, 2000)) this.conversation(ws, ch, kind);
    }
    if (body.channel && typeof body.channel === 'object') this.conversation(ws, body.channel);
    if (['conversations.history', 'conversations.replies'].includes(meta.method) && meta.channelId && Array.isArray(body.messages)) {
      const item = this.upsert(ws, meta.channelId, { historyObserved: true }, meta.method === 'conversations.replies' ? meta.threadTs : null);
      for (const message of body.messages.slice(0, 300)) this.message(ws, item, message);
      if (meta.method === 'conversations.history') for (const message of body.messages.slice(0,300)) {
        if (!timestamp(message?.ts) || !(message.reply_count > 0)) continue;
        const thread = this.upsert(ws,meta.channelId,{name:item.name},message.ts);
        this.message(ws,thread,message);
      }
    }
    if (meta.method === 'subscriptions.thread.getView') for (const thread of (Array.isArray(body.threads) ? body.threads : []).slice(0, 200)) {
      const msg = thread.root_msg;
      if (!channelID(msg?.channel) || !timestamp(msg.ts)) continue;
      const unreadCount = count(thread.unread_replies) ?? count(msg.unread_count);
      const item = this.upsert(ws, msg.channel, { historyObserved: true,
        unreadCount, unread: unreadCount === null ? null : unreadCount > 0,
        countsAt: unreadCount === null ? 0 : this.now(), mentions: count(thread.mention_count) }, msg.ts);
      this.message(ws, item, msg);
    }
    this.trimMessages(); this.revision++;
    return true;
  }
  ingestEvent(workspaceId, event) {
    if (!workspaceID(workspaceId) || !event || event.type !== 'message') return false;
    const eventWorkspace = event.team || event.team_id;
    if (eventWorkspace && eventWorkspace !== workspaceId) return false;
    if (!channelID(event.channel)) return false;
    const ws = this.workspace(workspaceId);
    if (event.subtype === 'message_deleted') {
      if (!timestamp(event.deleted_ts)) return false;
      for (const item of ws.items.values()) if (item.channelId === event.channel) {
        item.messages.delete(event.deleted_ts);
        if (item.latest === event.deleted_ts) item.latest = [...item.messages.keys()].sort(compareTs).at(-1) || null;
        if (item.threadTs === event.deleted_ts) ws.items.delete(item.key);
      }
      this.revision++; return true;
    }
    const raw = event.subtype === 'message_changed' ? event.message : event;
    if (!timestamp(raw?.ts)) return false;
    const threadTs = timestamp(raw.thread_ts) && raw.thread_ts !== raw.ts ? raw.thread_ts : null;
    const parent = ws.items.get(`${ws.id}:${event.channel}:`);
    const fields = event.subtype === 'message_changed' ? {} : { unread: null, unreadCount: null, countsAt: 0 };
    const item = this.upsert(ws, event.channel, { ...fields, name: threadTs ? parent?.name : undefined, historyObserved: true,
      source: 'slack-event' }, threadTs);
    this.message(ws, item, raw);
    if (raw.subtype === 'thread_broadcast' && threadTs) this.message(ws, this.upsert(ws, event.channel), raw);
    this.trimMessages(); return true;
  }
  ingestDOM(observation) {
    const ws = this.workspace(observation?.workspaceId);
    if (!ws) return;
    if (observation.workspaceName) ws.name = text(observation.workspaceName, 180);
    for (const row of (Array.isArray(observation.conversations) ? observation.conversations : []).slice(0, 150)) {
      if (!row || !channelID(row.channelId)) continue;
      const old = ws.items.get(`${ws.id}:${row.channelId}:`);
      this.upsert(ws, row.channelId, { name: text(row.name, 180) || undefined,
        kind: row.kind === 'dm' || row.kind === 'groupDM' ? row.kind : old?.kind || 'channel',
        ...(row.unreadObserved === true && typeof row.unread === 'boolean' ? {
          unread: row.unread, unreadCount: row.unread === false ? 0 : null, countsAt: this.now()
        } : {}),
        source: old?.source === 'slack-response' ? 'slack-response' : 'visible-dom' });
    }
    if (channelID(observation.channelId)) {
      const item = this.upsert(ws, observation.channelId, { name: text(observation.channelName, 180) || undefined,
        historyObserved: (observation.messages?.length || 0) > 0 || undefined });
      for (const message of (Array.isArray(observation.messages) ? observation.messages : []).slice(0, 60)) {
        if (!message) continue;
        this.message(ws, item, { ts: message.ts, text: message.text, username: message.author });
      }
    }
    this.trimMessages(); this.revision++;
  }
  snapshot() {
    const now = this.now();
    return { revision: this.revision, generatedAt: now, partial: true, workspaces: [...this.workspaces.values()].map(ws => {
      const channelNames=new Map([...ws.items.values()].filter(i=>!i.threadTs).map(i=>[i.channelId,i.name]));
      const itemName=item=>{const base=item.threadTs?ws.items.get(`${ws.id}:${item.channelId}:`)||item:item;return base.peer?ws.users.get(base.peer)||base.name:base.name;};
      return ({
      id: ws.id, name: ws.name, observedAt: ws.observedAt, methods: [...ws.methods],
      items: [...ws.items.values()].filter(i => !i.archived).map(item => ({
        key: item.key, workspaceId: ws.id, channelId: item.channelId, threadTs: item.threadTs,
        name: itemName(item),
        kind: item.kind, unread: item.unread, unreadCount: item.unreadCount, mentions: item.mentions,
        countsStale: !item.countsAt || now - item.countsAt > 60000,
        observedAt: item.observedAt, stale: now - item.observedAt > 60000, latest: item.latest,
        source: item.source, historyObserved: item.historyObserved,
        history: item.history ? {status:item.history.status,error:item.history.error,loadedAt:item.history.loadedAt,
          hasMore:item.history.hasMore,bounded:item.history.bounded,retryAt:item.history.retryAt,action:item.history.action,
          canLoadOlder:!!item.history.nextCursor&&!item.history.bounded} : null,
        messages: [...item.messages.values()].sort((a, b) => compareTs(a.ts, b.ts)).map(m => ({
          ...m, parts:messageParts(m.text,ws.users,channelNames), author: ws.users.get(m.userId) || m.author || m.userId || 'Unknown author'
        }))
      })).sort((a, b) => Number(b.unread === true) - Number(a.unread === true) || compareTs(b.latest || '', a.latest || '') || a.name.localeCompare(b.name))
    });}) };
  }
  status() {
    return { workspaces: this.workspaces.size, conversations: [...this.workspaces.values()].reduce((n, w) => n + w.items.size, 0),
      messages: [...this.workspaces.values()].reduce((n, w) => n + [...w.items.values()].reduce((m, i) => m + i.messages.size, 0), 0),
      revision: this.revision };
  }
}
