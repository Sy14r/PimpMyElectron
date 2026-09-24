import {test} from 'node:test';import assert from 'node:assert/strict';
import {metadata,checkEntitlements,signatureInfo,assertManifest,assertSameApp,submissionAction} from '../scripts/lib/client-release.mjs';
test('client versioning fixes tag and artifact names and rejects unsafe metadata',()=>{
 const v=metadata({version:'0.1.0',build:1,minimumMacOS:'13.3'});assert.equal(v.tag,'client-v0.1.0');assert.equal(v.asset,'PimpMyElectron-0.1.0-macOS-arm64.zip');
 for(const change of [{version:'../../evil'},{version:'1.2.3-beta'},{build:0},{build:1.2},{minimumMacOS:'13&'}])assert.throws(()=>metadata({...v,...change}));
});
test('release entitlements permit JIT only in Node and reject debug/library bypasses',()=>{
 checkEntitlements({},'app');checkEntitlements({},'helper');checkEntitlements({'com.apple.security.cs.allow-jit':true},'node');
 for(const key of ['com.apple.security.get-task-allow','com.apple.security.cs.disable-library-validation','com.apple.security.cs.allow-unsigned-executable-memory'])assert.throws(()=>checkEntitlements({'com.apple.security.cs.allow-jit':true,[key]:true},'node'));
 assert.throws(()=>checkEntitlements({'com.apple.security.cs.allow-jit':true},'app'));assert.throws(()=>checkEntitlements({},'node'));
});
test('release signatures require hardened runtime and timestamp',()=>{
 const details='flags=0x10000(runtime)\nTimestamp=Sep 24, 2026\nCDHash=abcd1234\n';assert.equal(signatureInfo(details),'abcd1234');
 assert.throws(()=>signatureInfo(details.replace('runtime','adhoc')));assert.throws(()=>signatureInfo(details.replace('Timestamp=','SignedTime=')));
});
test('notarization pending/rejection/uncertain upload never counts as accepted',()=>{
 const submission='c2145075-f63c-4556-a861-c1325a14a419';assert.equal(submissionAction({}),'submit');assert.equal(submissionAction({submission}),'wait');assert.equal(submissionAction({submission,status:'In Progress'}),'wait');assert.equal(submissionAction({submission,status:'Accepted'}),'staple');
 assert.throws(()=>submissionAction({attemptExists:true}),/Uncertain/);assert.throws(()=>submissionAction({submission:'bad'}));assert.throws(()=>submissionAction({submission,status:'Invalid'}));assert.throws(()=>submissionAction({submission,status:'Rejected'}));
});
test('manifest prevents publishing wrong repository, unsafe filenames, or substituted app',()=>{
 const m={schemaVersion:1,...metadata(),repo:'Sy14r/PimpMyElectron',commit:'a'.repeat(40),uploadSHA256:'b'.repeat(64),signatures:{node:'n',helper:'h',app:'a'}};
 assertManifest(m);for(const change of [{repo:'Sy14r/Ledge'},{asset:'../../oops'},{tag:'v0.1.0'},{commit:'HEAD'},{uploadSHA256:'missing'}])assert.throws(()=>assertManifest({...m,...change}));
 const actual={version:m.version,build:m.build,hashes:m.signatures};assertSameApp(m,actual);assert.throws(()=>assertSameApp(m,{...actual,build:m.build+1}));assert.throws(()=>assertSameApp(m,{...actual,hashes:{...m.signatures,node:'other'}}));
});
