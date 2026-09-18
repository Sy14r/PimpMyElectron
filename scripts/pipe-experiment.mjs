import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { once } from 'node:events';

// Run only after stopping the socket-based lab. This creates a fresh test profile.
const saved = JSON.parse(fs.readFileSync('.lab/session.json', 'utf8'));
if (!saved.args.includes('--integrationTestMode')) throw new Error('No dedicated lab session');
if (fs.existsSync(saved.profile)) throw new Error('Preserve the previous integration-test profile with lab.py stop first');
try {
  execFileSync('pgrep', ['-x', 'Slack'], { stdio: 'ignore' });
  throw new Error('Quit Slack before starting the pipe experiment');
} catch (error) { if (error.status !== 1) throw error; }
try {
  process.kill(saved.pid, 0);
  throw new Error('Stop the current lab process first');
} catch (error) { if (error.code !== 'ESRCH') throw error; }
const log = fs.openSync('.lab/pipe-slack.log', 'w', 0o600);
const child = spawn('/Applications/Slack.app/Contents/MacOS/Slack',
  ['--integrationTestMode', '--remote-debugging-pipe'],
  { stdio: ['ignore', log, log, 'pipe', 'pipe'] });
const evidence = { timestamp: new Date().toISOString(), protocol: 'CDP over inherited file descriptors 3/4', pid: child.pid };
let buffer = '';
let nextId = 0;
const pending = new Map();
child.stdio[3].on('error', () => {});
child.stdio[4].on('data', chunk => {
  buffer += chunk.toString();
  for (;;) {
    const end = buffer.indexOf('\0');
    if (end < 0) break;
    const packet = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    if (!packet) continue;
    const message = JSON.parse(packet);
    const p = pending.get(message.id);
    if (p) {
      clearTimeout(p.timer); pending.delete(message.id);
      if (message.error) p.reject(new Error(message.error.message));
      else p.resolve(message.result);
    }
  }
});
function send(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 8000);
    pending.set(id, { resolve, reject, timer });
    child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
}
try {
  const version = await send('Browser.getVersion');
  evidence.version = version.product;
  const { targetInfos } = await send('Target.getTargets');
  evidence.targetCount = targetInfos.length;
  // The page may still be navigating; only attach once the signed-out URL appears.
  let target;
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = await send('Target.getTargets');
    target = result.targetInfos.find(t => t.type === 'page' && t.url.startsWith('https://app.slack.com/ssb/first?'));
    if (target) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!target) throw new Error('No signed-out target');
  try {
    evidence.browserWindowControl = await send('Browser.getWindowForTarget', { targetId: target.targetId });
  } catch (error) { evidence.browserWindowControl = { supported: false, error: error.message }; }
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const calculation = await send('Runtime.evaluate', { expression: '21 * 2', returnByValue: true }, sessionId);
  if (calculation.result.value !== 42) throw new Error('Renderer calculation failed');
  evidence.rendererEvaluation = 42;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const response = await send('Runtime.evaluate', { expression: '!!document.body && !!window.desktop?.window', returnByValue: true }, sessionId);
    if (response.result?.value) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Renderer did not become ready');
  const injection = await send('Runtime.evaluate', {
    expression: fs.readFileSync('mods/workflow-panel.js', 'utf8'), returnByValue: true
  }, sessionId);
  if (injection.exceptionDetails) throw new Error('Pipe injection failed');
  const mounted = await send('Runtime.evaluate', {
    expression: 'window.__PME_WORKFLOW_PANEL__.status().mounted', returnByValue: true
  }, sessionId);
  if (mounted.result.value !== true) throw new Error('Pipe mod did not mount');
  evidence.modInjection = 'pass';
  const native = await send('Runtime.evaluate', {
    expression: '(async () => desktop.window.callBrowserWindowMethod(await desktop.window.getWindowId(), "getMinimumSize"))()',
    awaitPromise: true, returnByValue: true
  }, sessionId);
  if (!Array.isArray(native.result?.value)) throw new Error('Native bridge over pipe failed');
  evidence.nativeBridge = 'pass';
  await send('Runtime.evaluate', { expression: 'window.__PME_WORKFLOW_PANEL__.dispose()' }, sessionId);
  let listeners = '';
  try { listeners = execFileSync('/usr/sbin/lsof', ['-nP', '-a', '-p', String(child.pid), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' }); }
  catch (error) { if (error.status !== 1) throw error; }
  evidence.tcpListeners = listeners.trim() || 'none';
  evidence.result = 'pass';
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.result = 'fail'; evidence.error = error.message;
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = 1;
} finally {
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(timer);
  fs.closeSync(log);
  for (const p of pending.values()) clearTimeout(p.timer);
  fs.writeFileSync('evidence/pipe-experiment.json', JSON.stringify(evidence, null, 2) + '\n');
}
