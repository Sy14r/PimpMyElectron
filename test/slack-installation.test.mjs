import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {classifyDistribution,developmentProfile,claimProfile,profileOwned,readProfileOwners} from '../src/slack-installation.mjs';
const official={bundleId:'com.tinyspeck.slackmacgap',teamId:'BQR82RBBHL'};
test('official App Store and direct builds select distinct integration profiles',()=>{
  assert.equal(classifyDistribution({...official,sandboxed:true,receipt:true}),'app-store');
  assert.equal(classifyDistribution({...official,sandboxed:false,receipt:false,developerId:true}),'direct-download');
  assert.equal(developmentProfile('direct-download','/fixture'),'/fixture/Library/Application Support/SlackIntegrationTest');
  assert.equal(developmentProfile('app-store','/fixture'),'/fixture/Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/SlackIntegrationTest');
  assert.throws(()=>developmentProfile('unknown'));
});
test('ambiguous or unofficial signing/distribution combinations cannot choose a profile',()=>{
  for(const patch of [{teamId:'OTHER'},{bundleId:'other'},{sandboxed:true,receipt:false},{sandboxed:false,receipt:true},{developerId:false}])assert.throws(()=>classifyDistribution({...official,sandboxed:false,receipt:false,developerId:true,...patch}));
});
test('legacy ownership survives adding another distribution and is reused on return',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pme-owner-test-'));
  try{const file=path.join(dir,'owner.json'),mas=path.join(dir,'mas'),direct=path.join(dir,'direct');fs.mkdirSync(mas);fs.writeFileSync(file,JSON.stringify({profile:mas}));
    claimProfile(file,{profile:direct,distribution:'direct-download'});fs.mkdirSync(direct);
    assert.equal(profileOwned(file,mas),true);assert.equal(profileOwned(file,direct),true);
    claimProfile(file,{profile:mas,distribution:'app-store'});assert.equal(readProfileOwners(file).length,2);assert.equal(fs.statSync(file).mode&0o777,0o600);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('unowned existing profiles and corrupt markers are preserved and rejected',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pme-owner-test-'));
  try{const file=path.join(dir,'owner.json'),profile=path.join(dir,'profile');fs.mkdirSync(profile);fs.writeFileSync(path.join(profile,'sentinel'),'retain');
    assert.throws(()=>claimProfile(file,{profile}));assert.equal(fs.existsSync(file),false);
    fs.writeFileSync(file,'broken');assert.throws(()=>claimProfile(file,{profile}));assert.equal(fs.readFileSync(file,'utf8'),'broken');assert.equal(fs.readFileSync(path.join(profile,'sentinel'),'utf8'),'retain');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
