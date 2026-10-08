import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { PipeCDP } from '../src/pipe.mjs';
import {inspectInstallation,claimProfile} from '../src/slack-installation.mjs';
import {createContextGuard} from '../src/context-guard.mjs';
import {createControlPolicy} from '../src/control-policy.mjs';

const controlPolicy = createControlPolicy(process.argv.slice(2));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const replyBootstrap=fs.readFileSync(path.join(root,'src/renderer/reply-window-bootstrap.js'),'utf8');
const dir = process.env.PME_DATA_DIR || path.join(root, '.lab/dev');
if(!path.isAbsolute(dir))throw Error('PME_DATA_DIR must be absolute');
const socketPath = path.join(dir, 'control.sock');
const installation=inspectInstallation();
const profile=installation.profile;
const owner = path.join(dir, 'profile-owner.json');
const check = spawnSync('pgrep', ['-x', 'Slack']);
if (check.status === 0) throw new Error('Slack is running. Quit it normally before npm run dev; existing processes are not stopped automatically.');
if (check.status !== 1) throw new Error('Could not check for existing Slack processes');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700);
claimProfile(owner,installation);
if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
const log = fs.openSync(path.join(dir, 'slack.log'), 'w', 0o600);
const args = ['--integrationTestMode', '--remote-debugging-pipe'];
const child = spawn(installation.executable, args, { stdio: ['ignore', log, log, 'pipe', 'pipe'] });
const cdp = new PipeCDP(child.stdio[3], child.stdio[4]);
const contextGuard = createContextGuard(cdp);
const sessions = new Map();
let stopping = false;
let feature;
let helper;
let networkTest=null;
let featureError = null;
let lifecycle = Promise.resolve();
const serial = work => { const result = lifecycle.catch(() => {}).then(work); lifecycle = result; return result; };
const logStatus = value => console.log(`[dev] ${value}`);
async function restoreTestNetwork(){
  const test=networkTest;if(!test)return {restored:true};clearTimeout(test.timer);
  const results=await Promise.allSettled(test.entries.map(e=>cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1},e.sessionId)));
  const restored=results.every((r,i)=>r.status==='fulfilled'||![...sessions.values()].some(e=>e.sessionId===test.entries[i].sessionId));
  if(restored)networkTest=null;
  else if((test.retries=(test.retries||0)+1)<3)test.timer=setTimeout(()=>{void restoreTestNetwork();},1000);
  else logStatus('Network experiment restore could not be confirmed. Stop and restart the owned development client.');
  return {restored};
}
async function testOffline(durationMs){
  if(process.env.PME_NETWORK_TESTS!=='1')throw Error('Network experiments are disabled in this launcher.');
  if(networkTest||!Number.isInteger(durationMs)||durationMs<1000||durationMs>45000)throw Error('Use one bounded network experiment, 1–45 seconds.');
  const entries=[...sessions.values()].filter(e=>e.url.startsWith('https://app.slack.com/client/'));
  if(!entries.length)throw Error('No signed-in development page');
  for(const e of entries){
    const teams=await cdp.evaluate(`Object.keys(JSON.parse(localStorage.getItem('localConfig_v2')||'{}').teams||{})`,e.sessionId);
    if(!teams?.length||teams.some(id=>!['TAAP373B6','T0C3P9VJUBA'].includes(id)))throw Error('Network experiments require only the authorized test workspaces.');
  }
  networkTest={entries,restoreAt:Date.now()+durationMs};
  try{
    for(const e of entries)await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1},e.sessionId);
    networkTest.timer=setTimeout(()=>{void restoreTestNetwork();},durationMs);
    return {offline:true,restoreAt:networkTest.restoreAt};
  }catch(error){await restoreTestNetwork();throw error;}
}

async function loadFeature() {
  if (!fs.existsSync('src/live-runtime.mjs')) return;
  feature = undefined;
  try {
    const module = await import(`../src/live-runtime.mjs?revision=${Date.now()}`);
    feature = await module.createRuntime({ cdp, contextGuard, sessions, root, runtimeDir:dir, slackPID: child.pid, slackVersion:installation.version });
    featureError = null;
  } catch {
    featureError = 'Mod runtime could not start. Ordinary Slack remains available; fix the module and reload.';
    logStatus(featureError);
  }
}
function startHelper() {
  // The Slack Companion hosts Triage controls and live settings for bundled
  // native-capable mods. Pure renderer mods remain helper-free.
  if(helper)return;
  try {
    const preference=JSON.parse(fs.readFileSync(path.join(dir,'companion.json'),'utf8'));
    if(preference.enabled===false)return;
  } catch(error) {
    if(error.code!=='ENOENT'){logStatus('Invalid Slack Companion preference; keeping it off.');return;}
  }
  try {
    const config=JSON.parse(fs.readFileSync(path.join(dir,'mods.json'),'utf8'));
    if(config.disabled?.includes('triage-surface')&&config.disabled?.includes('slack-layout'))return;
  } catch(error) {
    if(error.code!=='ENOENT'){logStatus('Invalid module selection; Slack Companion not started.');return;}
  }
  const binary = process.env.PME_HELPER_PATH || path.join(root, '.lab/bin/SlackTriage');
  if(process.env.PME_HELPER_PATH&&!fs.existsSync(binary)){logStatus('Packaged Slack Companion is missing.');return;}
  const source = path.join(root, 'native/TriageController.swift');
  if (!process.env.PME_HELPER_PATH && (!fs.existsSync(binary) || fs.statSync(source).mtimeMs > fs.statSync(binary).mtimeMs)) {
    const build = spawnSync(process.execPath, ['scripts/build-shell.mjs'], { cwd: root, stdio: 'inherit' });
    if (build.status !== 0) { logStatus('Slack Companion build failed. The in-Slack controls remain available.'); return; }
  }
  if (stopping) return;
  helper = spawn(binary, [path.join(dir, 'shell.sock')], { stdio: ['ignore', log, log] });
  helper.on('error', () => logStatus('Slack Companion unavailable. Use the in-Slack controls.'));
  helper.on('exit', () => { helper = undefined; });
}
async function stopHelper() {
  if(!helper)return {helperRunning:false};
  const previous=helper;
  await new Promise(resolve=>{let settled=false;const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);resolve();};const timer=setTimeout(()=>{previous.kill('SIGKILL');finish();},3000);timer.unref();previous.once('exit',finish);previous.kill('SIGTERM');});
  if(helper===previous)helper=undefined;
  return {helperRunning:false};
}
async function restartHelper() {
  await stopHelper();
  startHelper();return {helperRunning:!!helper};
}
async function prepareEntry(entry) {
  if (entry.contextReady) return;
  await cdp.send('Page.enable', {}, entry.sessionId);
  const {frameTree} = await cdp.send('Page.getFrameTree', {}, entry.sessionId);
  contextGuard.frame(entry.sessionId, frameTree.frame);
  await cdp.send('Runtime.enable', {}, entry.sessionId);
  entry.contextReady = true;
}
async function discover() {
  if (stopping) return;
  const { targetInfos } = await cdp.send('Target.getTargets');
  const targetById=new Map(targetInfos.map(target=>[target.targetId,target]));
  const active = new Set(targetInfos.map(t => t.targetId));
  for (const [id, entry] of sessions) if (!active.has(id)) {
    await feature?.detach?.(entry).catch(() => {}); sessions.delete(id);
  }
  for (const target of targetInfos) {
    if (target.type !== 'page') continue;
    let url=null;try { url = new URL(target.url); } catch {}
    const slackPage=url?.origin==='https://app.slack.com',opener=targetById.get(target.openerId),replyBlank=target.url==='about:blank'&&opener&&(()=>{try{return new URL(opener.url).origin==='https://app.slack.com';}catch{return false;}})();
    if(!slackPage&&!replyBlank)continue;
    const existing = sessions.get(target.targetId);
    if (existing) { existing.url = target.url; await prepareEntry(existing); await feature?.attach?.(existing).catch(() => {}); continue; }
    try {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const entry = { targetId: target.targetId, sessionId, url: target.url };
    await prepareEntry(entry);
    if(replyBlank){
      const name=await cdp.evaluate('String(window.name||"")',sessionId);
      if(!/(?:^|,)frameId=pme-reply-[TE][A-Z0-9]+-[CDG][A-Z0-9]+-[^,]+/.test(name)){await cdp.send('Target.detachFromTarget',{sessionId}).catch(()=>{});contextGuard.detach(sessionId);continue;}
      await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:replyBootstrap},sessionId);
      await cdp.evaluate(replyBootstrap,sessionId);
      entry.replyBootstrap=true;sessions.set(target.targetId,entry);logStatus('Prepared a dedicated Slack reply window before navigation.');continue;
    }
    sessions.set(target.targetId, entry);
    await feature?.attach?.(entry);
    logStatus('Attached to a Slack page; message contents are not logged.');
    } catch { logStatus('A Slack page is reconnecting; other pages remain available.'); }
  }
}
let busy=false;
function requestDiscovery(){if(busy||stopping)return;busy=true;void serial(discover).catch(()=>{if(!stopping)logStatus('Waiting for Slack page connection…');}).finally(()=>{busy=false;});}
cdp.on('event', message => {
  if(['Target.targetCreated','Target.targetInfoChanged'].includes(message.method)){requestDiscovery();return;}
  if (message.method !== 'Target.detachedFromTarget') return;
  void serial(async () => {
    for (const [id, entry] of sessions) if (entry.sessionId === message.params.sessionId) {
      await feature?.detach?.(entry).catch(() => {}); sessions.delete(id);
    }
  });
});
const server = net.createServer(connection => {
  connection.setEncoding('utf8');
  connection.setTimeout(15000, () => connection.destroy());
  let buffer = '', handled = false;
  connection.on('data', async data => {
    if (handled) return;
    buffer += data;
    if (buffer.length > 512000) return connection.destroy();
    if (!buffer.includes('\n')) return;
    handled = true;
    const line = buffer.slice(0, buffer.indexOf('\n')); buffer = '';
    try {
      const request = JSON.parse(line);
      controlPolicy.assert(request);
      let result;
      if (request.op === 'status') {
        result = { running: !stopping, controlMode: controlPolicy.mode, pid: child.pid, installation:{app:installation.app,version:installation.version,distribution:installation.distribution}, pages: [...sessions.values()].map(e => ({ targetId: e.targetId,
          signedIn: /^https:\/\/app\.slack\.com\/client\/[TE][A-Z0-9]+/.test(e.url) })), featureError, helperRunning: !!helper, feature: feature?.status?.() || null };
      } else if(request.op==='reply-layout'){
        const pages=[];for(const entry of sessions.values())try{const diagnostics=await cdp.evaluate('window.__PME_NATIVE_NAVIGATION__?.layoutDiagnostics?.()||null',entry.sessionId);if(diagnostics)pages.push(diagnostics);}catch{}
        result={pages};
      } else if(request.op==='test-network-offline'){
        result=await testOffline(request.durationMs);
      } else if(request.op==='test-network-restore'){
        result=await restoreTestNetwork();
      } else if (request.op === 'show') {
        if(stopping)throw Error('Session is stopping');
        const opened=spawnSync('/usr/bin/open',['-a',installation.app],{encoding:'utf8'});
        if(opened.status!==0)throw Error('Could not bring Slack forward');
        result={shown:true};
      } else if (request.op === 'mod-settings') {
        if(stopping||!feature?.configure)throw Error('Mod settings are unavailable');
        if(!['slack-triage','slack-layout'].includes(request.modId))throw Error('Unknown configurable mod');
        if(!request.patch||typeof request.patch!=='object'||Array.isArray(request.patch)||Object.keys(request.patch).length>40||JSON.stringify(request.patch).length>12000)throw Error('Invalid mod settings');
        result={modId:request.modId,settings:await feature.configure(request.modId,request.patch)};
      } else if (request.op === 'companion') {
        if(stopping||typeof request.enabled!=='boolean')throw Error('Invalid Slack Companion setting');
        fs.writeFileSync(path.join(dir,'companion.json'),JSON.stringify({enabled:request.enabled},null,2)+'\n',{mode:0o600});
        result=await serial(async()=>request.enabled?restartHelper():stopHelper());
      } else if (request.op === 'reload') {
        result = await serial(async () => {
          if (stopping) throw Error('Session is stopping');
          await feature?.dispose?.(); await loadFeature();
          for (const e of sessions.values()) await feature?.attach?.(e).catch(() => {});
          return { reloaded: !!feature, error: featureError };
        });
      } else if (request.op === 'restart-shell') {
        result = await serial(async()=>{if(stopping)throw Error('Session is stopping');return restartHelper();});
      } else if (request.op === 'inspect') {
        // Local trusted developer control. Kept in a mode-0700 directory with a
        // mode-0600 Unix socket; never exposed over TCP or to the injected UI.
        const entry = request.targetId ? sessions.get(request.targetId) : [...sessions.values()].find(e => e.url.includes('/client/')) || [...sessions.values()][0];
        if (!entry || typeof request.expression !== 'string') throw new Error('No matching page/expression');
        result = await cdp.evaluate(request.expression, entry.sessionId);
      } else if (request.op === 'stop') {
        connection.end(JSON.stringify({ ok: true, result: 'Stopping; dev sign-in will be preserved' }) + '\n');
        void stop(); return;
      } else if (request.op === 'screenshot') {
        const entry = [...sessions.values()].find(e => e.url.includes('/client/')) || [...sessions.values()][0];
        if (!entry) throw new Error('No Slack page');
        const image = await cdp.send('Page.captureScreenshot', { format: 'png' }, entry.sessionId);
        const output = path.join(dir, 'screenshot.png'); fs.writeFileSync(output, Buffer.from(image.data, 'base64'), { mode: 0o600 });
        result = { path: output };
      } else throw new Error('Unknown operation');
      connection.end(JSON.stringify({ ok: true, result }) + '\n');
    } catch (error) { connection.end(JSON.stringify({ ok: false, error: error.message }) + '\n'); }
  });
  connection.on('error', () => {});
});
async function stop() {
  if (stopping) return; stopping = true;
  clearInterval(timer);
  await restoreTestNetwork();
  helper?.kill('SIGTERM');
  await serial(() => feature?.dispose?.().catch(() => {}));
  server.close();
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 4000); killTimer.unref();
  if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
}
const timer = setInterval(async () => {
  requestDiscovery();
}, 1000);
child.on('error', error => { logStatus(error.message); void stop(); });
child.on('exit', () => { stopping = true;clearTimeout(networkTest?.timer);networkTest=null; helper?.kill('SIGTERM'); contextGuard.dispose(); cdp.close(); clearInterval(timer); server.close();
  void feature?.dispose?.().catch(() => {});
  if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  fs.closeSync(log); logStatus('Slack closed. Development sign-in preserved.');
});
process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
// Publish this launch before the runtime reads its appearance recovery record.
fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify({ launchId: `${Date.now()}-${child.pid}`, runtimePid: process.pid, slackPid: child.pid, profile, socketPath }, null, 2), { mode: 0o600 });
await serial(loadFeature);
if (!stopping) startHelper();
await cdp.send('Target.setDiscoverTargets',{discover:true}).catch(()=>{});
requestDiscovery();
server.listen(socketPath, () => { fs.chmodSync(socketPath, 0o600); logStatus(controlPolicy.mode === 'development' ? 'DEVELOPMENT MODE: arbitrary evaluation and screenshots enabled. Use test workspaces.' : 'Slack runtime started with everyday controls. Developer evaluation and screenshots are disabled.'); });
