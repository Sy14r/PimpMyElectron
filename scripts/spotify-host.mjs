// Owns an inherited Chromium pipe. No inspector port, HTTP listener, or eval IPC.
import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';import net from 'node:net';import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {PipeCDP} from '../src/pipe.mjs';import {inspectSpotify} from '../client/core/spotify.mjs';import {validateLibraryRequest,searchDefinition} from '../src/spotify/protocol.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined;};const dir=arg('--data-dir'),app=arg('--app');
if(!dir||!path.isAbsolute(dir)||!app)throw Error('Missing Spotify launch arguments');
const installation=inspectSpotify(app),socketPath=path.join(dir,'bridge.sock');
if(Buffer.byteLength(socketPath)>=104)throw Error('Socket path too long');
await fsp.mkdir(dir,{recursive:true,mode:0o700});await fsp.chmod(dir,0o700);
if(spawnSync('/usr/bin/pgrep',['-x','Spotify']).status===0)throw Error('Quit Spotify normally, then launch it from PME to enable Mini Library.');
if(fs.existsSync(socketPath)){
 const active=await new Promise(resolve=>{const c=net.connect(socketPath);c.on('connect',()=>{c.destroy();resolve(true)});c.on('error',e=>resolve(e.code!=='ECONNREFUSED'));});
 if(active)throw Error('A Spotify bridge is already running');const stat=await fsp.lstat(socketPath);if(!stat.isSocket())throw Error('Invalid bridge path');await fsp.unlink(socketPath);
}
const source=await fsp.readFile(path.join(root,'src/spotify/renderer.js'),'utf8');
const bundle=spawnSync('/usr/bin/unzip',['-p',path.join(app,'Contents/Resources/Apps/xpui.spa'),'xpui-routes-search.js'],{encoding:'utf8',maxBuffer:8*1024*1024});
const definition=bundle.status===0?searchDefinition(bundle.stdout):null;
const log=fs.openSync(path.join(dir,'spotify.log'),'w',0o600);
const child=spawn(path.join(app,'Contents/MacOS/Spotify'),['--remote-debugging-pipe'],{stdio:['ignore',log,log,'pipe','pipe']});
const cdp=new PipeCDP(child.stdio[3],child.stdio[4],12000);let session,ready=false,attaching=false,stopping=false;
const bootstrap=`if(window===window.top&&location.origin==='https://xpui.app.spotify.com'){window.__PMESpotifySearchQuery=${JSON.stringify(definition)};\n${source}\n}`;
async function attach(){
 if(attaching||stopping||ready)return;attaching=true;
 try{
  const {targetInfos}=await cdp.send('Target.getTargets');const target=targetInfos.find(t=>t.type==='page'&&new URL(t.url||'about:blank').origin==='https://xpui.app.spotify.com');
  if(!target){ready=false;return;}
  if(session?.targetId!==target.targetId){session={targetId:target.targetId,...await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})};await cdp.send('Page.enable',{},session.sessionId);await cdp.send('Runtime.enable',{},session.sessionId);await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap},session.sessionId);}
  await cdp.evaluate(bootstrap,session.sessionId);
  await cdp.evaluate('window.__PMESpotify.invoke({op:"capabilities"})',session.sessionId);ready=true;
 }catch{ready=false;}finally{attaching=false;}
}
cdp.on('event',event=>{if(event.method==='Runtime.executionContextsCleared'&&event.sessionId===session?.sessionId)ready=false;if(event.method==='Target.detachedFromTarget'&&event.params?.sessionId===session?.sessionId){ready=false;session=null;}});
let pending=0;
const server=net.createServer(client=>{
 let data='',handled=false;client.setTimeout(15000,()=>client.destroy());client.on('error',()=>{});
 client.on('data',async chunk=>{if(handled)return;data+=chunk;if(Buffer.byteLength(data)>4096){handled=true;client.end(JSON.stringify({ok:false,error:'Request too large'}));return;}if(!data.includes('\n'))return;handled=true;
  try{
   const req=validateLibraryRequest(JSON.parse(data));
   if(req.op==='status'){client.end(JSON.stringify({ok:true,result:{adapter:'spotify',pid:process.pid,spotifyPID:child.pid,ready,version:installation.version,mode:'pipe'}}));return;}
   if(pending>=3)throw Error('Spotify is busy. Try again.');if(!ready||!session)throw Error('Spotify’s library is reconnecting. Try again shortly.');
   pending++;let result;try{const {frameTree}=await cdp.send('Page.getFrameTree',{},session.sessionId);if(new URL(frameTree.frame.url).origin!=='https://xpui.app.spotify.com')throw Error('Unexpected Spotify page');result=await cdp.evaluate(`window.__PMESpotify.invoke(${JSON.stringify(req)})`,session.sessionId);}finally{pending--;}
   client.end(JSON.stringify({ok:true,result}));
  }catch(e){const message=/Invalid|Unsupported|Choose|Search is too|reconnecting|busy/.test(e.message)?e.message:'Spotify could not complete that action. Try again.';client.end(JSON.stringify({ok:false,error:message}));}
 });
});
server.listen(socketPath,()=>fsp.chmod(socketPath,0o600));server.on('error',()=>{child.kill('SIGTERM');process.exitCode=1;});
const timer=setInterval(attach,2500);void attach();
child.on('error',()=>cleanup());child.on('exit',()=>cleanup());
async function cleanup(){if(stopping)return;stopping=true;clearInterval(timer);cdp.close();server.close();await fsp.unlink(socketPath).catch(()=>{});process.exit();}
// The host remains alive if only the widget closes, preserving Spotify playback.
