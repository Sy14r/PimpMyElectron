// Parent crash/disconnect closes IPC and stops this supervisor's helpers.
import {helperProcesses} from './helper-processes.mjs';
const send=value=>{if(process.connected)process.send(value,()=>{});};
const runner=helperProcesses({changed:helpers=>send({type:'status',helpers})});let stopping=false;
async function stop(){if(stopping)return;stopping=true;await runner.stop();process.exit(0);}
process.on('disconnect',()=>void stop());process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
process.once('message',async request=>{
 try{if(!Array.isArray(request.helpers)||request.helpers.length>100)throw Error('Invalid helper session');await runner.start(request);process.on('message',message=>{if(stopping||message?.type!=='request'||typeof message.requestId!=='string'||!/^[a-z0-9-]{1,60}$/.test(message.requestId))return;let size;try{size=Buffer.byteLength(JSON.stringify(message.payload));}catch{size=Infinity;}if(typeof message.modId!=='string'||message.modId.length>160||typeof message.operation!=='string'||size>64*1024){send({type:'response',requestId:message.requestId,ok:false,error:'Invalid private service request'});return;}void Promise.resolve().then(()=>runner.request(message.modId,message.operation,message.payload)).then(result=>send({type:'response',requestId:message.requestId,ok:true,result}),error=>send({type:'response',requestId:message.requestId,ok:false,error:String(error?.message||'Private service request failed').slice(0,200)}));});send({type:'ready'});}
 catch(error){send({type:'error',error:error.message});await stop();}
});
