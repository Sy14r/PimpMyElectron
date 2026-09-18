import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('..',import.meta.url));
export function control(request){return new Promise((resolve,reject)=>{
  const socket=net.createConnection(path.join(root,'.lab/dev/control.sock'));let data='';
  socket.setEncoding('utf8');socket.setTimeout(20000,()=>socket.destroy(new Error('Control timeout')));
  socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));
  socket.on('data',chunk=>data+=chunk);socket.on('error',reject);
  socket.on('end',()=>{try{const r=JSON.parse(data);if(!r.ok)throw Error(r.error);resolve(r.result);}catch(e){reject(e);}});
});}
export const inspect=expression=>control({op:'inspect',expression});
export async function until(expression,{attempts=50,delay=200}={}){
  for(let i=0;i<attempts;i++){const result=await inspect(expression);if(result)return result;await new Promise(r=>setTimeout(r,delay));}
  throw Error('Live check timed out');
}
