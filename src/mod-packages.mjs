// External packages are data until the user installs and enables them.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export const digest=value=>createHash('sha256').update(value).digest('hex');
const id=/^[a-z][a-z0-9-]{1,63}$/,version=/^\d+\.\d+\.\d+$/;
export const externalID=(source,mod)=>`external:${source}/${mod}`;
export function relativeFile(value){
 if(typeof value!=='string'||value.length>240||value.includes('\\')||value.includes(':')||value.includes('\0')||value.split('/').some(p=>!p||p==='.'||p==='..')||value.startsWith('/'))throw Error('Package paths must stay inside their package');
 return value;
}
export async function regularFile(root,name,max=128*1024*1024){
 relativeFile(name);let current=root;
 for(const part of name.split('/')){current=path.join(current,part);const s=await fs.lstat(current);if(s.isSymbolicLink())throw Error('Package symlinks are not supported');}
 const s=await fs.stat(current);if(!s.isFile()||s.size>max)throw Error('Invalid or oversized package file');return current;
}
async function jsonFile(root,name){return JSON.parse(await fs.readFile(await regularFile(root,name,1024*1024),'utf8'));}
function text(value,max=500){return typeof value==='string'&&value.trim().length>0&&value.length<=max;}
export function validatePackage(m){
 if(m?.schemaVersion!==1||!id.test(m.id)||!version.test(m.version)||!['slack','spotify'].includes(m.app)||m.apiVersion!==1||!text(m.name,100)||!text(m.author,100)||!text(m.description,2000)||!text(m.access,2000))throw Error('Invalid mod metadata or unsupported package API');
 if(!Array.isArray(m.platforms)||!m.platforms.length||m.platforms.some(p=>!['mac','windows','linux','global'].includes(p))||new Set(m.platforms).size!==m.platforms.length||m.platforms.includes('global')&&m.platforms.length!==1)throw Error('Invalid mod platforms');
 if(!Array.isArray(m.requires)||m.requires.some(v=>!id.test(v))||new Set(m.requires).size!==m.requires.length)throw Error('Invalid mod dependencies');
 if(!m.files||Array.isArray(m.files)||typeof m.files!=='object'||!Object.keys(m.files).length||Object.keys(m.files).length>2000)throw Error('A package needs a checksummed file list');
 const casePaths=new Set();for(const [file,record] of Object.entries(m.files)){
  relativeFile(file);if(file==='mod.json'||casePaths.has(file.toLowerCase())||!record||!/^[a-f0-9]{64}$/.test(record.sha256)||typeof record.executable!=='boolean')throw Error('Invalid package file record');casePaths.add(file.toLowerCase());
 }
 const listed=file=>{relativeFile(file);if(!Object.hasOwn(m.files,file))throw Error('Entry point is missing from the file list');};
 if(m.renderer){if(m.app!=='slack')throw Error('Renderer package API currently supports Slack only');listed(m.renderer.script);if(m.renderer.styles!==undefined)listed(m.renderer.styles);}
 if(!Array.isArray(m.helpers)||m.helpers.length>8)throw Error('Invalid helper list');
 const helperIDs=new Set(),serviceOperations=new Set();for(const h of m.helpers){
  if(!id.test(h.id)||helperIDs.has(h.id)||h.platform!=='mac'||!['arm64','x64','universal'].includes(h.arch)||!/^[A-Z0-9]{10}$/.test(h.teamId)||!Array.isArray(h.args)||h.args.length>20||h.args.some(a=>typeof a!=='string'||a.length>500||a.includes('\0')))throw Error('Invalid helper declaration');
  helperIDs.add(h.id);listed(h.executable);if(!m.files[h.executable].executable)throw Error('Helper entry point must be executable');
  if(h.bundle!==undefined){relativeFile(h.bundle);if(!h.bundle.endsWith('.app')||!h.executable.startsWith(h.bundle+'/Contents/MacOS/'))throw Error('Helper must belong to its declared app bundle');}
  if(h.service!==undefined){
   if(!m.renderer||!h.service||Object.keys(h.service).some(key=>key!=='operations')||!Array.isArray(h.service.operations)||!h.service.operations.length||h.service.operations.length>32)throw Error('Invalid helper service declaration');
   for(const operation of h.service.operations){if(typeof operation!=='string'||!/^[a-z][a-z0-9.-]{0,63}$/.test(operation)||serviceOperations.has(operation))throw Error('Invalid or duplicate helper service operation');serviceOperations.add(operation);}
  }
 }
 if(!m.renderer&&!m.helpers.length)throw Error('A mod must have a renderer or helper');
 if(m.features!==undefined&&(!Array.isArray(m.features)||m.features.length>20||m.features.some(f=>!text(f,200))))throw Error('Invalid feature list');
 return m;
}
export async function readSource(folder){
 const root=await fs.realpath(folder),c=await jsonFile(root,'catalog.json');
 if(c?.schemaVersion!==1||!id.test(c.id)||!text(c.name,100)||!Array.isArray(c.mods)||c.mods.length>100)throw Error('Invalid local source catalog');
 const mods=[],ids=new Set(),paths=new Set();for(const entry of c.mods){
  relativeFile(entry);if([...paths].some(p=>p===entry.toLowerCase()||p.startsWith(entry.toLowerCase()+'/')||entry.toLowerCase().startsWith(p+'/')))throw Error('Duplicate package path');paths.add(entry.toLowerCase());
  const manifest=validatePackage(await jsonFile(root,entry+'/mod.json'));
  if(ids.has(manifest.id))throw Error('Duplicate mod identity');ids.add(manifest.id);mods.push({path:entry,manifest});
 }
 const metadata={catalog:{schemaVersion:1,id:c.id,name:c.name,mods:c.mods},mods};
 return {...metadata,root,digest:digest(JSON.stringify(metadata))};
}
export async function verifyFiles(root,manifest){
 let bytes=0;for(const [name,record] of Object.entries(manifest.files)){
  const file=await regularFile(root,name),data=await fs.readFile(file);bytes+=data.length;
  if(bytes>256*1024*1024)throw Error('Package exceeds 256 MB');
  if(digest(data)!==record.sha256)throw Error('Package files are incomplete or changed; refresh after syncing finishes');
 }
}
export async function verifyHelper(root,h,{run=exec,platform=process.platform,arch=process.arch}={}){
 if(platform!=='darwin'||h.arch!=='universal'&&h.arch!==arch)throw Error('Helper does not support this computer');
 const executable=await regularFile(root,h.executable),target=h.bundle?path.join(root,h.bundle):executable;
 // Validate the Apple chain and the declared publisher, not just a TeamIdentifier string.
 const requirement=`=anchor apple generic and certificate leaf[subject.OU] = "${h.teamId}" and certificate leaf[field.1.2.840.113635.100.6.1.13] exists`;
 try{
  await run('/usr/bin/codesign',['--verify','--deep','--strict','--test-requirement',requirement,target],{timeout:15000});
  if(h.bundle)await run('/usr/bin/codesign',['--verify','--strict','--test-requirement',requirement,executable],{timeout:15000});
  await run('/usr/sbin/spctl',['--assess','--type','execute',target],{timeout:20000});
 }catch{throw Error('Helper must pass Developer ID publisher and Gatekeeper verification. PME does not bypass macOS security.');}
 return executable;
}
export function rendererSource(manifest,key,files,{binding=null,responseMethod=null,operations=[]}={}){
 const style=manifest.renderer.styles?files[manifest.renderer.styles].toString('utf8'):'';
 const assets={};const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};
 for(const [name,data] of Object.entries(files))if(types[path.extname(name)]&&data.length<=2*1024*1024)assets[name]=`data:${types[path.extname(name)]};base64,${data.toString('base64')}`;
 return `(()=>{if(!document.body||location.origin!=='https://app.slack.com'||!/^\\/client\\/[TE][A-Z0-9]+(?:\\/|$)/.test(location.pathname))return;const key=${JSON.stringify(key)};if(window[key])return;const cleanup=[];const assets=${JSON.stringify(assets)};const serviceBinding=${JSON.stringify(binding)},responseMethod=${JSON.stringify(responseMethod)},serviceOperations=Object.freeze(${JSON.stringify(operations)}),serviceAllowed=new Set(serviceOperations),pending=new Map();let sequence=0,disposed=false;const serviceRequest=(operation,payload=null)=>{if(disposed)return Promise.reject(Error('Mod disposed'));if(!serviceBinding||!serviceAllowed.has(operation))return Promise.reject(Error('Unsupported private service operation'));if(pending.size>=8)return Promise.reject(Error('Too many private service requests'));const id=Date.now().toString(36)+'-'+(++sequence).toString(36);let encoded;try{encoded=JSON.stringify({id,operation,payload});}catch{return Promise.reject(Error('Private service payload must be JSON'));}const encodedBytes=typeof TextEncoder==='function'?new TextEncoder().encode(encoded).byteLength:encoded.length;if(encodedBytes>65536)return Promise.reject(Error('Private service payload is too large'));const send=window[serviceBinding];if(typeof send!=='function')return Promise.reject(Error('Private service is unavailable'));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Private service request timed out'));},20000);pending.set(id,{resolve,reject,timer});try{send(encoded);}catch(error){clearTimeout(timer);pending.delete(id);reject(Error('Private service is unavailable'));}});};const service=${binding?`Object.freeze({available:true,operations:serviceOperations,request:serviceRequest})`:'null'};const api=Object.freeze({version:1,id:${JSON.stringify(manifest.id)},modVersion:${JSON.stringify(manifest.version)},service,onCleanup(fn){if(typeof fn!=='function')throw Error('Expected cleanup function');cleanup.push(fn);},asset(name){if(!Object.hasOwn(assets,name))throw Error('Unknown image asset');return assets[name];}});const respond=serialized=>{let envelope;try{envelope=JSON.parse(serialized);}catch{return;}if(!envelope||typeof envelope.id!=='string')return;const request=pending.get(envelope.id);if(!request)return;pending.delete(envelope.id);clearTimeout(request.timer);if(envelope.ok===true)request.resolve(envelope.result);else request.reject(Error(typeof envelope.error==='string'?envelope.error.slice(0,200):'Private service request failed'));};const dispose=()=>{if(disposed)return;disposed=true;for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Mod disposed'));}pending.clear();for(const fn of cleanup.splice(0).reverse())try{fn();}catch{}delete window[key];};try{if(${JSON.stringify(!!style)}){const style=document.createElement('style');style.textContent=${JSON.stringify(style)};document.head.append(style);cleanup.push(()=>style.remove());}(()=>{'use strict';\n${files[manifest.renderer.script].toString('utf8')}\n})();window[key]={dispose,...(responseMethod?{[responseMethod]:respond}:{})};}catch(error){dispose();throw error;}})()`;
}
