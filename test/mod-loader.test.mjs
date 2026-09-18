import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createModLoader,validateManifest} from '../src/mod-loader.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('manifest rejects path traversal, duplicate IDs and unknown capabilities',()=>{
 const mod={id:'test-mod',version:'1',source:'src/renderer/triage.js',global:'__PME_TRIAGE__',requires:['dom']};
 for(const modules of [[{...mod,source:'../secret.js'}],[mod,mod],[{...mod,requires:['arbitrary']}]] )assert.throws(()=>validateManifest({schemaVersion:1,modules}));
});
test('module failures are isolated, disabled module is removed, and unknown builds are recorded honestly',async t=>{
 const runtimeDir=await fs.mkdtemp(path.join(os.tmpdir(),'mods-'));t.after(()=>fs.rm(runtimeDir,{recursive:true,force:true}));const calls=[];let fail=false;
 const cdp={send:async(method,params)=>{calls.push(method);return {identifier:String(calls.length)};},evaluate:async expression=>{
  if(expression.includes('slackPage:'))return {slackPage:true,dom:true,sessionConfig:true,windowBridge:true,assets:['/app.js']};
  if(expression.startsWith('!!window'))return false;
  if(fail&&expression.includes('function installReads'))throw Error('changed API');
 }};
 const loader=await createModLoader({cdp,root,runtimeDir,slackVersion:'future-build'}),entry={sessionId:'one'};
 await loader.reconcile(entry);assert.equal(loader.status().pages[0].modules['triage-surface'],'active');assert.equal(loader.status().previouslyTested,false);
 await fs.writeFile(path.join(runtimeDir,'mods.json'),JSON.stringify({disabled:['history-reader']}));await loader.reconcile(entry);assert.equal(loader.status().pages[0].modules['history-reader'],'disabled');assert.ok(calls.includes('Page.removeScriptToEvaluateOnNewDocument'));
 fail=true;await fs.writeFile(path.join(runtimeDir,'mods.json'),JSON.stringify({disabled:[]}));await loader.reconcile(entry);assert.equal(loader.status().pages[0].modules['history-reader'],'failed');assert.equal(loader.status().pages[0].modules['triage-surface'],'active');
 await loader.dispose(new Map([['one',entry]]));
});
