import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {accentTheme,contrast,DEFAULT_ACCENT} from '../src/accent-theme.mjs';
import {TriageState} from '../src/triage-state.mjs';

test('accent preference persists exact custom colors and rejects CSS, alpha and malformed values',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-accent-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'state.json'),state=await new TriageState(file).load();
  assert.equal(state.settings.accentColor,DEFAULT_ACCENT);
  await state.configure({accentColor:'#12AbEF'});
  const loaded=await new TriageState(file).load();assert.equal(loaded.settings.accentColor,'#12abef');
  for(const accentColor of ['red','#fff','#12345678','url(https://example.com)','var(--foo)',null,42]){
    await loaded.configure({accentColor});assert.equal(loaded.settings.accentColor,'#12abef');
  }
});
test('custom colors keep exact fills with readable text and button labels, including black and white',()=>{
  for(const color of ['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#ff00ff','#777777',DEFAULT_ACCENT,'#86b7ff','#65d6c1','#a0d789','#efc477','#ed9cbd']){
    const theme=accentTheme(color);assert.equal(theme['--pme-accent'],color);
    assert.ok(contrast(theme['--pme-accent-text'],'#202735')>=4.5,color);
    assert.ok(contrast(color,theme['--pme-accent-contrast'])>=4.5,color);
    assert.ok(contrast(theme['--pme-accent-hover'],theme['--pme-accent-hover-contrast'])>=4.5,color);
  }
  assert.deepEqual(accentTheme('invalid'),accentTheme(DEFAULT_ACCENT));
});
test('web surfaces use available theme tokens and applying a theme is idempotent and removable',async()=>{
  const triage=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
  const native=await fs.readFile(new URL('../src/renderer/native-reply.js',import.meta.url),'utf8');
  const theme=accentTheme('#65d6c1');
  for(const match of (triage+native).matchAll(/var\((--pme-accent[a-z0-9-]*),/g))assert.ok(match[1] in theme,match[1]);
  const values=new Map();let writes=0;
  const env={document:{documentElement:{style:{setProperty(k,v){writes++;values.set(k,v);},removeProperty:k=>values.delete(k)}}}};
  vm.runInNewContext(triage.slice(triage.indexOf('  const accentProperties='),triage.indexOf('  shadow.innerHTML =')),env);
  env.applyAccent(theme);assert.equal(values.get('--pme-accent'),'#65d6c1');
  const before=writes;env.applyAccent(theme);assert.equal(writes,before);
  env.applyAccent({'--sk_highlight':'0,0,0','--pme-accent':'url(bad)'});assert.equal(values.size,0);
  env.applyAccent(theme);env.applyAccent(null);assert.equal(values.size,0);
});
