import fs from 'node:fs/promises';
import path from 'node:path';
import {DEFAULT_ACCENT,validAccent} from './accent-theme.mjs';

export const TRIAGE_DEFAULTS=Object.freeze({edge:'right',rest:'strip',display:'main',inboxDensity:'expanded',accentColor:DEFAULT_ACCENT,senderTints:false,senderTintMode:'always',inboxGlass:false,inboxOpacity:28,detailOpacityBoost:35,idleSeconds:60,shortcut:'cmd-shift-y',stockShortcut:'cmd-shift-u',helpShortcut:'cmd-shift-comma',expandOnActivity:true,reopenNew:true,workspace:null,notificationMode:'all',notificationWorkspaces:[]});
export const LAYOUT_DEFAULTS=Object.freeze({railMode:'full',hiddenRailPlacement:'topbar',railHome:false,railDMs:false,railActivity:false,railFiles:false,railLater:false,railAgents:false,railCreate:false,railFocus:false,railProfile:false,railMore:false,hideWorkspaceSwitcher:false,hideBackForward:false,headerStar:false,headerMembers:false,headerHuddle:false,headerNotifications:false,headerSearch:false,headerCanvas:false,singleLineHeader:false,threadPaneWidth:0,minimalTopBar:false,toolbarFollowsPointer:false});
export const MESSAGE_POLISH_DEFAULTS=Object.freeze({codeNoWrap:true,codeCopy:true,compactText:true,compactSpacing:false,readableLinks:true,calmHover:true,senderTints:true,tintOwn:false,tintIntensity:35});
export const REPLY_TOOLS_DEFAULTS=Object.freeze({quoteAction:true,previewAction:true,previewShortcut:true,compactCards:true});
export const APPEARANCE_DEFAULTS=Object.freeze({preset:'midnight',systemNavigation:'#151a28',selectedItems:'#5965d8',presenceIndication:'#53c98b',notifications:'#e45d7b',themeString:''});
export const APPEARANCE_PRESETS=Object.freeze(['midnight','ocean','forest','sandstone','lavender','aubergine','graphite','sunrise','custom']);
export const CUSTOM_CSS_DEFAULTS=Object.freeze({css:''});
export const PERSONAL_EMOJI_DEFAULTS=Object.freeze({definitions:''});
export const SIDEBAR_PRODUCTIVITY_DEFAULTS=Object.freeze({unifiedEnabled:false,organizerEnabled:true,peekEnabled:true,openAction:true,replyAction:true,prewarmReply:false,hoverDelay:450,compactSidebar:false,autoHideSidebar:false,smallWindowSidebar:false,sidebarMode:'normal',autoHideWidth:760,conversationWidth:760,hideSlackbot:false});
export const CONFIGURABLE_MOD_IDS=Object.freeze(['slack-triage','slack-layout','slack-message-polish','slack-quote-reply','slack-appearance','slack-custom-css','slack-personal-emoji','slack-sidebar-productivity']);
const validColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function parseSlackTheme(value){
 if(typeof value!=='string'||value.length>300)return null;
 const colors=value.split(',').map(color=>color.trim().toLowerCase());
 if(![4,8].includes(colors.length)||colors.some(color=>!validColor(color)))return null;
 return colors.length===4?{systemNavigation:colors[0],selectedItems:colors[1],presenceIndication:colors[2],notifications:colors[3]}:{systemNavigation:colors[0],selectedItems:colors[2],presenceIndication:colors[6],notifications:colors[7]};
}
export function sanitizeCustomCSS(value){
 if(typeof value!=='string'||value.length>8000)throw Error('Custom CSS must be no more than 8,000 characters.');
 if(/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw Error('Custom CSS contains unsupported control characters.');
 const inspected=value.replace(/\/\*[\s\S]*?\*\//g,'').toLowerCase();
 if(/\\|@import\b|\burl\s*\(|(?:-webkit-)?image(?:-set)?\s*\(|(?:-webkit-)?cross-fade\s*\(|\bsrc\s*\(|(?:https?|ftp|file|data|blob):|\bexpression\s*\(|\bbehavior\s*:|-moz-binding|<\/?style|data-pme-|#pme-/.test(inspected))throw Error('Custom CSS cannot contain imports, URLs, escaped syntax, executable legacy syntax, or PME selectors.');
 return value.trim();
}
function publicEmojiURL(value){
 try{
  const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||url.href.length>500)return null;
  const host=url.hostname.toLowerCase();if(!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.home.arpa')||host.includes(':'))return null;
  const parts=host.split('.');if(parts.every(part=>/^\d+$/.test(part))){const octets=parts.map(Number);if(octets.length!==4||octets.some(n=>n<0||n>255)||octets[0]===10||octets[0]===127||octets[0]===0||octets[0]===169&&octets[1]===254||octets[0]===172&&octets[1]>=16&&octets[1]<=31||octets[0]===192&&octets[1]===168)return null;}
  return url.href;
 }catch{return null;}
}
export function parsePersonalEmoji(value){
 if(typeof value!=='string'||value.length>8000)return null;const entries=[],names=new Set();
 for(const raw of value.split(/\r?\n/)){
  const line=raw.trim();if(!line||line.startsWith('#'))continue;
  const match=line.match(/^((?::[a-z0-9][a-z0-9_+-]{1,39}:\s+)+)(\S+)$/i),url=match&&publicEmojiURL(match[2]);if(!match||!url)return null;
  const tokens=[...match[1].matchAll(/:([a-z0-9][a-z0-9_+-]{1,39}):/gi)].map(item=>item[1].toLowerCase());
  if(!tokens.length||tokens.length>11||entries.length>=50||tokens.some(name=>names.has(name))||names.size+tokens.length>50)return null;
  for(const name of tokens)names.add(name);entries.push({name:tokens[0],aliases:tokens.slice(1),url});
 }
 return entries;
}

function triageSettings(patch,current=TRIAGE_DEFAULTS){
 const next={...TRIAGE_DEFAULTS,...current,
  ...(['left','right'].includes(patch.edge)?{edge:patch.edge}:{}),
  ...(['expanded','cozy','compact'].includes(patch.inboxDensity)?{inboxDensity:patch.inboxDensity}:{}),
  ...(validAccent(patch.accentColor)?{accentColor:patch.accentColor.toLowerCase()}:{}),
  ...(typeof patch.senderTints==='boolean'?{senderTints:patch.senderTints}:{}),
  ...(['always','hover'].includes(patch.senderTintMode)?{senderTintMode:patch.senderTintMode}:{}),
  ...(typeof patch.inboxGlass==='boolean'?{inboxGlass:patch.inboxGlass}:{}),
  ...(Number.isInteger(patch.detailOpacityBoost)&&patch.detailOpacityBoost>=0&&patch.detailOpacityBoost<=100?{detailOpacityBoost:patch.detailOpacityBoost}:{}),
  ...(Number.isInteger(patch.inboxOpacity)&&patch.inboxOpacity>=0&&patch.inboxOpacity<=100?{inboxOpacity:patch.inboxOpacity}:{}),
  ...(['strip','cluster','hidden'].includes(patch.rest)?{rest:patch.rest}:{}),
  ...(typeof patch.display==='string'&&/^(main|\d+)$/.test(patch.display)?{display:patch.display}:{}),
  ...([0,5,15,30,60,300].includes(patch.idleSeconds)?{idleSeconds:patch.idleSeconds}:{}),
  ...(['cmd-shift-y','cmd-shift-u','cmd-shift-comma','ctrl-option-space','option-space'].includes(patch.shortcut)?{shortcut:patch.shortcut}:{}),
  ...(['cmd-shift-y','cmd-shift-u','cmd-shift-comma','ctrl-option-space','option-space'].includes(patch.stockShortcut)?{stockShortcut:patch.stockShortcut}:{}),
  ...(['cmd-shift-y','cmd-shift-u','cmd-shift-comma','ctrl-option-space','option-space'].includes(patch.helpShortcut)?{helpShortcut:patch.helpShortcut}:{}),
  ...(typeof patch.expandOnActivity==='boolean'?{expandOnActivity:patch.expandOnActivity}:{}),
  ...(['all','selected','inbox'].includes(patch.notificationMode)?{notificationMode:patch.notificationMode}:{}),
  ...(Array.isArray(patch.notificationWorkspaces)&&patch.notificationWorkspaces.length<=12&&patch.notificationWorkspaces.every(id=>typeof id==='string'&&/^[TE][A-Z0-9]+$/.test(id))?{notificationWorkspaces:[...new Set(patch.notificationWorkspaces)]}:{}),
  ...((patch.workspace==='*'||typeof patch.workspace==='string'&&/^[TE][A-Z0-9]+$/.test(patch.workspace))?{workspace:patch.workspace}:{}),
  ...(typeof patch.reopenNew==='boolean'?{reopenNew:patch.reopenNew}:{})};
 if(new Set([next.shortcut,next.stockShortcut,next.helpShortcut]).size!==3){for(const key of ['shortcut','stockShortcut','helpShortcut'])next[key]=current[key]??TRIAGE_DEFAULTS[key];}
 return next;
}
function layoutSettings(patch,current=LAYOUT_DEFAULTS){
 const next={...LAYOUT_DEFAULTS,...current};
 for(const key of ['railHome','railDMs','railActivity','railFiles','railLater','railAgents','railCreate','railFocus','railProfile','railMore','hideWorkspaceSwitcher','hideBackForward','headerStar','headerMembers','headerHuddle','headerNotifications','headerSearch','headerCanvas','singleLineHeader','minimalTopBar','toolbarFollowsPointer'])if(typeof patch[key]==='boolean')next[key]=patch[key];
 if(['full','hidden','topbar'].includes(patch.railMode))next.railMode=patch.railMode;else if(typeof patch.minimalTopBar==='boolean')next.railMode=patch.minimalTopBar?'topbar':next.railMode==='topbar'?'full':next.railMode;
 if(['topbar','sidebar'].includes(patch.hiddenRailPlacement))next.hiddenRailPlacement=patch.hiddenRailPlacement;
 next.minimalTopBar=next.railMode!=='full';
 if(Number.isInteger(patch.threadPaneWidth)&&(patch.threadPaneWidth===0||patch.threadPaneWidth>=320&&patch.threadPaneWidth<=900))next.threadPaneWidth=patch.threadPaneWidth;
 delete next.sidebarThreshold;
 return next;
}
function messagePolishSettings(patch,current=MESSAGE_POLISH_DEFAULTS){
 const next={...MESSAGE_POLISH_DEFAULTS,...current};
 for(const key of ['codeNoWrap','codeCopy','compactText','compactSpacing','readableLinks','calmHover','senderTints','tintOwn'])if(typeof patch[key]==='boolean')next[key]=patch[key];
 if(Number.isInteger(patch.tintIntensity)&&patch.tintIntensity>=5&&patch.tintIntensity<=100)next.tintIntensity=patch.tintIntensity;
 return next;
}
function replyToolsSettings(patch,current=REPLY_TOOLS_DEFAULTS){
 const next={...REPLY_TOOLS_DEFAULTS,...current};
 for(const key of ['quoteAction','previewAction','previewShortcut','compactCards'])if(typeof patch[key]==='boolean')next[key]=patch[key];
 return next;
}
function appearanceSettings(patch,current=APPEARANCE_DEFAULTS){
 const next={...APPEARANCE_DEFAULTS,...current,themeString:''};
 if(APPEARANCE_PRESETS.includes(patch.preset))next.preset=patch.preset;
 for(const key of ['systemNavigation','selectedItems','presenceIndication','notifications'])if(validColor(patch[key]))next[key]=patch[key].toLowerCase();
 if(typeof patch.themeString==='string'&&patch.themeString.trim()){
  const imported=parseSlackTheme(patch.themeString);if(!imported)throw Error('Use a Slack theme string containing four or eight six-digit hex colors.');
  Object.assign(next,imported,{preset:'custom'});
 }
 return next;
}
function customCSSSettings(patch,current=CUSTOM_CSS_DEFAULTS){return {...CUSTOM_CSS_DEFAULTS,...current,...(typeof patch.css==='string'?{css:sanitizeCustomCSS(patch.css)}:{})};}
function personalEmojiSettings(patch,current=PERSONAL_EMOJI_DEFAULTS){
 const next={...PERSONAL_EMOJI_DEFAULTS,...current};if(typeof patch.definitions==='string'){const entries=parsePersonalEmoji(patch.definitions);if(!entries)throw Error('Use one or more :shortcodes: followed by a public HTTPS image URL per line, with at most 10 aliases per image and 50 unique names total.');next.definitions=entries.map(entry=>[entry.name,...entry.aliases].map(name=>`:${name}:`).join(' ')+` ${entry.url}`).join('\n');}return next;
}
function sidebarProductivitySettings(patch,current=SIDEBAR_PRODUCTIVITY_DEFAULTS){const next={...SIDEBAR_PRODUCTIVITY_DEFAULTS,...current};for(const key of ['unifiedEnabled','organizerEnabled','peekEnabled','openAction','replyAction','prewarmReply','hideSlackbot','compactSidebar','autoHideSidebar','smallWindowSidebar'])if(typeof patch[key]==='boolean')next[key]=patch[key];if(Number.isInteger(patch.hoverDelay)&&patch.hoverDelay>=150&&patch.hoverDelay<=1500)next.hoverDelay=patch.hoverDelay;if(['normal','compact','auto-hide','conversation'].includes(patch.sidebarMode)){next.sidebarMode=patch.sidebarMode;if(patch.compactSidebar===undefined&&patch.autoHideSidebar===undefined&&patch.smallWindowSidebar===undefined){next.compactSidebar=patch.sidebarMode==='compact';next.autoHideSidebar=patch.sidebarMode==='auto-hide';next.smallWindowSidebar=patch.sidebarMode==='conversation';}}const legacy=Number.isInteger(patch.sidebarThreshold)?patch.sidebarThreshold:null;for(const key of ['autoHideWidth','conversationWidth']){const value=Number.isInteger(patch[key])?patch[key]:patch[key]===undefined?legacy:null;if(Number.isInteger(value)&&value>=520&&value<=1400)next[key]=value;}return next;}
export function defaultModSettings(modId){return {...(modId==='slack-triage'?TRIAGE_DEFAULTS:modId==='slack-layout'?LAYOUT_DEFAULTS:modId==='slack-message-polish'?MESSAGE_POLISH_DEFAULTS:modId==='slack-quote-reply'?REPLY_TOOLS_DEFAULTS:modId==='slack-appearance'?APPEARANCE_DEFAULTS:modId==='slack-custom-css'?CUSTOM_CSS_DEFAULTS:modId==='slack-personal-emoji'?PERSONAL_EMOJI_DEFAULTS:modId==='slack-sidebar-productivity'?SIDEBAR_PRODUCTIVITY_DEFAULTS:{})};}
export function validateModSettings(modId,patch,current=defaultModSettings(modId)){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Invalid mod settings');
 if(modId==='slack-triage')return triageSettings(patch,current);
 if(modId==='slack-layout')return layoutSettings(patch,current);
 if(modId==='slack-message-polish')return messagePolishSettings(patch,current);
 if(modId==='slack-quote-reply')return replyToolsSettings(patch,current);
 if(modId==='slack-appearance')return appearanceSettings(patch,current);
 if(modId==='slack-custom-css')return customCSSSettings(patch,current);
 if(modId==='slack-personal-emoji')return personalEmojiSettings(patch,current);
 if(modId==='slack-sidebar-productivity')return sidebarProductivitySettings(patch,current);
 throw Error('This mod has no configurable settings');
}

export class ModSettings {
 constructor(file){this.file=file;this.mods={};this.error=null;this.tail=Promise.resolve();this.loaded=false;}
 async load({legacyTriage}={}){
  if(this.loaded)return this;
  try{
   const raw=JSON.parse(await fs.readFile(this.file,'utf8'));
   if(![1,2].includes(raw.version)||!raw.mods||typeof raw.mods!=='object'||Array.isArray(raw.mods))throw Error('Unsupported settings version');
   for(const id of CONFIGURABLE_MOD_IDS)if(raw.mods[id])this.mods[id]=validateModSettings(id,raw.mods[id]);
   if(raw.version===1&&(raw.mods['slack-layout']||raw.mods['slack-sidebar-peek'])){const legacyLayout=raw.mods['slack-layout']||{},legacyPeek=raw.mods['slack-sidebar-peek'];this.mods['slack-sidebar-productivity']=validateModSettings('slack-sidebar-productivity',{organizerEnabled:!!raw.mods['slack-layout'],peekEnabled:!!legacyPeek,openAction:true,replyAction:true,hoverDelay:legacyPeek?.hoverDelay,sidebarMode:legacyLayout.sidebarMode,autoHideWidth:legacyLayout.autoHideWidth,conversationWidth:legacyLayout.conversationWidth,sidebarThreshold:legacyLayout.sidebarThreshold,hideSlackbot:legacyLayout.hideSlackbot});await this.save();}
  }catch(error){if(error.code!=='ENOENT')this.error='Mod settings could not be read; the existing file has been preserved.';}
  if(!this.mods['slack-triage']&&legacyTriage&&this.error===null){this.mods['slack-triage']=validateModSettings('slack-triage',legacyTriage);await this.save();}
  this.loaded=true;return this;
 }
 get(modId){return {...defaultModSettings(modId),...(this.mods[modId]||{})};}
 async save(){
  if(this.error)throw Error(this.error);
  await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
  const temp=this.file+'.tmp';await fs.writeFile(temp,JSON.stringify({version:2,mods:this.mods},null,2)+'\n',{mode:0o600});await fs.rename(temp,this.file);
 }
 configure(modId,patch){
  const promise=this.tail.catch(()=>{}).then(async()=>{const previous=this.mods[modId],next=validateModSettings(modId,patch,this.get(modId));this.mods[modId]=next;try{await this.save();return {...next};}catch(error){previous===undefined?delete this.mods[modId]:this.mods[modId]=previous;throw error;}});
  this.tail=promise;return promise;
 }
}
