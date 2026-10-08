import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {validateCatalog,moduleSelection} from '../client/core/catalog.mjs';

const source=await fs.readFile(new URL('../src/renderer/slack-appearance.js',import.meta.url),'utf8');

test('Slack Appearance is independent, local-only, and exposes bounded controls',async()=>{
 const manifest=JSON.parse(await fs.readFile(new URL('../mods/runtime.json',import.meta.url))),catalog=validateCatalog(JSON.parse(await fs.readFile(new URL('../client/catalog.json',import.meta.url))),manifest.modules),slack=catalog.apps.find(app=>app.id==='slack');
 const selection=moduleSelection(slack,['slack-appearance'],manifest.modules);assert.equal(selection.disabled.includes('slack-appearance'),false);for(const id of ['triage-surface','state-observer','native-reply','quote-reply','message-polish','sender-tints','slack-layout'])assert.equal(selection.disabled.includes(id),true);
 const mod=slack.mods.find(item=>item.id==='slack-appearance');assert.equal(mod.defaultEnabled,false);assert.equal(mod.access.includes('does not read credentials'),true);
 for(const key of ['preset','systemNavigation','selectedItems','presenceIndication','notifications','themeString'])assert.ok(mod.settings.some(setting=>setting.key===key),`missing setting ${key}`);
 for(const value of ['aubergine','graphite','sunrise'])assert.ok(mod.settings.find(setting=>setting.key==='preset').options.some(option=>option.value===value));
 assert.equal(mod.settings.find(setting=>setting.key==='themeString').maxLength,300);
 for(const forbidden of ['fetch(','localStorage','sessionStorage','users.prefs','token='])assert.equal(source.includes(forbidden),false,`appearance must not use ${forbidden}`);
});

test('Slack Appearance applies custom colors live and restores native appearance on disposal',()=>{
 const nodes=new Map(),attributes=new Map();
 const root={append(node){nodes.set(node.id,node);},setAttribute(key,value){attributes.set(key,value);},removeAttribute(key){attributes.delete(key);}};
 const document={documentElement:root,head:root,getElementById:id=>nodes.get(id)||null,createElement:()=>({id:'',textContent:'',remove(){nodes.delete(this.id);}})};
 const window={};vm.runInNewContext(source,{window,location:{origin:'https://app.slack.com'},document});
 const result=window.__PME_SLACK_APPEARANCE__.configure({preset:'custom',systemNavigation:'#010203',selectedItems:'#112233',presenceIndication:'#445566',notifications:'#778899'});
 const css=nodes.get('pme-slack-appearance-style').textContent;assert.equal(attributes.get('data-pme-slack-appearance'),'custom');for(const color of ['#010203','#112233','#445566','#778899'])assert.ok(css.includes(color));for(const selector of ['.p-view_header','.p-threads_flexpane__header','channel_tab_bar','[data-qa="message_input"]','[data-qa="texty_input"]','.p-view_header__actions','search_in_channel_button','secondary-header-more','p-workspace__primary_view_footer','p-composer_page__footer','margin-inline:auto'])assert.ok(css.includes(selector));for(const token of ['--pme-appearance-composer','--pme-appearance-border','--pme-appearance-muted'])assert.ok(css.includes(token));assert.equal(result.colors.notifications,'#778899');
 window.__PME_SLACK_APPEARANCE__.dispose();assert.equal(nodes.has('pme-slack-appearance-style'),false);assert.equal(attributes.has('data-pme-slack-appearance'),false);assert.equal(window.__PME_SLACK_APPEARANCE__,undefined);
});

test('Slack Appearance has renderer and native-helper lifecycle contracts',async()=>{
 for(const fragment of ['data-pme-slack-appearance','--pme-appearance-navigation','--pme-appearance-composer','--p-team_sidebar__nav-bg','--sk_presence_online','aubergine','graphite','sunrise','channel_sidebar__channel--unread','p-threads_flexpane__header','channel_tab_bar','data-qa="message_input"','p-view_header__actions','search_in_channel_button','p-workspace__primary_view_footer','margin-inline:auto','data-pme-native-reply-pane','configure','dispose','delete window.__PME_SLACK_APPEARANCE__'])assert.ok(source.includes(fragment),`missing appearance contract: ${fragment}`);
 assert.equal(source.includes('setInterval('),false);
 const native=await fs.readFile(new URL('../native/TriageController.swift',import.meta.url),'utf8'),ui=await fs.readFile(new URL('../client/ui/app.js',import.meta.url),'utf8');
 for(const fragment of ['Slack Appearance','key:"systemNavigation"','key:"themeString"','update immediately','never reads Slack credentials or writes account preferences'])assert.ok(native.includes(fragment),`missing native appearance surface: ${fragment}`);
 for(const fragment of ["setting.type==='color'","setting.type==='text'",'setting.maxLength','openModDetails'])assert.ok(ui.includes(fragment),`missing PME appearance control: ${fragment}`);
});
