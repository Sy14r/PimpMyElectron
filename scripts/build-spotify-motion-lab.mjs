// Separate native fixture app: no Spotify process, permissions, or account access.
import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=process.cwd(),dir=path.join(root,'.lab/spotify-motion'),app=path.join(dir,'PME Motion Lab.app');
await fs.mkdir(path.join(app,'Contents/MacOS'),{recursive:true});
const appearance=await fs.readFile('native/spotify/Appearance.swift','utf8');
let library=await fs.readFile('native/spotify/MiniLibrary.swift','utf8');
const start=library.indexOf('    func send(_ request:'),end=library.indexOf('    static func request(',start);
if(start<0||end<0)throw Error('MiniLibrary fixture insertion point changed');
library=library.slice(0,start)+'    func send(_ request:[String:Any],completion:@escaping(Result<[String:Any],Error>)->Void) {completion(.success(MotionFixture.reply(request)))}\n'+library.slice(end);
let player=await fs.readFile('native/spotify/SpotifyMenu.swift','utf8');
const entry='\nlet app=NSApplication.shared,delegate=SpotifyMenu();';if(!player.includes(entry))throw Error('Spotify entry point changed');player=player.split(entry)[0];
const header='            PlayerTrackHeader(model:model,expansion:expansion)';if(!player.includes(header))throw Error('Player header changed');
player=player.replace(header,'            if MotionFixture.matchedHeader { MotionMatchedHeader(model:model,expanded:library.expanded) } else { PlayerTrackHeader(model:model,expansion:expansion) }');
await fs.writeFile(path.join(dir,'main.swift'),[appearance,library,player,await fs.readFile('native/spotify/experiments/MotionLab.swift','utf8')].join('\n'));
await fs.writeFile(path.join(app,'Contents/Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>MotionLab</string><key>CFBundleIdentifier</key><string>com.pimpmyElectron.motion-lab</string><key>CFBundleName</key><string>PME Motion Lab</string><key>CFBundlePackageType</key><string>APPL</string><key>LSMinimumSystemVersion</key><string>13.3</string></dict></plist>`);
const run=(bin,args)=>{const r=spawnSync(bin,args,{stdio:'inherit',env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'}});if(r.status)process.exit(r.status);};
run('/Library/Developer/CommandLineTools/usr/bin/swiftc',['-swift-version','5','-O','-sdk','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk','-target','arm64-apple-macos13.3',path.join(dir,'main.swift'),'-o',path.join(app,'Contents/MacOS/MotionLab')]);
run('/usr/bin/codesign',['--force','--sign','-',app]);console.log(app);
