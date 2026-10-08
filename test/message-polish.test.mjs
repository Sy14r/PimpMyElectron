import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {validateCatalog, moduleSelection} from '../client/core/catalog.mjs';

const source = await fs.readFile(new URL('../src/renderer/message-polish.js', import.meta.url), 'utf8');
const tintSource = await fs.readFile(new URL('../src/renderer/sender-tints.js', import.meta.url), 'utf8');
const triageSource = await fs.readFile(new URL('../src/renderer/triage.js', import.meta.url), 'utf8');

function senderHelpers({workspace = 'TONE', member = 'USELF'} = {}) {
  const window = {};
  vm.runInNewContext(tintSource, {
    window,
    location: {origin: 'https://app.slack.com', pathname: `/client/${workspace}/CONE`},
    localStorage: {getItem: () => JSON.stringify({teams: {[workspace]: {user_id: member}}})},
  });
  return window.__PME_SENDER_TINTS__;
}

function copyHelpers() {
  const context = {COPY_CONTROL: '[data-pme-code-copy]'};
  vm.runInNewContext(source.slice(source.indexOf('  function copyText('), source.indexOf('  async function writeClipboard(')), context);
  return context;
}

function element({attributes = {}, text = '', sender = null, member = null, link = null, clone = null} = {}) {
  return {
    textContent: text,
    getAttribute: name => attributes[name] ?? null,
    querySelector: selector => selector.includes('message_sender_name') ? sender : selector.includes('data-member-id') ? member : null,
    closest: selector => selector === '[data-member-id],[data-user-id]' ? member : selector === 'a[href]' ? link : null,
    cloneNode: () => clone,
    parentElement: null,
  };
}

test('sender keys prefer stable member IDs and fall back to normalized rendered names', () => {
  const h = senderHelpers();
  assert.equal(h.senderKey(element({attributes: {'data-message-sender': 'U123ABC'}})), 'id:U123ABC');
  const member = element({attributes: {'data-user-id': 'W456DEF'}});
  assert.equal(h.senderKey(element({sender: element({member}), member})), 'id:W456DEF');
  const link = element({attributes: {href: '/team/U789GHI'}});
  assert.equal(h.senderKey(element({sender: element({link})})), 'id:U789GHI');
  assert.equal(h.senderKey(element({sender: element({text: '  Alex   Smith  '})})), 'name:alex smith');
  assert.equal(h.senderKey(element()), null);
});

test('sender tones are deterministic and selected from the bounded translucent palette', () => {
  const h = senderHelpers();
  assert.equal(h.stableHash('id:U123'), h.stableHash('id:U123'));
  assert.notEqual(h.stableHash('id:U123'), h.stableHash('id:U124'));
  assert.match(h.color('id:U123'), /^hsla\(\d+,72%,58%,0\.105\)$/);
  h.color('id:U123');const stats=h.stats();assert.equal(stats.senders,1);assert.equal(stats.colors,1);assert.equal(stats.messages,0);
  assert.equal(h.currentUserKey(), 'id:USELF');
  assert.equal(h.isCurrentUser('id:USELF'), true);
  assert.equal(h.isCurrentUser('id:UOTHER'), false);
});

test('stable message identity caches authoritative Slack actor IDs across remounts', () => {
  const h = senderHelpers();
  const message = element({attributes: {'data-msg-channel-id': 'CONE', 'data-msg-ts': '100.000001'}});
  message.__reactFiber$test = {memoizedProps: {message: {user: 'UAUTHOR'}}};
  assert.equal(h.senderKey(message), 'id:UAUTHOR');
  delete message.__reactFiber$test;
  message.querySelector = selector => selector.includes('message_sender_name') ? element({text: 'Changed display name'}) : null;
  assert.equal(h.senderKey(message), 'id:UAUTHOR');

  const consecutive = element({attributes: {'data-msg-channel-id': 'CONE', 'data-msg-ts': '100.000002'}});
  consecutive.__reactFiber$test = {memoizedProps: {msg: {user: 'UAUTHOR'}}};
  assert.equal(h.senderKey(consecutive), 'id:UAUTHOR');
  assert.equal(h.color(h.senderKey(message)), h.color(h.senderKey(consecutive)));
  assert.equal(h.stats().messages, 2);
});

test('identified messages never fall back to mutable display names or preceding senders', () => {
  const h = senderHelpers();
  const unresolved = element({attributes: {'data-msg-channel-id': 'CONE', 'data-msg-ts': '100.000003'}, sender: element({text: 'Temporary name'})});
  assert.equal(h.senderKey(unresolved), null);
  assert.equal(source.includes('lastSender'), false);
  assert.equal(triageSource.includes('lastSender'), false);
});

test('grouped rows inherit only the nearest sender in the same rendered group', () => {
  const h = senderHelpers();
  const group = {};
  const otherGroup = {};
  const first = element({attributes: {'data-message-sender': 'UAUTHOR'}});
  const grouped = element();
  const explicitButUnresolved = element({attributes: {'data-msg-channel-id': 'CONE', 'data-msg-ts': '100.000004'}, sender: element({text: 'Loading'})});
  const unrelated = element();
  for (const [message, owner] of [[first, group], [grouped, group], [explicitButUnresolved, group], [unrelated, otherGroup]]) {
    message.closest = selector => selector.includes('virtual-list-item') ? owner : null;
  }
  const keys = h.senderKeys([first, grouped, explicitButUnresolved, unrelated]);
  assert.equal(keys.get(first), 'id:UAUTHOR');
  assert.equal(keys.get(grouped), 'id:UAUTHOR');
  assert.equal(keys.get(explicitButUnresolved), null);
  assert.equal(keys.get(unrelated), null);
});

test('copy text excludes PME controls and preserves code whitespace', () => {
  const h = copyHelpers();
  let removed = false;
  const clone = {textContent: '  one\n  two\n', querySelectorAll: () => [{remove: () => { removed = true; }}]};
  assert.equal(h.copyText(element({clone})), '  one\n  two');
  assert.equal(removed, true);
});

test('Message Polish is independent and composes with Triage and Quote in Reply', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../mods/runtime.json', import.meta.url)));
  const catalog = validateCatalog(
    JSON.parse(await fs.readFile(new URL('../client/catalog.json', import.meta.url))),
    manifest.modules,
  );
  const slack = catalog.apps.find(app => app.id === 'slack');
  const solo = moduleSelection(slack, ['slack-message-polish'], manifest.modules);
  assert.equal(solo.disabled.includes('message-polish'), false);
  assert.equal(solo.disabled.includes('sender-tints'), false);
  for (const id of ['triage-surface', 'state-observer', 'native-reply', 'quote-reply','slack-appearance']) {
    assert.equal(solo.disabled.includes(id), true);
  }
  const together = moduleSelection(
    slack,
    ['slack-triage', 'slack-quote-reply', 'slack-message-polish'],
    manifest.modules,
  );
  for (const id of ['sender-tints', 'message-polish', 'triage-surface', 'state-observer', 'native-reply', 'quote-reply']) {
    assert.equal(together.disabled.includes(id), false);
  }
  const polish=slack.mods.find(mod => mod.id === 'slack-message-polish');assert.equal(polish.defaultEnabled, false);
  for(const key of ['codeNoWrap','codeCopy','compactText','compactSpacing','readableLinks','calmHover','senderTints','tintOwn','tintIntensity'])assert.ok(polish.settings.some(setting=>setting.key===key),`missing Message Polish setting ${key}`);assert.equal(polish.settings.some(setting=>setting.key==='compactShared'),false);
});

test('Message Polish settings are live, bounded and independently gated',()=>{
 for(const fragment of ['const defaults = {codeNoWrap: true','compactSpacing: false','readableLinks: true','data-pme-polish-code-no-wrap','data-pme-polish-compact-text','data-pme-polish-compact-spacing','.c-message_kit__gutter__right','line-height:18px','data-pme-readable-link','data-pme-readable-link-icon','readableLabel(href)','restoreLinks()','data-pme-polish-calm-hover','senderTints.senderKeys(messages)','(settings.tintIntensity / 100) * 0.3','configure(value = {})'])assert.ok(source.includes(fragment),`missing configurable polish contract: ${fragment}`);assert.equal(source.includes('data-pme-polish-compact-shared'),false);
 assert.equal(source.includes('fetch('),false);
 const readableSource=source.slice(source.indexOf('  function readableLabel('),source.indexOf('  function originalLinkText('));
 assert.deepEqual([...readableSource.matchAll(/host\s*===\s*'([^']+)'/g)].map(match=>match[1]),['docs.google.com']);
 assert.equal(/host\.(?:endsWith|includes|startsWith)\(/.test(readableSource),false);
});

test('renderer scopes every visual change and has a complete disposable lifecycle', () => {
  for (const fragment of [
    '[data-qa="message_container"]',
    '[data-pme-readable-link-view]',
    '[data-qa="message-actions"]',
    'prefers-reduced-motion',
    'observer.disconnect()',
    "document.querySelectorAll(COPY_CONTROL).forEach(control => control.remove())",
    "message.style.removeProperty('--pme-message-tone')",
    'delete window.__PME_MESSAGE_POLISH__',
  ]) assert.ok(source.includes(fragment), `missing lifecycle fragment: ${fragment}`);
});

test('Triage owns sender tinting only inside its native detail pane', () => {
  for (const fragment of [
    '[data-pme-native-reply-pane] [data-qa="message_container"]',
    'data-pme-triage-sender-tint',
    'data-pme-triage-sender-tints',
    'data-pme-triage-sender-tint-mode="always"',
    'data-pme-triage-sender-tint-mode="hover"',
    "content:'';position:absolute;inset:0;z-index:2;pointer-events:none",
    'clearNativeSenderTints()',
    'tint.isCurrentUser(key)',
    'tint.senderKey(message)',
  ]) assert.ok(triageSource.includes(fragment), `missing triage tint fragment: ${fragment}`);
  assert.equal(triageSource.includes(':host([data-sender-tints])'), false);
  assert.ok(source.includes("message.closest('[data-pme-native-reply-pane]')"));
  const alwaysSelector = 'body[data-pme-triage-sender-tints][data-pme-triage-sender-tint-mode="always"] [data-pme-native-reply-pane] [data-qa="message_container"][data-pme-triage-sender-tint]::after';
  assert.ok(triageSource.includes(alwaysSelector));
  assert.equal(alwaysSelector.includes(':hover'), false);
  assert.ok(triageSource.includes("tintedMessages:document.querySelectorAll('[data-pme-native-reply-pane] [data-pme-triage-sender-tint]').length"));
});
