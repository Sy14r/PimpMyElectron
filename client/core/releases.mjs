import fs from 'node:fs/promises';
import path from 'node:path';
const versionPattern=/^(\d+)\.(\d+)\.(\d+)$/;
export function compareVersions(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];}
export async function releaseHistory(root,current){
 if(!versionPattern.test(current))throw Error('Invalid installed version');
 const directory=path.join(root,'client/releases');
 const files=(await fs.readdir(directory)).filter(n=>/^\d+\.\d+\.\d+\.md$/.test(n)&&compareVersions(n.slice(0,-3),current)<=0).sort((a,b)=>compareVersions(b.slice(0,-3),a.slice(0,-3)));
 const releases=[];
 for(const file of files){const name=path.join(directory,file),stat=await fs.lstat(name);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64000)continue;
  releases.push({version:file.slice(0,-3),notes:await fs.readFile(name,'utf8')});}
 return {current,releases};
}
