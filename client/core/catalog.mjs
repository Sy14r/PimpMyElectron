import {supportedApps} from './app-support.mjs';
const idPattern=/^[a-z][a-z0-9-]*$/;
export function validateCatalog(catalog,modules){
 if(catalog?.schemaVersion!==1||!Array.isArray(catalog.apps))throw Error('Unsupported client catalog');
 const appIds=new Set(),moduleIds=new Set(modules.map(m=>m.id));
 for(const app of catalog.apps){
  if(!idPattern.test(app.id)||appIds.has(app.id)||!Object.hasOwn(supportedApps,app.id)||app.adapter!==app.id||app.bundleId!==supportedApps[app.id].bundleId||!Array.isArray(app.mods))throw Error('Invalid supported application');
  appIds.add(app.id);const ids=new Set();
  for(const mod of app.mods){
   if(!idPattern.test(mod.id)||ids.has(mod.id)||!Array.isArray(mod.modules)||mod.modules.some(id=>!moduleIds.has(id)||app.id!=='slack')||!Array.isArray(mod.requires))throw Error('Invalid mod definition');
   ids.add(mod.id);
  }
  for(const mod of app.mods)if(mod.requires.some(id=>!ids.has(id)))throw Error('Unknown mod dependency');
  resolveSelection(app,app.mods.map(m=>m.id));
 }
 return catalog;
}
export function resolveSelection(app,selected){
 if(!Array.isArray(selected)||selected.length>app.mods.length||selected.some(id=>typeof id!=='string'))throw Error('Invalid mod selection');
 const lookup=new Map(app.mods.map(m=>[m.id,m])),visiting=new Set(),resolved=new Set();
 function add(id){
  if(resolved.has(id))return;if(visiting.has(id))throw Error('Circular mod dependency');
  const mod=lookup.get(id);if(!mod)throw Error('Unknown mod');
  visiting.add(id);for(const dependency of mod.requires)add(dependency);visiting.delete(id);resolved.add(id);
 }
 for(const id of selected)add(id);
 return [...resolved];
}
export function moduleSelection(app,selected,modules){
 const resolved=resolveSelection(app,selected),enabled=new Set(app.mods.filter(m=>resolved.includes(m.id)).flatMap(m=>m.modules));
 return {disabled:modules.filter(m=>!enabled.has(m.id)).map(m=>m.id)};
}
