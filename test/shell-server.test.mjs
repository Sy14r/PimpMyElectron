import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import net from 'node:net';
import {createShellServer} from '../src/shell-server.mjs';
test('native socket admits named operations only, supports UTF-8 and is private',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shell-')),file=path.join(dir,'shell.sock'),calls=[];
 const server=await createShellServer({file,state:()=>({label:'Triage ✓'}),configure:patch=>({patch}),command:async(op,workspaceId)=>{calls.push({op,workspaceId});return {mode:'queue'};}});
 t.after(async()=>{await server.close();await fs.rm(dir,{recursive:true,force:true});});
 const request=input=>new Promise((resolve,reject)=>{const socket=net.createConnection(file);socket.setEncoding('utf8');let data='';socket.on('connect',()=>socket.write(JSON.stringify(input)+'\n'));socket.on('data',s=>data+=s);socket.on('error',reject);socket.on('end',()=>resolve(JSON.parse(data)));});
 assert.equal((await fs.stat(file)).mode&0o777,0o600);
 assert.equal((await request({op:'state'})).result.label,'Triage ✓');assert.equal(server.connected(),true);
 assert.equal((await request({op:'inspect',expression:'arbitrary code'})).ok,false);assert.equal(calls.length,0);
 assert.equal((await request({op:'switch',workspaceId:'TONE'})).ok,true);assert.deepEqual(calls,[{op:'switch',workspaceId:'TONE'}]);
 assert.equal((await request({op:'stock-toggle'})).ok,true);assert.equal(calls.at(-1).op,'stock-toggle');
});
