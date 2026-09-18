import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loopbackURL, eventually, targets } from '../scripts/cdp.mjs';

test('CDP client refuses non-loopback endpoints and embedded credentials', () => {
  for (const address of ['http://example.com', 'ws://0.0.0.0:9222', 'ws://127.0.0.1.evil.test:9222',
    'ws://user:secret@127.0.0.1:9222', 'file:///tmp/cdp']) {
    assert.throws(() => loopbackURL(address));
  }
  assert.equal(loopbackURL('ws://127.0.0.1:9222/devtools/page/test').hostname, '127.0.0.1');
});

test('invalid ports are rejected before network discovery', async () => {
  for (const port of [0, -1, 65536, '9222/path', 'not-a-port']) await assert.rejects(targets(port), /Invalid port/);
});

test('readiness probe tolerates a transient navigation error', async () => {
  let attempts = 0;
  const result = await eventually(() => {
    if (++attempts === 1) throw new Error('Execution context destroyed');
    return 42;
  }, 1000);
  assert.equal(result, 42);
});
