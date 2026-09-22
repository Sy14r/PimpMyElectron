import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
if(process.platform!=='darwin')throw Error('Native placeholder tests require macOS');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pme-pill-test-'));
try{
 const source=fs.readFileSync(new URL('../native/TriageController.swift',import.meta.url),'utf8');
 const entry=source.lastIndexOf('let app=NSApplication.shared');
 if(entry<0)throw Error('Missing app entry point');
 const file=path.join(dir,'main.swift'),binary=path.join(dir,'test');
 fs.writeFileSync(file,source.slice(0,entry)+fs.readFileSync(new URL('../native/tests/PillPlaceholderTests.swift',import.meta.url),'utf8'));
 const compiled=spawnSync('/Library/Developer/CommandLineTools/usr/bin/swiftc',['-swift-version','5','-sdk','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk',file,'-o',binary],{stdio:'inherit'});
 if(compiled.status!==0)process.exitCode=compiled.status??1;
 else process.exitCode=spawnSync(binary,[],{stdio:'inherit',timeout:15000}).status??1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
