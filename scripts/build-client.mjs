import {sparkle,updater} from './lib/sparkle.mjs';
// Self-contained Apple Silicon .app. Only allowlisted code and public assets
// enter the bundle; no .lab state, Slack profiles, or credentials are copied.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {supportedApps} from '../client/core/app-support.mjs';
import {metadata} from './lib/client-release.mjs';
const client=metadata(),sparkleDir=sparkle();
const root=fileURLToPath(new URL('..',import.meta.url));
if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('This first client build targets Apple Silicon macOS.');
const customOutput=process.env.PME_CLIENT_OUTPUT;
if(customOutput&&(!path.isAbsolute(customOutput)||!customOutput.endsWith('/PimpMyElectron.app')))throw Error('PME_CLIENT_OUTPUT must be an absolute PimpMyElectron.app path');
const app=customOutput||path.join(root,'dist/PimpMyElectron.app'),resources=path.join(app,'Contents/Resources'),runtime=path.join(resources,'runtime'),cache=path.join(root,'.lab/client-cache');
const version='22.23.3',archive=`node-v${version}-darwin-arm64.tar.gz`,sha256='23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53';
const env={...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'};
function run(bin,args){const p=spawnSync(bin,args,{stdio:'inherit',env});if(p.status!==0)throw Error(`${path.basename(bin)} failed`);}
await fs.mkdir(cache,{recursive:true,mode:0o700});
const tar=path.join(cache,archive);if(!await fs.stat(tar).catch(()=>null))run('/usr/bin/curl',['--fail','--location','--proto','=https','--tlsv1.2',`https://nodejs.org/dist/v${version}/${archive}`,'--output',tar]);
if(createHash('sha256').update(await fs.readFile(tar)).digest('hex')!==sha256)throw Error('Bundled Node checksum mismatch. Remove the cached archive and retry.');
// Re-extract the verified archive; never trust a previously expanded cache.
const nodeSource=path.join(cache,`node-v${version}-darwin-arm64`);await fs.rm(nodeSource,{recursive:true,force:true});run('/usr/bin/tar',['-xzf',tar,'-C',cache]);
if(customOutput&&await fs.lstat(app).catch(()=>null))throw Error('Release build destination already exists');
if(!customOutput){const existing=await fs.lstat(app).catch(()=>null);if(existing?.isSymbolicLink())throw Error('Refusing symlink build destination');if(existing){const plist=await fs.readFile(path.join(app,'Contents/Info.plist'),'utf8');if(!plist.includes('<string>com.pimpmyElectron.client</string>'))throw Error('Refusing to replace an unrelated app');await fs.rm(app,{recursive:true});}}
for(const folder of ['Contents/MacOS','Contents/Resources/bin','Contents/Resources/runtime/bin'])await fs.mkdir(path.join(app,folder),{recursive:true});
const sources=[...((await fs.readdir(path.join(root,'client/releases'))).filter(n=>/^\d+\.\d+\.\d+\.md$/.test(n)).map(n=>'client/releases/'+n)),...((await fs.readdir(path.join(root,'src'))).filter(n=>n.endsWith('.mjs')).map(n=>'src/'+n)),...((await fs.readdir(path.join(root,'src/renderer'))).filter(n=>n.endsWith('.js')).map(n=>'src/renderer/'+n)),
 'src/spotify/renderer.js','src/spotify/protocol.mjs','scripts/spotify-host.mjs','mods/runtime.json','client/catalog.json','client/version.json','client/service.mjs','client/launch-shortcut.mjs',...((await fs.readdir(path.join(root,'client/core'))).filter(n=>n.endsWith('.mjs')).map(n=>'client/core/'+n)), 'scripts/dev.mjs','native/TriageController.swift'];
for(const name of sources){const stat=await fs.lstat(path.join(root,name));if(!stat.isFile()||stat.isSymbolicLink())throw Error('Expected regular source: '+name);const dest=path.join(runtime,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(root,name),dest);}
await fs.writeFile(path.join(runtime,'package.json'),JSON.stringify({name:'pme-bundled-runtime',private:true,type:'module',version:client.version})+'\n');
await fs.cp(path.join(root,'client/ui'),path.join(resources,'ui'),{recursive:true});
await fs.copyFile(path.join(nodeSource,'bin/node'),path.join(resources,'bin/node'));await fs.chmod(path.join(resources,'bin/node'),0o755);
await fs.copyFile(path.join(nodeSource,'LICENSE'),path.join(resources,'Node-LICENSE.txt'));
const swift='/Library/Developer/CommandLineTools/usr/bin/swiftc',flags=['-swift-version','5','-O','-sdk','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk','-target',`arm64-apple-macos${client.minimumMacOS}`];
run(swift,[...flags,path.join(root,'native/TriageController.swift'),'-o',path.join(runtime,'bin/SlackTriage')]);
run(swift,[...flags,'-F',sparkleDir,'-framework','Sparkle','-Xlinker','-rpath','-Xlinker','@executable_path/../Frameworks',path.join(root,'client/native/Client.swift'),'-o',path.join(app,'Contents/MacOS/PimpMyElectron')]);
await fs.mkdir(path.join(app,'Contents/Frameworks'),{recursive:true});run('/usr/bin/ditto',[path.join(sparkleDir,'Sparkle.framework'),path.join(app,'Contents/Frameworks/Sparkle.framework')]);
await fs.copyFile(path.join(sparkleDir,'LICENSE'),path.join(resources,'Sparkle-LICENSE.txt'));
const iconMaker=path.join(cache,'make-icon'),iconset=path.join(cache,'PME.iconset');
run(swift,[...flags,path.join(root,'client/native/Icon.swift'),'-o',iconMaker]);run(iconMaker,[iconset]);run('/usr/bin/iconutil',['-c','icns',iconset,'-o',path.join(resources,'AppIcon.icns')]);
const launchers=[];
const launcherBinary=path.join(cache,'PMELauncher');run(swift,[...flags,path.join(root,'client/native/Launcher.swift'),'-o',launcherBinary]);
for(const [appId,support] of Object.entries(supportedApps)){
 const launcher=path.join(app,'Contents/Helpers',support.template);launchers.push(launcher);
 await fs.mkdir(path.join(launcher,'Contents/MacOS'),{recursive:true});await fs.mkdir(path.join(launcher,'Contents/Resources'),{recursive:true});
 await fs.copyFile(launcherBinary,path.join(launcher,'Contents/MacOS/PMELauncher'));
 const appIconset=path.join(cache,appId+'.iconset');run(iconMaker,[appIconset,appId]);run('/usr/bin/iconutil',['-c','icns',appIconset,'-o',path.join(launcher,'Contents/Resources/AppIcon.icns')]);
 await fs.writeFile(path.join(launcher,'Contents/Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>PMELauncher</string><key>CFBundleIdentifier</key><string>com.pimpmyElectron.launcher.${appId}</string><key>CFBundleName</key><string>PME Shortcut</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${client.version}</string><key>CFBundleVersion</key><string>${client.build}</string><key>CFBundleIconFile</key><string>AppIcon</string><key>LSMinimumSystemVersion</key><string>${client.minimumMacOS}</string><key>LSUIElement</key><true/></dict></plist>`);
}
const spotifyHelper=path.join(app,'Contents/Helpers/SpotifyMenu.app');
await fs.mkdir(path.join(spotifyHelper,'Contents/MacOS'),{recursive:true});await fs.mkdir(path.join(spotifyHelper,'Contents/Resources'),{recursive:true});
const spotifySource=path.join(cache,'SpotifyMenu.swift');await fs.writeFile(spotifySource,(await fs.readFile(path.join(root,'native/spotify/camera/CameraPausePolicy.swift'),'utf8'))+'\n'+(await fs.readFile(path.join(root,'native/spotify/camera/CameraPause.swift'),'utf8'))+'\n'+(await fs.readFile(path.join(root,'native/spotify/Appearance.swift'),'utf8'))+'\n'+(await fs.readFile(path.join(root,'native/spotify/MiniLibrary.swift'),'utf8'))+'\n'+(await fs.readFile(path.join(root,'native/spotify/SpotifyMenu.swift'),'utf8')));
run(swift,[...flags,spotifySource,'-o',path.join(spotifyHelper,'Contents/MacOS/SpotifyMenu')]);
await fs.copyFile(path.join(app,'Contents/Helpers/SpotifyLauncher.app/Contents/Resources/AppIcon.icns'),path.join(spotifyHelper,'Contents/Resources/AppIcon.icns'));
await fs.writeFile(path.join(spotifyHelper,'Contents/Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>SpotifyMenu</string><key>CFBundleIdentifier</key><string>com.pimpmyElectron.spotify-menu</string><key>CFBundleName</key><string>Spotify Menu Player</string><key>CFBundleDisplayName</key><string>Spotify Menu Player</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${client.version}</string><key>CFBundleVersion</key><string>${client.build}</string><key>CFBundleIconFile</key><string>AppIcon</string><key>LSMinimumSystemVersion</key><string>${client.minimumMacOS}</string><key>LSUIElement</key><true/><key>NSAppleEventsUsageDescription</key><string>Show what’s playing and use play, pause, previous, and next controls in your Spotify menu-bar player.</string></dict></plist>`);
await fs.writeFile(path.join(app,'Contents/Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>PimpMyElectron</string><key>CFBundleIdentifier</key><string>com.pimpmyElectron.client</string><key>CFBundleName</key><string>PimpMyElectron</string><key>CFBundleDisplayName</key><string>PimpMyElectron</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${client.version}</string><key>CFBundleVersion</key><string>${client.build}</string><key>CFBundleIconFile</key><string>AppIcon</string><key>LSMinimumSystemVersion</key><string>${client.minimumMacOS}</string><key>SUFeedURL</key><string>${updater.feedURL}</string><key>SUPublicEDKey</key><string>${updater.publicKey}</string><key>SUEnableAutomaticChecks</key><true/><key>SUScheduledCheckInterval</key><integer>86400</integer><key>SUAutomaticallyUpdate</key><false/><key>SUAllowsAutomaticUpdates</key><false/><key>SUVerifyUpdateBeforeExtraction</key><true/><key>SURequireSignedFeed</key><true/><key>SUEnableInstallerLauncherService</key><true/><key>NSHighResolutionCapable</key><true/><key>NSAppleEventsUsageDescription</key><string>Show what’s playing and control Spotify playback from your Spotify menu-bar player.</string><key>NSHumanReadableCopyright</key><string>PimpMyElectron</string></dict></plist>`);
run('/usr/bin/codesign',['--force','--sign','-','--entitlements',path.join(root,'native/spotify/SpotifyMenu.entitlements'),spotifyHelper]);
for(const binary of [path.join(resources,'bin/node'),path.join(runtime,'bin/SlackTriage'),...launchers])run('/usr/bin/codesign',['--force','--sign','-',binary]);
run('/usr/bin/codesign',['--force','--sign','-','--entitlements',path.join(root,'client/native/Client.entitlements'),app]);
run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
console.log(`Built ${app}\nNode ${version} bundled; no Node installation or compiler required at runtime.\nLocally ad-hoc signed. Use npm run client:release for Developer ID distribution.`);
