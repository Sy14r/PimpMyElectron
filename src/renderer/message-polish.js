(() => {
  if (window.__PME_MESSAGE_POLISH__ || location.origin !== 'https://app.slack.com') return;
  const senderTints = window.__PME_SENDER_TINTS__;
  if (!senderTints) return;

  const MESSAGE = '[data-qa="message_container"]';
  const MESSAGE_TEXT = '[data-qa="message-text"],.c-message_kit__text,.c-message__body';
  const STYLE_ID = 'pme-message-polish-style';
  const COPY_CONTROL = '[data-pme-code-copy]';
  const defaults = {codeNoWrap: true, codeCopy: true, compactText: true, compactSpacing: false, readableLinks: true, calmHover: true, senderTints: true, tintOwn: false, tintIntensity: 35};
  const booleanKeys = ['codeNoWrap', 'codeCopy', 'compactText', 'compactSpacing', 'readableLinks', 'calmHover', 'senderTints', 'tintOwn'];
  let settings = {...defaults};
  let disposed = false;
  let scheduled = false;
  let noticeTimer;
  const buttonTimers = new Set();

  function copyText(target) {
    const clone = target.cloneNode(true);
    clone.querySelectorAll?.(COPY_CONTROL).forEach(control => control.remove());
    return (clone.textContent || '').replace(/\u00a0/g, ' ').replace(/\n$/, '');
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0';
    document.body.append(field);
    field.select();
    const copied = document.execCommand?.('copy');
    field.remove();
    if (!copied) throw Error('copy unavailable');
  }

  function showNotice(text) {
    let notice = document.getElementById('pme-message-polish-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'pme-message-polish-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      document.body.append(notice);
    }
    notice.textContent = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.remove(), 2600);
  }

  function resetButton(button) {
    const timer = setTimeout(() => {
      button.textContent = 'Copy';
      button.removeAttribute('data-state');
      buttonTimers.delete(timer);
    }, 1400);
    buttonTimers.add(timer);
  }

  function addCopyControl(target, kind) {
    if (!target?.isConnected || target.hasAttribute('data-pme-code-target')) return;
    target.setAttribute('data-pme-code-target', kind);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.pmeCodeCopy = kind;
    button.className = kind === 'inline' ? 'pme-code-copy pme-code-copy-inline' : 'pme-code-copy';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', kind === 'inline' ? 'Copy inline code' : 'Copy code block');
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const text = copyText(target);
      if (!text) {
        showNotice('There is no code to copy.');
        return;
      }
      try {
        await writeClipboard(text);
        button.textContent = 'Copied';
        button.dataset.state = 'copied';
        resetButton(button);
      } catch {
        showNotice('Slack could not copy this code. Select it and copy normally.');
      }
    });
    if (kind === 'block') target.append(button);
    else target.insertAdjacentElement('afterend', button);
  }

  function decorateCode(message) {
    if (!settings.codeCopy) return;
    for (const block of message.querySelectorAll('pre')) addCopyControl(block, 'block');
    for (const inline of message.querySelectorAll('code')) {
      if (!inline.closest('pre') && !inline.closest('[contenteditable="true"]')) addCopyControl(inline, 'inline');
    }
  }

  function shorten(value, limit = 48) {
    const text = String(value || '');
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
  }

  function readableLabel(href) {
    let url;
    try { url = new URL(href); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean).map(value => { try { return decodeURIComponent(value); } catch { return value; } }).filter(value => value.trim());
    if (host === 'docs.google.com') {
      const kinds = {document: 'Doc', spreadsheets: 'Sheet', presentation: 'Slides'};
      const [kind, ...rest] = segments;
      if (!kinds[kind]) return null;
      const offset = rest[0] === 'u' ? 2 : 0;
      if (rest[offset] !== 'd') return null;
      const id = rest[offset + 1] === 'e' ? rest[offset + 2] : rest[offset + 1];
      return id && /^[\w-]+$/.test(id) ? {tool: kinds[kind], icon: kind, title: shorten(id, 10)} : null;
    }
    return null;
  }

  function originalLinkText(anchor) {
    let text = '';
    for (const node of anchor.childNodes) if (!(node.nodeType === Node.ELEMENT_NODE && node.matches?.('[data-pme-readable-link-view]'))) text += node.textContent || '';
    return text.trim();
  }

  function restoreLink(anchor) {
    anchor.querySelector(':scope > [data-pme-readable-link-view]')?.remove();
    const saved = anchor.__pmeReadableLinkSaved;
    if (saved) {
      for (const [name, value] of Object.entries(saved)) value === null ? anchor.removeAttribute(name) : anchor.setAttribute(name, value);
      delete anchor.__pmeReadableLinkSaved;
    }
    anchor.removeAttribute('data-pme-readable-link');
  }

  function decorateLinks(message) {
    if (!settings.readableLinks) return;
    for (const anchor of message.querySelectorAll('[data-qa="rich_text_truncated_link_element"] a.c-link[data-truncated-link="true"]')) {
      if (anchor.closest('[contenteditable="true"]')) continue;
      const href = anchor.getAttribute('href') || '', existing = anchor.querySelector(':scope > [data-pme-readable-link-view]');
      if (existing && anchor.lastChild === existing && anchor.getAttribute('data-pme-readable-link') === href) continue;
      restoreLink(anchor);const label = readableLabel(href), text = originalLinkText(anchor);if (!label || !text) continue;
      anchor.__pmeReadableLinkSaved = {title: anchor.getAttribute('title'), 'aria-label': anchor.getAttribute('aria-label')};
      anchor.title = text;anchor.setAttribute('aria-label', text);
      const view = document.createElement('span'), icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), title = document.createElement('b');view.setAttribute('data-pme-readable-link-view', '');view.setAttribute('aria-hidden', 'true');icon.setAttribute('data-pme-readable-link-icon', label.icon);icon.setAttribute('viewBox', '0 0 16 16');icon.innerHTML='<path fill="currentColor" d="M3 1h7l3 3v11H3V1Zm7 1.5V5h2.5L10 2.5ZM5 8h6V7H5v1Zm0 2h6V9H5v1Zm0 2h4v-1H5v1Z"/>';title.textContent=label.tool;view.append(icon,title,document.createTextNode(label.title));anchor.append(view);anchor.setAttribute('data-pme-readable-link', href);
    }
  }

  function restoreLinks() {
    document.querySelectorAll('a[data-pme-readable-link]').forEach(restoreLink);
  }

  function decorateMessages() {
    scheduled = false;
    if (disposed) return;
    const messages = [...document.querySelectorAll(MESSAGE)];
    const resolvedSenders = settings.senderTints ? senderTints.senderKeys(messages) : new Map();
    for (const message of messages) {
      if (!message.querySelector(MESSAGE_TEXT)) continue;
      if (settings.codeCopy) decorateCode(message);
      if (settings.readableLinks) decorateLinks(message);
      if (message.closest('[data-pme-native-reply-pane]')) {
        message.removeAttribute('data-pme-message-tone');
        message.style.removeProperty('--pme-message-tone');
        continue;
      }
      const key = resolvedSenders.get(message) || null;
      if (!key || (!settings.tintOwn && senderTints.isCurrentUser(key))) {
        message.removeAttribute('data-pme-message-tone');
        message.style.removeProperty('--pme-message-tone');
        continue;
      }
      message.dataset.pmeMessageTone = String(senderTints.index(key));
      message.style.setProperty('--pme-message-tone', senderTints.color(key, (settings.tintIntensity / 100) * 0.3));
    }
  }

  function applySettings() {
    if (!document.body) return;
    for (const key of booleanKeys) document.body.toggleAttribute(`data-pme-polish-${key.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`)}`, settings[key] === true);
    if (!settings.codeCopy) {
      document.querySelectorAll(COPY_CONTROL).forEach(control => control.remove());
      document.querySelectorAll('[data-pme-code-target]').forEach(target => target.removeAttribute('data-pme-code-target'));
    }
    if (!settings.readableLinks) restoreLinks();
  }

  function schedule() {
    if (disposed || scheduled) return;
    scheduled = true;
    queueMicrotask(decorateMessages);
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body[data-pme-polish-code-no-wrap] ${MESSAGE} pre{white-space:pre!important;overflow-x:auto!important;overflow-wrap:normal!important;word-break:normal!important}
    body[data-pme-polish-compact-text] ${MESSAGE}:not([data-pme-native-reply-pane] ${MESSAGE}) :is([data-qa="message-text"],.c-message__message_blocks,.c-message_kit__text,.p-rich_text_block){font-size:13.5px!important;line-height:20px!important}
    body[data-pme-polish-compact-spacing] ${MESSAGE} .c-message_kit__gutter{padding-top:0!important;padding-bottom:0!important}
    body[data-pme-polish-compact-spacing] ${MESSAGE} .c-message_kit__gutter__right{padding-top:0!important;padding-bottom:0!important;margin-top:0!important;margin-bottom:0!important}
    body[data-pme-polish-compact-spacing] ${MESSAGE} :is(.c-message__message_blocks,.p-rich_text_block){line-height:18px!important}
    body[data-pme-polish-sender-tints] ${MESSAGE}[data-pme-message-tone]{background-image:linear-gradient(var(--pme-message-tone),var(--pme-message-tone))!important;box-shadow:inset 3px 0 color-mix(in srgb,var(--pme-message-tone) 70%,transparent)}
    body[data-pme-polish-calm-hover] [data-qa="message-actions"]{opacity:.42;transition:opacity .12s ease}
    body[data-pme-polish-calm-hover] [data-qa="message-actions"]:is(:hover,:focus-within){opacity:1}
    a[data-pme-readable-link]{font-size:0!important}a[data-pme-readable-link]>[data-pme-readable-link-view]{font-size:var(--pme-readable-link-size,15px)}
    [data-pme-readable-link-view]{display:inline-flex;align-items:center;gap:.25em}[data-pme-readable-link-view]>b{margin-right:.08em;font-weight:650}[data-pme-readable-link-icon]{width:1em;height:1em;flex:none;color:#4285f4}[data-pme-readable-link-icon="spreadsheets"]{color:#0f9d58}[data-pme-readable-link-icon="presentation"]{color:#f9ab00}
    ${MESSAGE} pre[data-pme-code-target="block"]{position:relative}
    .pme-code-copy{position:sticky;float:right;right:5px;top:5px;z-index:3;margin:3px 3px 3px 8px;padding:2px 8px;border:1px solid color-mix(in srgb,currentColor 26%,transparent);border-radius:5px;background:color-mix(in srgb,Canvas 88%,transparent);color:CanvasText;font:600 10px/17px system-ui,sans-serif;cursor:pointer;opacity:0;transition:opacity .12s ease;user-select:none}
    ${MESSAGE}:hover .pme-code-copy,.pme-code-copy:focus-visible,.pme-code-copy[data-state="copied"]{opacity:1}
    .pme-code-copy-inline{position:static;float:none;margin:0 2px 0 5px;padding:0 5px;vertical-align:1px}
    .pme-code-copy:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    #pme-message-polish-notice{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:440px;padding:11px 15px;border-radius:9px;background:#202839;color:#f4f5f8;box-shadow:0 4px 20px #0005;font:13px/1.5 system-ui;pointer-events:none}
    @media (prefers-reduced-motion:reduce){[data-qa="message-actions"],.pme-code-copy{transition:none}}
  `;
  document.head.append(style);

  const observer = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'data-pme-native-reply-pane' || record.attributeName === 'href' || [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.(MESSAGE) || node.closest?.(MESSAGE) || node.querySelector?.(MESSAGE))))) schedule();
  });
  observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-pme-native-reply-pane', 'href']});
  applySettings();
  decorateMessages();

  window.__PME_MESSAGE_POLISH__ = {
    version: '0.2.0',
    configure(value = {}) {
      for (const key of booleanKeys) if (typeof value[key] === 'boolean') settings[key] = value[key];
      if (Number.isInteger(value.tintIntensity) && value.tintIntensity >= 5 && value.tintIntensity <= 100) settings.tintIntensity = value.tintIntensity;
      applySettings();schedule();return {...settings};
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      clearTimeout(noticeTimer);
      for (const timer of buttonTimers) clearTimeout(timer);
      buttonTimers.clear();
      style.remove();
      document.querySelectorAll(COPY_CONTROL).forEach(control => control.remove());
      document.querySelectorAll('[data-pme-code-target]').forEach(target => target.removeAttribute('data-pme-code-target'));
      restoreLinks();
      document.querySelectorAll('[data-pme-message-tone]').forEach(message => {
        message.removeAttribute('data-pme-message-tone');
        message.style.removeProperty('--pme-message-tone');
      });
      document.getElementById('pme-message-polish-notice')?.remove();
      if (document.body) for (const attribute of [...document.body.attributes].map(item => item.name).filter(name => name.startsWith('data-pme-polish-'))) document.body.removeAttribute(attribute);
      delete window.__PME_MESSAGE_POLISH__;
    },
  };
})();
