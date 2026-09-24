import net from 'node:net';
export function control(file,request,{timeout=4000}={}){return new Promise((resolve,reject)=>{
 const socket=net.createConnection(file);let text='',settled=false;
 const finish=(error,result)=>{if(settled)return;settled=true;socket.destroy();error?reject(error):resolve(result);};
 socket.setEncoding('utf8');socket.setTimeout(timeout,()=>finish(Error('The application controller did not respond.')));
 socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));socket.on('error',error=>finish(error));
 socket.on('data',chunk=>{text+=chunk;if(text.length>1024*1024)finish(Error('Controller response is too large.'));});
 socket.on('end',()=>{try{const response=JSON.parse(text);if(!response.ok)throw Error(response.error||'Controller request failed');finish(null,response.result);}catch(error){finish(error);}});
 });}
