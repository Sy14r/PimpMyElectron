// Read-only pilot preflight. Never launches Slack or reads its account/cache files.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {inspectInstallation,profileOwned} from '../src/slack-installation.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const checks=[];
const add=(name,status,detail)=>checks.push({name,status,detail});
const run=(binary,args)=>spawnSync(binary,args,{encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
let installation;
add('Operating system',process.platform==='darwin'?'pass':'block',`${process.platform} ${os.release()}; the current shell requires macOS`);
add('Node.js',Number(process.versions.node.split('.')[0])>=22?'pass':'block',process.versions.node);
add('Architecture',process.arch==='arm64'?'pass':'review',`${process.arch}; live acceptance was performed on Apple Silicon`);
try{
  installation=inspectInstallation();
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'mods/runtime.json'),'utf8'));
  add('Slack version',manifest.testedSlackVersions.includes(installation.version)?'pass':'review',installation.version);
  add('Slack signature','pass','Installed bundle signature and Slack signing identity verify');
  add('Slack distribution','pass',installation.distribution+'; separate integration-test profile selected');
  add('Slack application','pass',installation.app);
}catch(error){add('Slack installation','block',error.message);}
const compiler='/Library/Developer/CommandLineTools/usr/bin/swiftc',sdk='/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk';
add('Native helper toolchain',fs.existsSync(compiler)&&fs.existsSync(sdk)?'pass':'block','Apple Command Line Tools are needed to build the menu controller on this machine');
if(installation){
  try{const profile=installation.profile,owned=profileOwned(path.join(root,'.lab/dev/profile-owner.json'),profile);
    add('Development profile',!fs.existsSync(profile)||owned?'pass':'block',!fs.existsSync(profile)?'A fresh development sign-in will be needed':owned?'Existing profile is owned by this checkout':'An existing integration-test profile has no matching ownership marker; preserve it before setup');
  }catch(error){add('Development profile','block',error.message);}
}
add('Socket path',Buffer.byteLength(path.join(root,'.lab/dev/control.sock'))<104?'pass':'block','Use a short local folder path for the private macOS Unix sockets');
try{fs.accessSync(root,fs.constants.W_OK);add('Project folder','pass','Writable');}catch{add('Project folder','block','Not writable');}
const running=process.platform==='darwin'?run('/usr/bin/pgrep',['-x','Slack']):{};
if(running.status===0)add('Existing Slack process','review','Slack is open. Quit it normally before starting this launcher; it will not kill an existing client.');
add('Runtime compatibility','review','A signed-in capability check is still required on this laptop; this preflight cannot prove pipe access, private APIs, or workspace coverage.');
const report={checkedAt:new Date().toISOString(),readOnly:true,readyToAttemptLaunch:!checks.some(c=>c.status==='block'),checks};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else {for(const c of checks)console.log(`${c.status.toUpperCase().padEnd(6)} ${c.name}: ${c.detail}`);console.log(report.readyToAttemptLaunch?'Preflight passed; runtime qualification remains.':'Resolve blocking checks before launching.');}
process.exitCode=report.readyToAttemptLaunch?0:1;
