import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { CDP, targets, eventually } from './cdp.mjs';

const session = JSON.parse(await fs.readFile('.lab/session.json', 'utf8'));
if (!session.args.includes('--integrationTestMode')) throw new Error('Dedicated lab required');
const target = (await targets(session.port)).find(t => t.type === 'page' && t.url.startsWith('https://app.slack.com/ssb/first?'));
if (!target) throw new Error('Only the signed-out welcome page may run this demo');
const c = await CDP.connect(target.webSocketDebuggerUrl);
const source = await fs.readFile('mods/triage-lab.js', 'utf8');
try {
  await eventually(() => c.evaluate('!!document.body && !!window.desktop?.window?.callBrowserWindowMethod'));
  await c.evaluate(source);
  if (process.argv.includes('--capture')) {
    const results = [];
    for (const [state, width] of [['cluster', 44], ['expanded', 388], ['reading', 772]]) {
      await c.evaluate(`window.__PME_TRIAGE_LAB__.transition(${JSON.stringify(state)})`);
      assert.equal((await c.evaluate('window.__PME_TRIAGE_LAB__.status()')).mode, state);
      const actual = await c.evaluate(`(async () => desktop.window.callBrowserWindowMethod(await desktop.window.getWindowId(), 'getBounds'))()`);
      assert.equal(actual.width, width);
      const image = await c.send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(`evidence/triage-${state}.png`, Buffer.from(image.data, 'base64'));
      results.push({ state, actualWidth: actual.width, result: 'pass' });
    }
    await fs.writeFile('evidence/triage-demo.json', JSON.stringify({ syntheticData: true, results }, null, 2) + '\n');
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('Synthetic triage demo active in the signed-out Slack lab. Ctrl-C restores the window.');
    await new Promise(resolve => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
      c.once('disconnected', resolve);
    });
  }
} finally {
  await c.evaluate('window.__PME_TRIAGE_LAB__?.dispose()').catch(() => {});
  c.close();
}
