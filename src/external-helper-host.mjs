// Parent crash/disconnect closes IPC and stops this supervisor's helpers.
import {helperProcesses} from './helper-processes.mjs';
const send=value=>{if(process.connected)process.send(value,()=>{});};
const runner=helperProcesses({changed:helpers=>send({type:'status',helpers})});let stopping=false;
async function stop(){if(stopping)return;stopping=true;await runner.stop();process.exit(0);}
process.on('disconnect',()=>void stop());process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
process.once('message',async request=>{
 try{if(!Array.isArray(request.helpers)||request.helpers.length>100)throw Error('Invalid helper session');await runner.start(request);send({type:'ready'});}
 catch(error){send({type:'error',error:error.message});await stop();}
});
