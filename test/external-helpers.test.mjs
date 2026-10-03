import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fork} from 'node:child_process';
import {helperProcesses} from '../src/helper-processes.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('helpers run without inherited injection variables, get per-mod storage and stop with their session',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-helper-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const output=path.join(dir,'running.json'),code=`require('fs').writeFileSync(${JSON.stringify(output)},JSON.stringify({pid:process.pid,env:process.env}));setInterval(()=>{},1000);`;
 const runner=helperProcesses({verify:async()=>process.execPath});t.after(()=>runner.stop());
 await runner.start({helpers:[{id:'native',modId:'external:company/demo',root:dir,args:['-e',code]}],runtimeDir:dir,appPath:'/Applications/Slack.app',targetPID:123});
 let value;for(let i=0;i<100;i++){try{value=JSON.parse(await fs.readFile(output,'utf8'));break;}catch{await wait(20);}}assert.ok(value);assert.equal(value.env.PME_APP_PID,'123');assert.equal(value.env.NODE_OPTIONS,undefined);assert.equal(value.env.PME_HELPER_API,'1');assert.ok(value.env.PME_MOD_DATA_DIR.startsWith(dir));assert.equal(runner.status()[0].state,'running');
 await runner.stop();assert.throws(()=>process.kill(value.pid,0));assert.equal(runner.status()[0].state,'stopped');
});
test('a failed helper start cleans up siblings and the supervisor exits on owner disconnect',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-helper-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let calls=0;
 const runner=helperProcesses({verify:async()=>{if(calls++)throw Error('bad signature');return process.execPath;}});
 await assert.rejects(runner.start({helpers:[{id:'one',modId:'demo',root:dir,args:['-e','setInterval(()=>{},1000)']},{id:'two'}],runtimeDir:dir,appPath:'',targetPID:0}),/bad signature/);assert.equal(runner.status()[0].state,'stopped');
 const child=fork(new URL('../src/external-helper-host.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']});t.after(()=>{if(child.exitCode===null)child.kill();});
 const ready=new Promise(resolve=>child.on('message',m=>{if(m.type==='ready')resolve();}));child.send({helpers:[]});await ready;const exit=new Promise(resolve=>child.once('exit',resolve));child.disconnect();assert.equal(await exit,0);
});
