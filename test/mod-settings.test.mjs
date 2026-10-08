import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {APPEARANCE_DEFAULTS,CUSTOM_CSS_DEFAULTS,ModSettings,LAYOUT_DEFAULTS,MESSAGE_POLISH_DEFAULTS,PERSONAL_EMOJI_DEFAULTS,REPLY_TOOLS_DEFAULTS,SIDEBAR_PRODUCTIVITY_DEFAULTS,parsePersonalEmoji,parseSlackTheme,sanitizeCustomCSS} from '../src/mod-settings.mjs';
import {TriageState} from '../src/triage-state.mjs';

test('shared mod settings validate and persist isolated namespaces',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-mod-settings-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'mod-settings.json'),store=await new ModSettings(file).load();
 assert.deepEqual(store.get('slack-layout'),LAYOUT_DEFAULTS);
 assert.deepEqual(store.get('slack-appearance'),APPEARANCE_DEFAULTS);
 assert.deepEqual(store.get('slack-custom-css'),CUSTOM_CSS_DEFAULTS);assert.deepEqual(store.get('slack-personal-emoji'),PERSONAL_EMOJI_DEFAULTS);assert.deepEqual(store.get('slack-sidebar-productivity'),SIDEBAR_PRODUCTIVITY_DEFAULTS);
 assert.deepEqual(store.get('slack-message-polish'),MESSAGE_POLISH_DEFAULTS);assert.deepEqual(store.get('slack-quote-reply'),REPLY_TOOLS_DEFAULTS);
 await store.configure('slack-layout',{railMode:'hidden',hiddenRailPlacement:'sidebar',railHome:true,hideWorkspaceSwitcher:true});await store.configure('slack-sidebar-productivity',{unifiedEnabled:true,sidebarMode:'conversation',sidebarThreshold:900,replyAction:false,prewarmReply:true});
 await store.configure('slack-message-polish',{tintOwn:true,tintIntensity:55,calmHover:false,compactSpacing:true,readableLinks:false});
 await store.configure('slack-quote-reply',{quoteAction:false,previewShortcut:true});
 await store.configure('slack-appearance',{preset:'ocean',systemNavigation:'#ABCDEF'});
 await store.configure('slack-triage',{senderTints:true,inboxOpacity:41});
 const restored=await new ModSettings(file).load();assert.equal(restored.get('slack-layout').railHome,true);assert.equal(restored.get('slack-layout').hideWorkspaceSwitcher,true);assert.equal(restored.get('slack-sidebar-productivity').unifiedEnabled,true);assert.equal(restored.get('slack-sidebar-productivity').sidebarMode,'conversation');assert.equal(restored.get('slack-sidebar-productivity').smallWindowSidebar,true);assert.equal(restored.get('slack-sidebar-productivity').compactSidebar,false);assert.equal(restored.get('slack-sidebar-productivity').autoHideWidth,900);assert.equal(restored.get('slack-sidebar-productivity').conversationWidth,900);assert.equal(restored.get('slack-sidebar-productivity').replyAction,false);assert.equal(restored.get('slack-message-polish').tintIntensity,55);assert.equal(restored.get('slack-message-polish').calmHover,false);assert.equal(restored.get('slack-message-polish').compactSpacing,true);assert.equal(restored.get('slack-message-polish').readableLinks,false);assert.equal(restored.get('slack-quote-reply').quoteAction,false);assert.equal(restored.get('slack-appearance').preset,'ocean');assert.equal(restored.get('slack-appearance').systemNavigation,'#abcdef');assert.equal(restored.get('slack-triage').senderTints,true);assert.equal(restored.get('slack-triage').inboxOpacity,41);
 await restored.configure('slack-sidebar-productivity',{sidebarMode:'invalid',autoHideWidth:1});await restored.configure('slack-layout',{railHome:'yes'});await restored.configure('slack-message-polish',{tintIntensity:101,tintOwn:'yes'});assert.equal(restored.get('slack-sidebar-productivity').sidebarMode,'conversation');assert.equal(restored.get('slack-sidebar-productivity').autoHideWidth,900);assert.equal(restored.get('slack-layout').railHome,true);assert.equal(restored.get('slack-message-polish').tintIntensity,55);assert.equal(restored.get('slack-message-polish').tintOwn,true);
 assert.equal(restored.get('slack-layout').railMode,'hidden');assert.equal(restored.get('slack-layout').hiddenRailPlacement,'sidebar');assert.equal(restored.get('slack-layout').minimalTopBar,true);
 await assert.rejects(restored.configure('unknown-mod',{}),/no configurable settings/);
});

test('Wave 3 settings reject network-capable CSS and unsafe personal emoji hosts',async t=>{
 assert.equal(sanitizeCustomCSS('.c-message { line-height: 1.35; }'),'.c-message { line-height: 1.35; }');
 for(const css of ['@import "https://example.com/x.css"','.x{background:url(https://example.com/x)}','.x{background:u/**/rl(https://example.com/x)}','.x{background-image:image-set("https://example.com/x" 1x)}','.x{background:image("relative.png")}','.x{content:"https://example.com/x"}','.x{color:red} /* ok */ [data-pme-layout]{display:none}','.x\\72 {color:red}'])assert.throws(()=>sanitizeCustomCSS(css));
 assert.deepEqual(parsePersonalEmoji(':shipit: :deploy: https://cdn.example.com/shipit.png\n:party_parrot: https://images.example.org/p.gif'),[{name:'shipit',aliases:['deploy'],url:'https://cdn.example.com/shipit.png'},{name:'party_parrot',aliases:[],url:'https://images.example.org/p.gif'}]);
 for(const definitions of [':x: http://example.com/x.png',':x: https://localhost/x.png',':x: https://127.0.0.1/x.png',':x: https://169.254.169.254/x',':x: https://example.com/x\n:x: https://example.com/y'])assert.equal(parsePersonalEmoji(definitions),null);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-wave-three-settings-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=await new ModSettings(path.join(dir,'mod-settings.json')).load();
 await store.configure('slack-custom-css',{css:'.c-message { opacity: .95; }'});await store.configure('slack-personal-emoji',{definitions:':SHIPIT: :Deploy: https://cdn.example.com/shipit.png'});await store.configure('slack-sidebar-productivity',{hoverDelay:700});
 assert.equal(store.get('slack-custom-css').css,'.c-message { opacity: .95; }');assert.equal(store.get('slack-personal-emoji').definitions,':shipit: :deploy: https://cdn.example.com/shipit.png');assert.equal(store.get('slack-sidebar-productivity').hoverDelay,700);
 await assert.rejects(store.configure('slack-custom-css',{css:'.x{background:url(https://bad.example/x)}'}),/cannot contain/);await assert.rejects(store.configure('slack-personal-emoji',{definitions:':x: https://localhost/x'}),/public HTTPS/);
});

test('Slack appearance imports four- and eight-color theme strings safely',async t=>{
 assert.deepEqual(parseSlackTheme('#111111, #222222, #333333, #444444'),{systemNavigation:'#111111',selectedItems:'#222222',presenceIndication:'#333333',notifications:'#444444'});
 assert.deepEqual(parseSlackTheme('#111111,#121212,#222222,#232323,#242424,#252525,#333333,#444444'),{systemNavigation:'#111111',selectedItems:'#222222',presenceIndication:'#333333',notifications:'#444444'});
 assert.equal(parseSlackTheme('#111111,#222222,#333333'),null);assert.equal(parseSlackTheme('#111111,#222222,#333333,not-a-color'),null);assert.equal(parseSlackTheme('x'.repeat(301)),null);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-appearance-settings-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=await new ModSettings(path.join(dir,'mod-settings.json')).load();
 const imported=await store.configure('slack-appearance',{themeString:'#102030,#405060,#708090,#a0b0c0'});assert.equal(imported.preset,'custom');assert.equal(imported.systemNavigation,'#102030');assert.equal(imported.notifications,'#a0b0c0');assert.equal(imported.themeString,'');
 await assert.rejects(store.configure('slack-appearance',{themeString:'#bad'}),/four or eight/);assert.deepEqual(store.get('slack-appearance'),imported);
});

test('version 1 Layout and Peek settings migrate into Sidebar Productivity',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-sidebar-settings-migration-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'mod-settings.json');
 await fs.writeFile(file,JSON.stringify({version:1,mods:{'slack-layout':{railHome:true,hideSlackbot:true,sidebarMode:'auto-hide',autoHideWidth:840,conversationWidth:920},'slack-sidebar-peek':{hoverDelay:650}}}));
 const store=await new ModSettings(file).load(),sidebar=store.get('slack-sidebar-productivity');assert.equal(store.get('slack-layout').railHome,true);assert.equal(sidebar.organizerEnabled,true);assert.equal(sidebar.peekEnabled,true);assert.equal(sidebar.hideSlackbot,true);assert.equal(sidebar.sidebarMode,'auto-hide');assert.equal(sidebar.autoHideSidebar,true);assert.equal(sidebar.compactSidebar,false);assert.equal(sidebar.autoHideWidth,840);assert.equal(sidebar.conversationWidth,920);assert.equal(sidebar.hoverDelay,650);assert.equal(sidebar.openAction,true);assert.equal(sidebar.replyAction,true);
 const raw=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(raw.version,2);assert.equal(Object.hasOwn(raw.mods,'slack-sidebar-peek'),false);
});

test('legacy Triage preferences migrate once while workflow records remain separate',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-settings-migration-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const stateFile=path.join(dir,'triage-state.json');
 await fs.writeFile(stateFile,JSON.stringify({version:1,settings:{senderTints:true,inboxOpacity:62},records:{'TONE:CONE:':{state:'done',pinned:false,at:1}},aliases:{}}));
 const state=await new TriageState(stateFile).load();assert.equal(state.settings.senderTints,true);assert.equal(state.settings.inboxOpacity,62);assert.equal(state.records.get('TONE:CONE:').state,'done');
 const shared=JSON.parse(await fs.readFile(path.join(dir,'mod-settings.json'),'utf8'));assert.equal(shared.mods['slack-triage'].inboxOpacity,62);
 await state.act({key:'TONE:CONE:',latest:'100.000001',unread:true},'reopen');const workflow=JSON.parse(await fs.readFile(stateFile,'utf8'));assert.equal(Object.hasOwn(workflow,'settings'),false);assert.ok(workflow.records);
});

test('corrupt shared settings are preserved and reject writes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-settings-corrupt-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'mod-settings.json');await fs.writeFile(file,'broken');
 const store=await new ModSettings(file).load();assert.ok(store.error);await assert.rejects(store.configure('slack-layout',{railHome:true}));assert.equal(await fs.readFile(file,'utf8'),'broken');
 const workflow=await new TriageState(path.join(dir,'triage-state.json')).load();assert.ok(workflow.settingsError);await workflow.act({key:'TONE:CONE:',latest:'100.000001',unread:true},'done');assert.equal(workflow.project({key:'TONE:CONE:',latest:'100.000001',unread:true}).state,'done');
});
