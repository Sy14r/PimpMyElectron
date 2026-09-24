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

test('backdrop stream publishes geometry and hides on disconnect without permitting commands',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'backdrop-')),file=path.join(dir,'shell.sock');let value={id:'one'},disconnected=false;
 const server=await createShellServer({file,state:()=>({}),command:()=>{throw Error('No command expected');},backdropState:()=>value,backdropDisconnected:()=>{disconnected=true;}});
 const socket=net.createConnection(file);socket.setEncoding('utf8');const lines=[];let pending='',resolve;
 socket.on('data',chunk=>{pending+=chunk;while(pending.includes('\n')){const index=pending.indexOf('\n');lines.push(JSON.parse(pending.slice(0,index)));pending=pending.slice(index+1);resolve?.();}});
 const next=()=>new Promise(r=>{resolve=r;});
 t.after(async()=>{socket.destroy();await server.close();await fs.rm(dir,{recursive:true,force:true});});
 await new Promise(r=>socket.once('connect',r));let received=next();socket.write('{"op":"watch-backdrop"}\n');await received;
 assert.deepEqual(lines.shift(),{backdrop:{id:'one'}});assert.equal(server.backdropConnected(),true);
 value=null;received=next();server.publishBackdrop();await received;assert.deepEqual(lines.shift(),{backdrop:null});
 socket.end();await new Promise(r=>socket.once('close',r));await new Promise(r=>setImmediate(r));assert.equal(server.backdropConnected(),false);assert.equal(disconnected,true);
});
