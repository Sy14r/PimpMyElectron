import net from 'node:net';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),[op='state',value]=process.argv.slice(2);
const request={op,...(op==='settings'?{patch:JSON.parse(value||'{}')}:value?{workspaceId:value}:{})};
const socket=net.createConnection(path.join(root,'.lab/dev/shell.sock'));socket.setEncoding('utf8');let data='';
socket.setTimeout(6000,()=>socket.destroy(new Error('Shell timeout')));socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));
socket.on('data',s=>data+=s);socket.on('end',()=>{try{const r=JSON.parse(data);if(!r.ok)throw Error(r.error);console.log(JSON.stringify(r.result,null,2));}catch(e){console.error(e.message);process.exitCode=1;}});socket.on('error',e=>{console.error(e.message);process.exitCode=1;});
