import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {PipeCDP} from '../src/pipe.mjs';
function setup(timeout=1000){const input=new PassThrough(),output=new PassThrough();return {input,output,cdp:new PipeCDP(input,output,timeout)};}
test('pipe decodes fragmented UTF-8, coalesced events, and out-of-order replies',async()=>{
  const {input,output,cdp}=setup();const wire=[];input.on('data',d=>wire.push(JSON.parse(d.toString().slice(0,-1))));
  const a=cdp.send('A',{},'session'),b=cdp.send('B');const events=[];cdp.on('event',e=>events.push(e));
  const buffer=Buffer.from(JSON.stringify({id:2,result:{text:'hello 🌍'}})+'\0'+JSON.stringify({method:'event',params:{ok:true}})+'\0'+JSON.stringify({id:1,result:{ok:true}})+'\0');
  for(const byte of buffer)output.write(Buffer.from([byte]));
  assert.deepEqual(await b,{text:'hello 🌍'});assert.deepEqual(await a,{ok:true});assert.equal(events.length,1);assert.equal(wire[0].sessionId,'session');cdp.close();
});
test('pipe timeout and close reject pending commands and release state',async()=>{
  const {cdp}=setup(15);await assert.rejects(cdp.send('missing'),/Timeout/);assert.equal(cdp.pending.size,0);
  const pending=cdp.send('pending');cdp.close();await assert.rejects(pending,/closed/);await assert.rejects(cdp.send('late'),/closed/);assert.equal(cdp.pending.size,0);
});
test('pipe surfaces protocol and evaluation errors; malformed frame closes it',async()=>{
  const {output,cdp}=setup();let p=cdp.send('invalid');output.write(JSON.stringify({id:1,error:{message:'unsupported'}})+'\0');await assert.rejects(p,/unsupported/);
  p=cdp.evaluate('throw Error()');output.write(JSON.stringify({id:2,result:{exceptionDetails:{text:'evaluation failed'}}})+'\0');await assert.rejects(p,/evaluation failed/);
  p=cdp.send('next');output.write('{malformed}\0');await assert.rejects(p,/closed/);
});
