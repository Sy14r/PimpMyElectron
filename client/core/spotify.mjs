import path from 'node:path';import {spawnSync} from 'node:child_process';
export function inspectSpotify(app){
 if(!path.isAbsolute(app)||!app.endsWith('.app'))throw Error('Choose an installed Spotify application.');
 const run=(bin,args)=>{const r=spawnSync(bin,args,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});if(r.status!==0)throw Error('Could not verify the Spotify installation.');return r;};
 const info=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',path.join(app,'Contents/Info.plist')]).stdout);
 if(info.CFBundleIdentifier!=='com.spotify.client')throw Error('Expected the official Spotify application.');
 run('/usr/bin/codesign',['--verify','--deep','--strict','-R=identifier "com.spotify.client" and anchor apple generic and certificate leaf[subject.OU] = "2FNC3A47ZF"',app]);
 return {app,version:info.CFBundleShortVersionString,distribution:'direct-download'};
}
