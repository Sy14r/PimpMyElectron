import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { CDP, targets, eventually } from './cdp.mjs';

const session = JSON.parse(await fs.readFile('.lab/session.json', 'utf8'));
if (!session.args.includes('--integrationTestMode')) throw new Error('Dedicated lab profile required');
const target = (await targets(session.port)).find(t => t.type === 'page' && t.url.startsWith('https://app.slack.com/ssb/first?'));
if (!target) throw new Error('Signed-out target required');
const c = await CDP.connect(target.webSocketDebuggerUrl);
await eventually(() => c.evaluate('!!window.desktop?.window?.callBrowserWindowMethod'));
const result = { timestamp: new Date().toISOString(), checks: [] };
const id = await c.evaluate('desktop.window.getWindowId()');
const call = (method, ...args) => c.evaluate(`desktop.window.callBrowserWindowMethod(${JSON.stringify(id)},${JSON.stringify(method)},...${JSON.stringify(args)})`);
const original = {
  bounds: await call('getBounds'), min: await call('getMinimumSize'),
  alwaysOnTop: await call('isAlwaysOnTop'), allWorkspaces: await call('isVisibleOnAllWorkspaces')
};
const check = (name, detail) => { result.checks.push({ name, result: 'pass', detail }); console.log('PASS', name, JSON.stringify(detail ?? '')); };
try {
  const screen = await c.evaluate('(async () => (await desktop.screen.getAllDisplays())[0].workArea)()');
  await call('setMinimumSize', 12, 44);
  const height = Math.min(700, screen.height);
  for (const edge of ['left', 'right']) {
    const bounds = { x: edge === 'left' ? screen.x : screen.x + screen.width - 388, y: screen.y, width: 388, height };
    await call('setBounds', bounds);
    const actual = await eventually(async () => {
      const b = await call('getBounds');
      return b.x === bounds.x && b.width === bounds.width ? b : false;
    });
    check(`official Slack window docks ${edge} at 388px`, actual);
  }
  for (const width of [68, 44, 12]) {
    await call('setBounds', { x: screen.x + screen.width - width, y: screen.y, width, height: 160 });
    const actual = await call('getBounds');
    // Record native constraints accurately; window chrome may set its own floor.
    result.checks.push({ name: `request ${width}px native width`, requested: width, actual: actual.width,
      result: actual.width === width ? 'pass' : 'constrained' });
    console.log('WIDTH', width, 'actual', actual.width);
  }
  await call('setAlwaysOnTop', true);
  assert.equal(await call('isAlwaysOnTop'), true);
  check('always-on-top through existing Slack preload bridge');
  await call('setVisibleOnAllWorkspaces', true);
  assert.equal(await call('isVisibleOnAllWorkspaces'), true);
  check('all-workspaces flag can be set', 'Flag verified; full-screen Spaces behavior not manually tested');
  await call('minimize');
  await eventually(() => call('isMinimized'));
  check('native minimization');
  await call('restore');
  await eventually(async () => !(await call('isMinimized')));
  check('native restoration');
} catch (error) { result.failure = error.message; throw error; }
finally {
  try {
    await call('restore');
    await call('setMinimumSize', ...original.min);
    await call('setBounds', original.bounds);
    await call('setAlwaysOnTop', original.alwaysOnTop);
    await call('setVisibleOnAllWorkspaces', original.allWorkspaces);
    assert.deepEqual(await call('getBounds'), original.bounds);
    check('original native window geometry restored');
  } finally {
    c.close();
    await fs.writeFile('evidence/native-window-experiment.json', JSON.stringify(result, null, 2) + '\n');
  }
}
