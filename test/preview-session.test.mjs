import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewSession} from '../src/preview-session.mjs';
test('preview bridges the gap, renews only its issued key, and expires after helper loss',()=>{
 let now=0;const p=createPreviewSession({now:()=>now});
 p.update('s1','cluster',{key:'one'});now=2000;assert.equal(p.get().request.key,'one');
 p.update('s1','cluster',null);now+=800;p.hold('other');assert.equal(p.held('s1'),false);
 p.hold('one');assert.equal(p.held('s1'),true);now+=800;assert.equal(p.get().request.key,'one');
 now+=500;assert.equal(p.get(),null);
});
test('a different badge, mode or cleared scope cannot retain the previous lease',()=>{
 const p=createPreviewSession();p.update('s1','cluster',{key:'one'});p.hold('one');
 p.update('s1','cluster',{key:'two'});assert.equal(p.held('s1'),false);p.hold('one');assert.equal(p.held('s1'),false);
 p.hold('two');p.update('s1','queue',null);assert.equal(p.get(),null);
 p.update('s1','cluster',{key:'one'});p.hold('one');p.clear();assert.equal(p.held('s1'),false);
});
