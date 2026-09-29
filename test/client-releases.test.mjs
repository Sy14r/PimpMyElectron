import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {releaseHistory} from '../client/core/releases.mjs';
test('bundled release history sorts versions and excludes future notes, unrelated files and symlinks',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pme-notes-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const dir=path.join(root,'client/releases');await fs.mkdir(dir,{recursive:true});
 for(const name of ['0.5.2','0.5.1','0.4.0','0.10.0'])await fs.writeFile(path.join(dir,name+'.md'),'# Version '+name+'\n\n- Change');
 await fs.writeFile(path.join(dir,'private.md'),'not a release');await fs.symlink(path.join(dir,'private.md'),path.join(dir,'0.5.0.md'));
 assert.deepEqual((await releaseHistory(root,'0.5.2')).releases.map(r=>r.version),['0.5.2','0.5.1','0.4.0']);
 assert.equal((await releaseHistory(root,'0.10.0')).releases[0].version,'0.10.0');
});
test('release notes render formatting without interpreting HTML or executing links',async()=>{
 const s=await fs.readFile(new URL('../client/ui/app.js',import.meta.url),'utf8');const env={};
 vm.runInNewContext(s.slice(s.indexOf('const esc='),s.indexOf('const paths='))+s.slice(s.indexOf('function releaseMarkdown('),s.indexOf('function releasesView(')),env);
 const out=env.releaseMarkdown('# Title\n\n## Fixes\n\n- **Good** `code`\n- <img src=x onerror=alert(1)>\n\n[link](javascript:alert(1))');
 assert.ok(out.includes('<strong>Good</strong>'));assert.ok(out.includes('<h3>Fixes</h3>'));assert.ok(!out.includes('<img'));assert.ok(!out.includes('<a'));assert.ok(out.includes('&lt;img'));
});
