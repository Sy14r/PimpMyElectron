// Local Keychain-backed release pipeline, adapted from SlackAssist/Ledge.
// No keys/passwords are exported or uploaded to GitHub. Publishing is explicit.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,env,run,metadata,read,write,hash,assertClean,verifyApp,assertManifest,assertSameApp,submissionAction} from './lib/client-release.mjs';
const [command='help',input,...args]=process.argv.slice(2);
const help=`Usage:
  npm run client:release -- prepare
  npm run client:release -- notarize RELEASE_DIRECTORY
  npm run client:release -- publish RELEASE_DIRECTORY --notes NOTES.md
  npm run client:release -- verify-download RELEASE_DIRECTORY
  npm run client:release -- all --notes NOTES.md

Signing: PME_SIGNING_IDENTITY, PME_TEAM_ID, PME_NOTARY_PROFILE (Keychain name).
prepare requires a clean checkout and creates an isolated build under .lab/releases.
notarize resumes the saved Apple submission; pending is exit code 2.
publish pushes a version tag and creates a draft, verifies downloaded assets, then publishes.
all performs each stage; if Apple is pending, resume notarize then publish.
`;
const tool=name=>run('/usr/bin/xcrun',['--find',name]);
function need(name){if(!process.env[name])throw Error(`Set ${name} (a name/identifier, never a secret).`);return process.env[name];}
function load(dir){dir=fs.realpathSync(dir);const m=assertManifest(read(path.join(dir,'manifest.json')));return {dir,m,app:path.join(dir,'PimpMyElectron.app')};}
function verifyPrepared(r){assertSameApp(r.m,verifyApp(r.app,r.m.teamID));if(hash(path.join(r.dir,'notarization-upload.zip'))!==r.m.uploadSHA256)throw Error('Upload archive changed');}
function gatekeeper(app){run(tool('stapler'),['validate',app]);run('/usr/sbin/spctl',['--assess','--type','execute','--verbose=2',app]);if(fs.existsSync('/usr/bin/syspolicy_check'))run('/usr/bin/syspolicy_check',['distribution',app]);}
function extractVerified(zip,destination,m){run('/usr/bin/ditto',['-x','-k',zip,destination]);const app=path.join(destination,'PimpMyElectron.app');assertSameApp(m,verifyApp(app,m.teamID));gatekeeper(app);return app;}
function finalArtifact(r){
 verifyPrepared(r);if(r.m.notarizationStatus!=='Accepted'||!r.m.notarizationID||!r.m.artifactSHA256)throw Error('Not an accepted, finalized release');
 submissionAction({submission:r.m.notarizationID,status:'Accepted'});
 if(hash(path.join(r.dir,r.m.asset))!==r.m.artifactSHA256)throw Error('Final artifact changed');
 const expected=`${r.m.artifactSHA256}  ${r.m.asset}\n`;if(fs.readFileSync(path.join(r.dir,'SHA256SUMS'),'utf8')!==expected)throw Error('Checksum file changed');
 gatekeeper(r.app);
}
function prepare(){
 const commit=assertClean(),v=metadata(),identity=need('PME_SIGNING_IDENTITY'),teamID=need('PME_TEAM_ID');
 if(!/^[A-Z0-9]{10}$/.test(teamID))throw Error('Invalid Apple Team ID');
 run(tool('notarytool'),['history','--keychain-profile',need('PME_NOTARY_PROFILE'),'--output-format','json']);
 fs.mkdirSync(path.join(root,'.lab/releases'),{recursive:true,mode:0o700});
 const dir=fs.mkdtempSync(path.join(root,`.lab/releases/${v.tag}-build${v.build}-`)),app=path.join(dir,'PimpMyElectron.app');
 console.log(`Preparing ${dir}`);
 run(process.execPath,['scripts/build-client.mjs'],{stdio:'inherit',env:{...env,PME_CLIENT_OUTPUT:app}});
 const node=path.join(app,'Contents/Resources/bin/node'),helper=path.join(app,'Contents/Resources/runtime/bin/SlackTriage');
 for(const [target,id,entitlements] of [[node,'com.pimpmyElectron.client.node',path.join(root,'client/native/Node.entitlements')],[helper,'com.pimpmyElectron.client.triage',null],[app,'com.pimpmyElectron.client',null]]){
  run('/usr/bin/codesign',['--force','--options','runtime','--timestamp','--identifier',id,...(entitlements?['--entitlements',entitlements]:[]),'--sign',identity,target]);
 }
 const signatures=verifyApp(app,teamID).hashes;
 // Execute the complete suite under the exact hardened, signed Node we ship.
 const tests=spawnSync(node,['--test'],{cwd:root,env,encoding:'utf8',maxBuffer:32*1024*1024});fs.writeFileSync(path.join(dir,'tests.log'),(tests.stdout||'')+(tests.stderr||''));
 if(tests.status!==0)throw Error(`Signed Node tests failed; see ${dir}/tests.log`);
 run(node,['scripts/smoke-client.mjs',app],{stdio:'inherit'});
 if(assertClean()!==commit)throw Error('Source changed during the release build');
 run('/usr/bin/ditto',['-c','-k','--keepParent',app,path.join(dir,'notarization-upload.zip')]);
 write(path.join(dir,'manifest.json'),{schemaVersion:1,...v,repo:'Sy14r/PimpMyElectron',commit,teamID,signatures,uploadSHA256:hash(path.join(dir,'notarization-upload.zip')),createdUTC:new Date().toISOString()});
 console.log(`Signed and tested. Next: npm run client:release -- notarize '${dir}'`);return dir;
}
function notarize(dir){
 const r=load(dir);verifyPrepared(r);const profile=need('PME_NOTARY_PROFILE'),notary=tool('notarytool'),lock=path.join(r.dir,'.notarization-lock');
 fs.mkdirSync(lock);
 try{
  const submissionFile=path.join(r.dir,'submission.json'),attemptFile=path.join(r.dir,'submission-attempt.json');
  let submission=fs.existsSync(submissionFile)?read(submissionFile).id:null;
  if(submissionAction({submission,attemptExists:fs.existsSync(attemptFile)})==='submit'){
   run(notary,['history','--keychain-profile',profile,'--output-format','json']);
   // An uncertain upload is never automatically resubmitted.
   fs.writeFileSync(attemptFile,'{}\n');
   const response=run(notary,['submit',path.join(r.dir,'notarization-upload.zip'),'--keychain-profile',profile,'--no-wait','--output-format','json']);
   fs.writeFileSync(attemptFile,response);submission=JSON.parse(response).id;submissionAction({submission});fs.renameSync(attemptFile,submissionFile);
  }
  console.log(`Checking Apple submission ${submission}`);
  spawnSync(notary,['wait',submission,'--keychain-profile',profile,'--timeout','45s','--output-format','json'],{env,encoding:'utf8',timeout:55000});
  const status=JSON.parse(run(notary,['info',submission,'--keychain-profile',profile,'--output-format','json']));write(path.join(r.dir,'status.json'),status);
  if(['Accepted','Invalid','Rejected'].includes(status.status))run(notary,['log',submission,'--keychain-profile',profile,path.join(r.dir,'notarization-log.json')]);
  if(submissionAction({submission,status:status.status})!=='staple'){console.log(`Apple status: ${status.status}. Resume: npm run client:release -- notarize '${r.dir}'`);return false;}
  run(tool('stapler'),['staple',r.app]);gatekeeper(r.app);assertSameApp(r.m,verifyApp(r.app,r.m.teamID));
  const candidate=path.join(r.dir,'validated-candidate.zip');run('/usr/bin/ditto',['-c','-k','--keepParent',r.app,candidate]);
  const validation=fs.mkdtempSync(path.join(r.dir,'extracted-check-'));extractVerified(candidate,validation,r.m);fs.rmSync(validation,{recursive:true});
  fs.renameSync(candidate,path.join(r.dir,r.m.asset));
  Object.assign(r.m,{notarizationID:submission,notarizationStatus:'Accepted',artifactSHA256:hash(path.join(r.dir,r.m.asset))});
  write(path.join(r.dir,'manifest.json'),r.m);fs.writeFileSync(path.join(r.dir,'SHA256SUMS'),`${r.m.artifactSHA256}  ${r.m.asset}\n`);
  console.log(`Accepted, stapled, extracted, and Gatekeeper-validated: ${path.join(r.dir,r.m.asset)}`);return true;
 }finally{fs.rmdirSync(lock);}
}
function releaseAt(m){const result=spawnSync('gh',['release','view',m.tag,'--repo',m.repo,'--json','url,isDraft,targetCommitish,tagName'],{env,encoding:'utf8'});if(result.status===0)return JSON.parse(result.stdout);return null;}
function verifyDownload(dir){
 const r=load(dir);finalArtifact(r);const download=fs.mkdtempSync(path.join(r.dir,'github-download-'));
 run('gh',['release','download',r.m.tag,'--repo',r.m.repo,'--dir',download,'--pattern',r.m.asset,'--pattern','SHA256SUMS']);
 if(hash(path.join(download,r.m.asset))!==r.m.artifactSHA256||fs.readFileSync(path.join(download,'SHA256SUMS'),'utf8')!==fs.readFileSync(path.join(r.dir,'SHA256SUMS'),'utf8'))throw Error('GitHub download does not match the validated artifact');
 extractVerified(path.join(download,r.m.asset),path.join(download,'extracted'),r.m);
 console.log(`Verified GitHub download: ${download}`);
}
function publish(dir,notes){
 if(!notes||!fs.statSync(notes).isFile())throw Error('Provide --notes with reviewed release notes');
 const r=load(dir);finalArtifact(r);
 const remote=run('gh',['repo','view','--json','nameWithOwner']);if(JSON.parse(remote).nameWithOwner!==r.m.repo)throw Error('Wrong GitHub repository');
 const remoteURL=run('git',['remote','get-url','origin']);if(!/^(?:git@github\.com:|https:\/\/github\.com\/)Sy14r\/PimpMyElectron(?:\.git)?$/.test(remoteURL))throw Error('Unexpected origin; refusing release tag push');
 const ref=`refs/tags/${r.m.tag}`;
 const local=spawnSync('git',['rev-parse','--verify',ref],{cwd:root,env,encoding:'utf8'});
 if(local.status===0){if(run('git',['rev-list','-n','1',ref])!==r.m.commit)throw Error('Local release tag points to another commit');}
 else run('git',['tag',r.m.tag,r.m.commit]);
 const remoteTag=run('git',['ls-remote','origin',ref,ref+'^{}']).split('\n').filter(Boolean);
 if(remoteTag.length){const peeled=remoteTag.find(l=>l.endsWith('^{}'))||remoteTag[0];if(peeled.split(/\s/)[0]!==r.m.commit)throw Error('Remote release tag points to another commit');}
 else run('git',['push','origin',ref],{stdio:'inherit'});
 let release=releaseAt(r.m);
 if(!release){run('gh',['release','create',r.m.tag,'--repo',r.m.repo,'--verify-tag','--draft','--title',`PimpMyElectron Client ${r.m.version}`,'--notes-file',path.resolve(notes),path.join(r.dir,r.m.asset),path.join(r.dir,'SHA256SUMS'),path.join(r.dir,'manifest.json')]);release=releaseAt(r.m);}
 if(!release)throw Error('GitHub release creation could not be confirmed');
 // On resume, verify existing assets; never clobber a published release.
 verifyDownload(r.dir);
 if(release.isDraft)run('gh',['release','edit',r.m.tag,'--repo',r.m.repo,'--draft=false','--latest']);
 release=releaseAt(r.m);if(!release||release.isDraft)throw Error('Release publication could not be confirmed');
 console.log(`Published ${release.url}`);
}
try{
 if(command==='help'||command==='--help'){console.log(help);}
 else if(command==='prepare'){prepare();}
 else if(command==='notarize'){if(!notarize(input))process.exitCode=2;}
 else if(command==='publish'){if(args.length!==2||args[0]!=='--notes')throw Error(help);publish(input,args[1]);}
 else if(command==='verify-download'){verifyDownload(input);}
 else if(command==='all'){if(input!=='--notes'||args.length!==1)throw Error(help);const dir=prepare();if(notarize(dir))publish(dir,args[0]);else process.exitCode=2;}
 else throw Error(help);
}catch(error){console.error(error.message);process.exitCode=1;}
