import path from 'node:path';import {spawnSync} from 'node:child_process';
// A newly downloaded helper can take longer while macOS performs first-open
// checks. Keep waiting for its endpoint; never launch a second copy on timeout.
export async function waitForSpotifyHelper({status,launchFailure,timeoutMs=60000,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const deadline=now()+timeoutMs;
 while(true){
  const state=await status();if(state.running)return state;
  const failure=launchFailure();if(failure)throw Error(`The Spotify menu helper could not start: ${failure}. Check launcher.log in the PME data folder.`);
  if(now()>=deadline)throw Error('Spotify’s menu helper has not finished starting after 60 seconds. Complete any macOS first-open prompt, then try the shortcut again. The existing launch has been left running; details are in launcher.log in the PME data folder.');
  await sleep(200);
 }
}
export function inspectSpotify(app){
 if(!path.isAbsolute(app)||!app.endsWith('.app'))throw Error('Choose an installed Spotify application.');
 const run=(bin,args)=>{const r=spawnSync(bin,args,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});if(r.status!==0)throw Error('Could not verify the Spotify installation.');return r;};
 const info=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',path.join(app,'Contents/Info.plist')]).stdout);
 if(info.CFBundleIdentifier!=='com.spotify.client')throw Error('Expected the official Spotify application.');
 run('/usr/bin/codesign',['--verify','--deep','--strict','-R=identifier "com.spotify.client" and anchor apple generic and certificate leaf[subject.OU] = "2FNC3A47ZF"',app]);
 return {app,version:info.CFBundleShortVersionString,distribution:'direct-download'};
}
