import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';import path from 'node:path';
export async function readJSON(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw Error(`Could not read ${path.basename(file)}. Existing data has been preserved.`);}}
export async function writeJSON(file,value){
 await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
 const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.chmod(temp,0o600);await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}
}
