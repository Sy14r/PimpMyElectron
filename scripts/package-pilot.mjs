// Explicit source allowlist: never copy .lab/, profiles, evidence or test sends.
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const files=[
  'native/TriageController.swift','mods/runtime.json',
  ...['native-edge','context-guard','control-policy','activity-refresh','activity-store','history-loader','live-runtime','message-format','mod-loader','pill-preview','preview-session','send-confirmation','pipe','read-marker','shell-server','slack-installation','triage-state'].map(n=>`src/${n}.mjs`),
  ...['mark-read','native-reply','read-api','state-observer','triage'].map(n=>`src/renderer/${n}.js`),
  ...['build-shell','control','dev','devctl','doctor','mods','shellctl'].map(n=>`scripts/${n}.mjs`),
  'pilot/Start Triage.command','pilot/Stop Triage.command','pilot/README.md'
];
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pme-pilot-')),stage=path.join(temp,'PimpMyElectron');
const out=path.join(root,'dist/PimpMyElectron-pilot-macos-arm64.zip');
try{
  const checksums=[];
  for(const name of files){
    const source=path.join(root,name),stat=await fs.lstat(source);if(!stat.isFile()||stat.isSymbolicLink())throw Error(`Expected a regular source file: ${name}`);
    const relative=name.replace(/^pilot\//,''),destination=path.join(stage,relative),data=await fs.readFile(source);
    await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,data,{mode:name.endsWith('.command')?0o755:0o644});
    checksums.push(`${createHash('sha256').update(data).digest('hex')}  ${relative}`);
  }
  const packageJSON=JSON.stringify({name:'slack-triage-pilot',version:'0.20.0',private:true,type:'module',engines:{node:'>=22'},scripts:{doctor:'node scripts/doctor.mjs',dev:'node scripts/dev.mjs','dev:debug':'node scripts/dev.mjs --development','dev:stop':'node scripts/devctl.mjs stop','dev:reload':'node scripts/devctl.mjs reload',mods:'node scripts/mods.mjs',shell:'node scripts/shellctl.mjs'}},null,2)+'\n';
  await fs.writeFile(path.join(stage,'package.json'),packageJSON);checksums.push(`${createHash('sha256').update(packageJSON).digest('hex')}  package.json`);
  await fs.writeFile(path.join(stage,'SHA256SUMS'),checksums.join('\n')+'\n');await fs.mkdir(path.dirname(out),{recursive:true});
  const zip=spawnSync('/usr/bin/ditto',['-c','-k','--norsrc','--keepParent',stage,out],{encoding:'utf8'});if(zip.status!==0)throw Error(zip.stderr||'Archive creation failed');
  console.log(JSON.stringify({path:out,files:checksums.length+1,bytes:(await fs.stat(out)).size,sha256:createHash('sha256').update(await fs.readFile(out)).digest('hex'),containsPrivateState:false,includesAutomaticSendExperiments:false},null,2));
}finally{await fs.rm(temp,{recursive:true,force:true});}
