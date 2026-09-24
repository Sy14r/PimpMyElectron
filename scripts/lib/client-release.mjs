import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('../..',import.meta.url));
export const env={...process.env,DEVELOPER_DIR:process.env.DEVELOPER_DIR||'/Library/Developer/CommandLineTools'};
export function run(bin,args,{stdio='pipe',...options}={}) {
 const r=spawnSync(bin,args,{cwd:root,env,encoding:'utf8',maxBuffer:16*1024*1024,stdio,...options});
 if(r.error||r.status!==0)throw Error(`${path.basename(bin)} failed (${r.status}): ${(r.stderr||r.stdout||r.error?.message||'see log').trim()}`);
 return (r.stdout||'').trim();
}
export function metadata(value=JSON.parse(fs.readFileSync(path.join(root,'client/version.json'),'utf8'))) {
 if(!/^\d+\.\d+\.\d+$/.test(value.version)||!Number.isSafeInteger(value.build)||value.build<1||!/^\d+\.\d+(?:\.\d+)?$/.test(value.minimumMacOS))throw Error('Invalid client version/build/minimumMacOS');
 return {...value,tag:`client-v${value.version}`,asset:`PimpMyElectron-${value.version}-macOS-arm64.zip`};
}
export const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export function write(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
export function assertClean(){if(run('git',['status','--porcelain']))throw Error('Commit all source changes before preparing a release.');return run('git',['rev-parse','HEAD']);}
export function expectedEntitlements(kind){return kind==='node'?{'com.apple.security.cs.allow-jit':true}:{};}
export function checkEntitlements(actual,kind){if(JSON.stringify(Object.entries(actual).sort())!==JSON.stringify(Object.entries(expectedEntitlements(kind)).sort()))throw Error(`Unexpected ${kind} release entitlements`);}
export function signatureInfo(details){
 if(!/flags=.*\bruntime\b/.test(details)||!/^Timestamp=/m.test(details))throw Error('Release requires hardened runtime and a secure timestamp');
 const cdhash=details.match(/^CDHash=(\w+)$/m)?.[1];if(!cdhash)throw Error('Missing signature CDHash');return cdhash;
}
export function verifyApp(app,team){
 if(!/^[A-Z0-9]{10}$/.test(team))throw Error('Expected Apple Team ID');
 const plist=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',path.join(app,'Contents/Info.plist')]));
 if(plist.CFBundleIdentifier!=='com.pimpmyElectron.client')throw Error('Not a PME client');
 const requirement=`anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "${team}"`;
 const seal=run('/usr/bin/plutil',['-convert','xml1','-o','-',path.join(app,'Contents/_CodeSignature/CodeResources')]);
 const nested=seal.split('<key>Helpers/SlackLauncher.app</key>')[1]?.split('</dict>')[0];
 if(!nested?.includes('<key>cdhash</key>'))throw Error('Shortcut template must be sealed as nested code, not an ordinary resource');
 const hashes={};
 for(const [kind,target] of [['node',path.join(app,'Contents/Resources/bin/node')],['helper',path.join(app,'Contents/Resources/runtime/bin/SlackTriage')],['launcher',path.join(app,'Contents/Helpers/SlackLauncher.app')],['app',app]]){
  run('/usr/bin/codesign',['--verify','--deep','--strict','--all-architectures',`-R=${requirement}`,target]);
  const details=spawnSync('/usr/bin/codesign',['-d','--verbose=4',target],{encoding:'utf8'});if(details.status!==0)throw Error('Could not inspect signature');
  hashes[kind]=signatureInfo(details.stderr);
  const xml=run('/usr/bin/codesign',['-d','--entitlements',':-',target]);
  const entitlements=xml?JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-','-'],{input:xml})):{};checkEntitlements(entitlements,kind);
 }
 return {hashes,version:plist.CFBundleShortVersionString,build:Number(plist.CFBundleVersion)};
}
export function assertManifest(m){
 const v=metadata(m);
 if(m.schemaVersion!==1||m.repo!=='Sy14r/PimpMyElectron'||m.tag!==v.tag||m.asset!==v.asset||! /^[a-f0-9]{40}$/.test(m.commit)||! /^[a-f0-9]{64}$/.test(m.uploadSHA256))throw Error('Invalid release manifest');
 return m;
}
export function assertSameApp(m,actual){if(actual.version!==m.version||actual.build!==m.build||JSON.stringify(actual.hashes)!==JSON.stringify(m.signatures))throw Error('Staged app differs from the prepared release');}
export function submissionAction({submission,attemptExists,status}){
 if(submission&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(submission))throw Error('Invalid Apple submission ID');
 if(!submission&&attemptExists)throw Error('Uncertain upload: inspect submission-attempt.json and Apple history before retrying');
 if(!submission)return 'submit';if(status==='Accepted')return 'staple';if(['Invalid','Rejected'].includes(status))throw Error(`Apple ${status} this submission; inspect notarization-log.json`);return 'wait';
}
