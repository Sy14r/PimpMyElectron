import net from 'node:net';import fs from 'node:fs/promises';
export async function createShellServer({file,state,command,configure}){
 await fs.rm(file,{force:true});let lastSeen=0;
 const server=net.createServer(socket=>{
  socket.setEncoding('utf8');socket.setTimeout(5000,()=>socket.destroy());let data='',handled=false;
  socket.on('error',()=>{});socket.on('data',async chunk=>{
   if(handled)return;data+=chunk;if(data.length>4000)return socket.destroy();if(!data.includes('\n'))return;handled=true;
   try{const request=JSON.parse(data.slice(0,data.indexOf('\n')));let result;
    if(request.op==='state'){lastSeen=Date.now();result=await state(request);}
    else if(request.op==='settings')result=await configure(request.patch||{});
    else if(['toggle','rest','hide','stock','minimize','queue','switch'].includes(request.op))result=await command(request.op,request.workspaceId);
    else throw Error('Unsupported shell operation');
    socket.end(JSON.stringify({ok:true,result})+'\n');
   }catch{socket.end(JSON.stringify({ok:false,error:'Shell operation unavailable'})+'\n');}
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(file,resolve);});await fs.chmod(file,0o600);
 return {connected:()=>Date.now()-lastSeen<3000,close:async()=>{server.close();await fs.rm(file,{force:true});}};
}
