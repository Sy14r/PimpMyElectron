import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import { CDP, targets, eventually } from './cdp.mjs';

const session = JSON.parse(await fs.readFile('.lab/session.json', 'utf8'));
if (!session.args.includes('--integrationTestMode')) throw new Error('Use the dedicated integration-test profile');
const list = await targets(session.port);
const target = list.find(t => t.type === 'page' && isSignIn(t.url));
if (!target) throw new Error('Refusing to experiment outside the signed-out Slack welcome page');
function isSignIn(value) {
  try { const u = new URL(value); return u.origin === 'https://app.slack.com' && u.pathname === '/ssb/first'; }
  catch { return false; }
}

const c = await CDP.connect(target.webSocketDebuggerUrl);
const source = await fs.readFile('mods/workflow-panel.js', 'utf8');
const evidence = { timestamp: new Date().toISOString(), slack: '4.52.155', profile: 'integration-test, signed out', checks: [] };
let scriptId;
let bindingAdded = false;
const check = (name, detail) => { evidence.checks.push({ name, result: 'pass', detail }); console.log('PASS', name, JSON.stringify(detail ?? '')); };
try {
  await c.send('Runtime.enable');
  await c.send('Page.enable');
  await eventually(() => c.evaluate('!!document.body && !!window.desktop'));
  const capabilities = await c.evaluate(`({require: typeof require, process: typeof process,
    processGetBuiltinModule: typeof globalThis.process?.getBuiltinModule,
    processBinding: typeof globalThis.process?.binding, body: !!document.body})`);
  assert.equal(capabilities.require, 'undefined');
  assert.equal(capabilities.processGetBuiltinModule, 'undefined');
  assert.equal(capabilities.processBinding, 'undefined');
  check('renderer JavaScript is available without ordinary Node module access', capabilities);
  try {
    const result = await c.send('Browser.getWindowForTarget', { targetId: target.id });
    evidence.windowControl = { supported: true, result };
  } catch (error) { evidence.windowControl = { supported: false, error: error.message }; }
  await c.send('Runtime.addBinding', { name: '__pmeHostDescribe' });
  bindingAdded = true;
  c.on('Runtime.bindingCalled', async event => {
    if (event.name !== '__pmeHostDescribe' || event.payload.length > 256) return;
    try {
      const request = JSON.parse(event.payload);
      if (request.op !== 'describe' || !Number.isSafeInteger(request.requestId)) return;
      // A fixed, read-only operation. No arbitrary shell or filesystem bridge.
      const text = `Local companion: ${os.platform()} / ${os.arch()} · Node ${process.versions.node}`;
      await c.evaluate(`window.__PME_WORKFLOW_PANEL__?.reply(${JSON.stringify(text)})`);
    } catch { /* Target may have reloaded or disconnected. */ }
  });
  const guardedSource = `if (location.origin === 'https://app.slack.com' && location.pathname === '/ssb/first') {\n${source}\n}`;
  ({ identifier: scriptId } = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: guardedSource }));
  await c.evaluate(source);
  assert.equal(await c.evaluate('window.__PME_WORKFLOW_PANEL__.status().mounted'), true);
  const color = await c.evaluate(`getComputedStyle(document.querySelector('#pme-workflow-panel').shadowRoot.querySelector('#panel')).backgroundColor`);
  assert.equal(color, 'rgb(23, 26, 43)');
  check('custom DOM, Shadow DOM and CSS render inside signed Slack', { color });
  await c.evaluate(source);
  assert.equal(await c.evaluate('document.querySelectorAll("#pme-workflow-panel").length'), 1);
  check('reapplying a mod is idempotent');
  const key = `document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyY', metaKey: true, shiftKey: true, bubbles: true }))`;
  await c.evaluate(key);
  assert.equal(await c.evaluate('window.__PME_WORKFLOW_PANEL__.status().hidden'), true);
  await c.evaluate(key);
  assert.equal(await c.evaluate('window.__PME_WORKFLOW_PANEL__.status().hidden'), false);
  check('custom in-window keyboard shortcut toggles the panel', 'Synthetic DOM key events; not a global shortcut test');
  await c.evaluate(`document.querySelector('#pme-workflow-panel').shadowRoot.querySelector('#host').click()`);
  const reply = await eventually(() => c.evaluate(`(() => { const t = document.querySelector('#pme-workflow-panel')?.shadowRoot.querySelector('#status')?.textContent; return t?.startsWith('Local companion:') ? t : false })()`));
  check('renderer-to-local-companion round trip without network fetch', reply);
  await c.evaluate('document.querySelector("#pme-workflow-panel").remove()');
  await eventually(() => c.evaluate('!!document.querySelector("#pme-workflow-panel")'));
  check('mod recovers when its DOM root is removed');
  await c.evaluate('window.__PME_WORKFLOW_PANEL__.sentinel = "before-reload"');
  await c.send('Page.reload', { ignoreCache: false });
  await eventually(() => c.evaluate(`location.pathname === '/ssb/first' && !!window.__PME_WORKFLOW_PANEL__?.status().mounted && !window.__PME_WORKFLOW_PANEL__.sentinel`));
  check('new-document injection survives a genuine renderer reload');
  const screenshot = await c.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile('evidence/slack-injected-panel.png', Buffer.from(screenshot.data, 'base64'));
  await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId });
  scriptId = undefined;
  await c.evaluate('window.__PME_WORKFLOW_PANEL__?.dispose()');
  assert.equal(await c.evaluate('document.querySelectorAll("#pme-workflow-panel").length'), 0);
  await c.send('Page.reload', { ignoreCache: false });
  await eventually(() => c.evaluate('document.readyState === "complete"'));
  assert.equal(await c.evaluate('typeof window.__PME_WORKFLOW_PANEL__'), 'undefined');
  check('rollback removes the mod and its reload registration');
} catch (error) {
  evidence.failure = error.message;
  throw error;
} finally {
  if (scriptId) await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId }).catch(() => {});
  await c.evaluate('window.__PME_WORKFLOW_PANEL__?.dispose()').catch(() => {});
  if (bindingAdded) await c.send('Runtime.removeBinding', { name: '__pmeHostDescribe' }).catch(() => {});
  c.close();
  await fs.writeFile('evidence/runtime-experiment.json', JSON.stringify(evidence, null, 2) + '\n');
}
