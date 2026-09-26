import fs from 'node:fs';import path from 'node:path';
import {root,run,hash} from './client-release.mjs';
export const updater=JSON.parse(fs.readFileSync(path.join(root,'client/updater.json'),'utf8'));
export function sparkle(){
 const dir=path.join(root,'.lab',`sparkle-${updater.sparkleVersion}`),archive=dir+'.tar.xz';
 fs.mkdirSync(dir,{recursive:true});
 if(!fs.existsSync(archive))run('/usr/bin/curl',['--fail','--location','--proto','=https','--tlsv1.2',`https://github.com/sparkle-project/Sparkle/releases/download/${updater.sparkleVersion}/Sparkle-${updater.sparkleVersion}.tar.xz`,'-o',archive]);
 if(hash(archive)!==updater.sha256)throw Error('Sparkle download checksum mismatch');
 // Re-extract verified bytes; do not trust an altered cached framework or tool.
 run('/usr/bin/tar',['-xJf',archive,'-C',dir]);return dir;
}
