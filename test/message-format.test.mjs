import {test} from 'node:test';import assert from 'node:assert/strict';import {messageParts} from '../src/message-format.mjs';
test('message formatting resolves mentions and treats HTML and unsafe schemes as text',()=>{
 const parts=messageParts('<@UONE> *bold* `x<y` <https://example.test?a=1&amp;b=2|Link> <javascript:alert(1)|evil> <img src=x onerror=alert(1)>',new Map([['UONE','Ada']]));
 assert.equal(parts[0].text,'@Ada');assert.ok(parts.some(p=>p.type==='strong'));assert.equal(parts.find(p=>p.type==='a').href,'https://example.test/?a=1&b=2');
 assert.equal(parts.filter(p=>p.type==='a').length,1);assert.ok(parts.some(p=>p.type==='text'&&p.text.includes('<img')));
});
