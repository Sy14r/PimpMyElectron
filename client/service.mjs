import readline from 'node:readline';import {fileURLToPath} from 'node:url';import path from 'node:path';import {ClientManager} from './core/manager.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const manager=await new ClientManager({root,...(process.env.PME_CLIENT_DATA_DIR?{dataDir:process.env.PME_CLIENT_DATA_DIR}:{}),helper:process.env.PME_HELPER_PATH||path.join(root,'bin/SlackTriage')}).init();
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',async line=>{let request;try{if(line.length>32768)throw Error('Request too large');request=JSON.parse(line);if(!Number.isInteger(request.id))throw Error('Invalid request identifier');const result=await manager.dispatch(request);process.stdout.write(JSON.stringify({id:request.id,ok:true,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({id:request?.id,ok:false,error:error.message})+'\n');}});
