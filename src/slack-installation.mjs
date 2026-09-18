// Read only the installed application bundle; never inspect Slack account data.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
export function classifyDistribution({bundleId,teamId,sandboxed,receipt,developerId}){
  if(bundleId!=='com.tinyspeck.slackmacgap'||teamId!=='BQR82RBBHL')throw Error('Expected an official Slack application signed by Slack.');
  if(sandboxed&&receipt)return 'app-store';
  if(!sandboxed&&!receipt&&developerId)return 'direct-download';
  throw Error('Unrecognized Slack distribution; profile isolation must be qualified before launch.');
}
export function developmentProfile(distribution,home=os.homedir()){
  const base=distribution==='app-store'?'Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support':distribution==='direct-download'?'Library/Application Support':null;
  if(!base)throw Error('Unknown Slack distribution');
  return path.join(home,base,'SlackIntegrationTest');
}
export function inspectInstallation(app=process.env.PME_SLACK_APP||'/Applications/Slack.app'){
  if(process.platform!=='darwin')throw Error('The current launcher requires macOS');
  if(!path.isAbsolute(app))throw Error('PME_SLACK_APP must be an absolute application path');
  const contents=path.join(app,'Contents');
  const run=(bin,args)=>{const r=spawnSync(bin,args,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});if(r.status!==0)throw Error(`Application check failed: ${path.basename(bin)}`);return r;};
  const plist=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',path.join(contents,'Info.plist')]).stdout);
  run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
  const signature=run('/usr/bin/codesign',['-dv','--verbose=4',app]).stderr;
  const entitlements=run('/usr/bin/codesign',['-d','--entitlements',':-',app]).stdout;
  const distribution=classifyDistribution({bundleId:plist.CFBundleIdentifier,teamId:signature.match(/^TeamIdentifier=(.+)$/m)?.[1],sandboxed:/<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\s*\/>/.test(entitlements),receipt:fs.existsSync(path.join(contents,'_MASReceipt/receipt')),developerId:/^Authority=Developer ID Application:/m.test(signature)});
  return {app,version:plist.CFBundleShortVersionString,distribution,executable:path.join(contents,'MacOS/Slack'),profile:developmentProfile(distribution)};
}
export function readProfileOwners(file){
  try{const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.schemaVersion===2&&Array.isArray(value.profiles)&&value.profiles.every(p=>typeof p?.profile==='string'))return value.profiles;
    if(typeof value.profile==='string')return [{profile:value.profile}];
    throw Error('Invalid profile ownership marker; preserve it before setup.');
  }catch(error){if(error.code==='ENOENT')return [];throw error;}
}
export function profileOwned(file,profile){return readProfileOwners(file).some(p=>p.profile===profile);}
export function claimProfile(file,installation){
  const profiles=readProfileOwners(file),known=profiles.some(p=>p.profile===installation.profile);
  if(!known&&fs.existsSync(installation.profile))throw Error('An unowned integration-test profile exists. Preserve it before setup.');
  if(!known)profiles.push({profile:installation.profile,distribution:installation.distribution});
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify({schemaVersion:2,profiles},null,2)+'\n',{mode:0o600});fs.chmodSync(temp,0o600);fs.renameSync(temp,file);
}
