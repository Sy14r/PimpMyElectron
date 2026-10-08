import {supportedApps} from './app-support.mjs';
export const platformLabels=Object.freeze({mac:'macOS',windows:'Windows',linux:'Linux',global:'All platforms'});
export function hostPlatform(value=process.platform){return ({darwin:'mac',win32:'windows',linux:'linux',mac:'mac',windows:'windows'})[value]??'unknown';}
export function validatePlatforms(platforms){
 if(!Array.isArray(platforms)||!platforms.length||platforms.some(p=>!Object.hasOwn(platformLabels,p))||new Set(platforms).size!==platforms.length||(platforms.includes('global')&&platforms.length!==1))throw Error('Mod platforms must list mac, windows, linux, or global alone');
 return platforms;
}
export function compatible(mod,platform=hostPlatform()){return mod.platforms?.includes('global')||mod.platforms?.includes(platform)||false;}
export function modCompatibility(app,id,platform=hostPlatform()){
 try{resolveSelection(app,[id],{platform});return {compatible:true,compatibilityReason:''};}
 catch(error){return {compatible:false,compatibilityReason:error.message};}
}
const idPattern=/^[a-z][a-z0-9-]*$/;
function validateSettings(settings){
 if(settings===undefined)return;
 if(!Array.isArray(settings)||settings.length>40)throw Error('Invalid mod settings');
 const keys=new Set();for(const setting of settings){
  if(!setting||!/^[a-z][A-Za-z0-9]*$/.test(setting.key)||keys.has(setting.key)||typeof setting.label!=='string'||setting.label.length>80||!['boolean','select','number','color','text','textarea'].includes(setting.type))throw Error('Invalid mod setting');keys.add(setting.key);
  if(setting.description!==undefined&&(typeof setting.description!=='string'||setting.description.length>240))throw Error('Invalid mod setting description');
  if(setting.type==='select'&&(!Array.isArray(setting.options)||!setting.options.length||setting.options.length>12||setting.options.some(option=>!option||typeof option.value!=='string'||typeof option.label!=='string')))throw Error('Invalid mod setting choices');
  if(setting.type==='number'&&(!Number.isInteger(setting.min)||!Number.isInteger(setting.max)||setting.min>=setting.max))throw Error('Invalid mod setting range');
  if(['text','textarea'].includes(setting.type)&&(!Number.isInteger(setting.maxLength)||setting.maxLength<1||setting.maxLength>(setting.type==='textarea'?8000:1000)))throw Error('Invalid mod setting text limit');
 }
}
export function validateCatalog(catalog,modules){
 if(catalog?.schemaVersion!==1||!Array.isArray(catalog.apps))throw Error('Unsupported client catalog');
 const appIds=new Set(),moduleIds=new Set(modules.map(m=>m.id));
 for(const app of catalog.apps){
  if(!idPattern.test(app.id)||appIds.has(app.id)||!Object.hasOwn(supportedApps,app.id)||app.adapter!==app.id||app.bundleId!==supportedApps[app.id].bundleId||!Array.isArray(app.mods))throw Error('Invalid supported application');
  appIds.add(app.id);const ids=new Set();
  for(const mod of app.mods){
   if(!idPattern.test(mod.id)||ids.has(mod.id)||!Array.isArray(mod.modules)||mod.modules.some(id=>!moduleIds.has(id)||app.id!=='slack')||!Array.isArray(mod.requires))throw Error('Invalid mod definition');
   validatePlatforms(mod.platforms);validateSettings(mod.settings);ids.add(mod.id);
  }
  for(const mod of app.mods)if(mod.requires.some(id=>!ids.has(id)))throw Error('Unknown mod dependency');
  resolveSelection(app,app.mods.map(m=>m.id),{platform:null});
 }
 return catalog;
}
export function resolveSelection(app,selected,{platform=hostPlatform()}={}){
 if(!Array.isArray(selected)||selected.length>app.mods.length||selected.some(id=>typeof id!=='string'))throw Error('Invalid mod selection');
 const lookup=new Map(app.mods.map(m=>[m.id,m])),visiting=new Set(),resolved=new Set();
 function add(id){
  if(resolved.has(id))return;if(visiting.has(id))throw Error('Circular mod dependency');
  const mod=lookup.get(id);if(!mod)throw Error('Unknown mod');
  if(mod.unavailableReason)throw Error(mod.unavailableReason);
  if(platform!==null&&!compatible(mod,platform))throw Error(`${mod.name||mod.id} supports ${(mod.platforms||[]).map(p=>platformLabels[p]).join(', ')||'no declared platforms'}; it cannot run on ${platformLabels[platform]||platform}.`);
  visiting.add(id);for(const dependency of mod.requires)add(dependency);visiting.delete(id);resolved.add(id);
 }
 for(const id of selected)add(id);
 return [...resolved];
}
export function moduleSelection(app,selected,modules){
 const resolved=resolveSelection(app,selected),enabled=new Set(app.mods.filter(m=>resolved.includes(m.id)).flatMap(m=>m.modules));
 return {disabled:modules.filter(m=>!enabled.has(m.id)).map(m=>m.id)};
}
