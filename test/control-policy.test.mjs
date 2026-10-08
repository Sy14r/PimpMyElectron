import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createControlPolicy} from '../src/control-policy.mjs';

test('everyday launch retains maintenance but refuses developer operations and mode changes', () => {
  const policy=createControlPolicy();
  assert.equal(policy.mode,'everyday');
  for(const op of ['status','reply-layout','stop','reload','restart-shell','show','mod-settings','companion']) assert.doesNotThrow(()=>policy.assert({op}));
  for(const op of ['inspect','screenshot','test-network-offline','test-network-restore'])
    assert.throws(()=>policy.assert({op,development:true,mode:'development',expression:'1+1'}),/disabled/);
  for(const request of [null,[],{}, {op:'development'},{op:'eval'}]) assert.throws(()=>policy.assert(request));
});
test('development controls require the explicit startup flag', () => {
  const policy=createControlPolicy(['--development']);
  assert.equal(policy.mode,'development');
  for(const op of ['inspect','screenshot','test-network-offline','test-network-restore','reload']) assert.doesNotThrow(()=>policy.assert({op}));
  for(const args of [['--debug'],['--development=false'],['--development','--development']]) assert.throws(()=>createControlPolicy(args));
});
