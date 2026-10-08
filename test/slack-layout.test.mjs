import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateCatalog,moduleSelection} from '../client/core/catalog.mjs';

const source=await fs.readFile(new URL('../src/renderer/slack-layout.js',import.meta.url),'utf8');
const sidebar=await fs.readFile(new URL('../src/renderer/sidebar-productivity.js',import.meta.url),'utf8');

test('Slack Layout is independent and every behavior is opt-in',async()=>{
 const manifest=JSON.parse(await fs.readFile(new URL('../mods/runtime.json',import.meta.url))),catalog=validateCatalog(JSON.parse(await fs.readFile(new URL('../client/catalog.json',import.meta.url))),manifest.modules),slack=catalog.apps.find(app=>app.id==='slack');
 const selection=moduleSelection(slack,['slack-layout'],manifest.modules);assert.equal(selection.disabled.includes('slack-layout'),false);for(const id of ['triage-surface','state-observer','native-reply','quote-reply','message-polish','sender-tints','slack-appearance'])assert.equal(selection.disabled.includes(id),true);
 const mod=slack.mods.find(item=>item.id==='slack-layout');assert.equal(mod.defaultEnabled,false);for(const key of ['railMode','hiddenRailPlacement','hideWorkspaceSwitcher','railAgents','railCreate','railFocus','railProfile','railMore','singleLineHeader','threadPaneWidth','toolbarFollowsPointer'])assert.ok(mod.settings.some(setting=>setting.key===key),`missing setting ${key}`);for(const key of ['minimalTopBar','sidebarMode','autoHideWidth','conversationWidth','hideSlackbot'])assert.equal(mod.settings.some(setting=>setting.key===key),false,`Layout still owns ${key}`);
});

test('layout module includes chrome, overflow, Triage and disposal contracts',()=>{
 for(const fragment of ['threadPaneWidth','singleLineHeader','toolbarFollowsPointer','data-pme-layout-header-tabs','data-pme-layout-thread-track','data-pme-layout-toolbar-follow','data-pme-layout-overflow-source','data-pme-native-reply','data-pme-switcher','data-pme-parking','observer.disconnect()','abort.abort()','delete window.__PME_SLACK_LAYOUT__'])assert.ok(source.includes(fragment),`missing layout contract: ${fragment}`);
 for(const fragment of ['data-pme-layout-hidden','Hidden Slack destinations','autoHideWidth','conversationWidth'])assert.equal(source.includes(fragment),false,`Layout still owns sidebar contract: ${fragment}`);
 assert.equal(source.includes('setInterval('),false);assert.equal(source.includes('fetch('),false);
});

test('layout targets current Slack chrome hooks and keeps its overflow outside React toolbars',()=>{
 for(const fragment of ['tab_rail_desktop','tab_rail_home_button','tab_rail_dms_button','account_switcher_team_icon','user-button','history_back_button','view_header','entity-header-star-button','avatar_stack','huddle_channel_header_button','search_in_channel_button','channel_canvas','add-channel-canvas','p-ia4_top_nav','document.body.append(more)','-webkit-app-region:no-drag'])assert.ok(source.includes(fragment),`missing current Slack layout hook: ${fragment}`);
 for(const fragment of ['railMode','hiddenRailPlacement','settings.railMode!==\'full\'','settings.railMode===\'full\'?settings[key]:!settings[key]','grid-template-columns:0 minmax(0,1fr)',':is([data-qa="tab_rail_desktop"],.p-control_strip)','padding:0!important;border:0!important;overflow:hidden!important','p-ia4_top_nav__left_container--start','(start?.left??76)+6','--pme-layout-topbar-team-left','hideWorkspaceSwitcher','data-pme-layout-hide-workspace-switcher','left:auto!important;right:8px!important','data-pme-layout-workspace-grid','--pme-layout-workspace-columns','reclaimWorkspaceWidth()','background:var(--pme-appearance-surface,#1d1c1d)!important','opacity:1!important','clearTopBarPlacement()'])assert.ok(source.includes(fragment),`missing complete rail behavior: ${fragment}`);
 assert.equal(source.includes("topbar.append(more)"),false);
 assert.equal(source.includes("more.addEventListener('pointerdown'"),false);
 assert.equal(source.includes("more.addEventListener('mousedown'"),false);
 assert.ok(source.includes("window.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('[data-pme-layout-more]'))toggleMenu(event);"));
 assert.ok(source.includes("window.__PME_SLACK_LAYOUT__={version:'0.2.0'"));
});
test('Sidebar Productivity owns mounted-row unification, responsive hiding, cache-only actions and opaque recovery',()=>{
 for(const fragment of ['unifiedEnabled','organizerEnabled','peekEnabled','openAction','replyAction','compact','auto-hide','conversation','data-pme-unified-sidebar','Unified Inbox','Classic view','mounted','groupOf(','compare(a,b)','data-pme-sidebar-hidden','Hidden Slack destinations','__PME_OBSERVER__?.peek','__PME_OBSERVER__?.sidebarIndex','__PME_NATIVE_NAVIGATION__?.destination','navigation?.open?.','navigation?.openDetached?.','separate Slack window','dialog[data-pme-sidebar-dialog]{','dialog[data-pme-unified-dialog]{','New Unified Sidebar group','dialog.showModal()','background:var(--pme-appearance-surface,#1d1c1d)!important','opacity:1!important','dialog[data-pme-sidebar-dialog]::backdrop{background:#000b!important','pme-slack-layout-hidden-v1','delete window.__PME_UNIFIED_SIDEBAR__','delete window.__PME_SIDEBAR_PRODUCTIVITY__'])assert.ok(sidebar.includes(fragment),`missing Sidebar Productivity contract: ${fragment}`);
 assert.equal(sidebar.includes('fetch('),false);assert.equal(sidebar.includes('setInterval('),false);
});
test('Slack Companion exposes the complete live Layout settings surface',async()=>{
 const native=await fs.readFile(new URL('../native/TriageController.swift',import.meta.url),'utf8'),runtime=await fs.readFile(new URL('../src/live-runtime.mjs',import.meta.url),'utf8');
 for(const fragment of ['Slack Companion','Slack Settings','Slack Layout','Sidebar Productivity','key:"railMode"','key:"hiddenRailPlacement"','key:"unifiedEnabled"','key:"autoHideWidth"','key:"conversationWidth"','key:"hideWorkspaceSwitcher"','Message Polish','Reply Tools','Changes apply immediately','modSettings'])assert.ok(native.includes(fragment),`missing companion surface: ${fragment}`);
 assert.ok(runtime.includes("await mods.configure(moduleForMod[modId]||modId,value)"));assert.ok(runtime.includes("configure:async(patch,modId)"));
});
