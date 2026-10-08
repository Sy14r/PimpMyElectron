import net from 'node:net';import fs from 'node:fs/promises';
export async function createShellServer({file,state,command,configure,previewAction,backdropState=()=>null,backdropDisconnected=()=>{}}){
 await fs.rm(file,{force:true});let lastSeen=0;
 const watchers=new Set();
 const publishBackdrop=()=>{if(!watchers.size)return;const line=JSON.stringify({backdrop:backdropState()})+'\n';for(const socket of watchers){if(socket.writableLength>16000)socket.destroy();else socket.write(line);}};
 const heartbeat=setInterval(publishBackdrop,1000);heartbeat.unref();
 const server=net.createServer(socket=>{
  socket.setEncoding('utf8');socket.setTimeout(5000,()=>socket.destroy());let data='',handled=false;
  socket.on('error',()=>{});socket.on('data',async chunk=>{
   if(handled)return;data+=chunk;if(data.length>4000)return socket.destroy();if(!data.includes('\n'))return;handled=true;
   try{const request=JSON.parse(data.slice(0,data.indexOf('\n')));let result;
    if(request.op==='watch-backdrop'){
     if(watchers.size>=2)return socket.destroy();
     socket.setTimeout(0);watchers.add(socket);socket.once('close',()=>{watchers.delete(socket);if(!watchers.size)backdropDisconnected();});publishBackdrop();return;
    }
    if(request.op==='state'){lastSeen=Date.now();result=await state(request);}
    else if(request.op==='preview-action'&&previewAction)result=await previewAction({key:request.key,action:request.action});
    else if(request.op==='settings')result=await configure(request.patch||{},request.modId);
    else if(['toggle','stock-toggle','rest','hide','stock','minimize','queue','switch','peek','preferences'].includes(request.op))result=await command(request.op,request.workspaceId,request.section);
    else throw Error('Unsupported shell operation');
    socket.end(JSON.stringify({ok:true,result})+'\n');
   }catch{socket.end(JSON.stringify({ok:false,error:'Shell operation unavailable'})+'\n');}
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(file,resolve);});await fs.chmod(file,0o600);
 return {publishBackdrop,backdropConnected:()=>watchers.size>0,connected:()=>Date.now()-lastSeen<3000,close:async()=>{clearInterval(heartbeat);for(const socket of watchers)socket.destroy();watchers.clear();server.close();await fs.rm(file,{force:true});}};
}
