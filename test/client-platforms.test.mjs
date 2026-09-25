import {test} from 'node:test';import assert from 'node:assert/strict';
import {hostPlatform,validatePlatforms,validateCatalog,resolveSelection,modCompatibility} from '../client/core/catalog.mjs';
const mod=(id,platforms,requires=[])=>({id,platforms,requires,modules:[]});
test('mod platforms are explicit, validated, and map to Node host platforms',()=>{
 assert.equal(hostPlatform('darwin'),'mac');assert.equal(hostPlatform('win32'),'windows');assert.equal(hostPlatform('linux'),'linux');assert.equal(hostPlatform('freebsd'),'unknown');
 for(const value of [undefined,[],['darwin'],['global','mac'],['mac','mac'],'mac'])assert.throws(()=>validatePlatforms(value));
 for(const value of [['global'],['mac'],['windows','linux']])assert.deepEqual(validatePlatforms(value),value);
});
test('a catalog can contain incompatible mods but selection enforces every dependency',()=>{
 const app={id:'spotify',adapter:'spotify',bundleId:'com.spotify.client',mods:[mod('native',['mac']),mod('portable',['global']),mod('other',['windows','linux']),mod('wrapper',['global'],['native'])]};
 validateCatalog({schemaVersion:1,apps:[app]},[]);
 assert.deepEqual(resolveSelection(app,['portable','native'],{platform:'mac'}),['portable','native']);
 assert.deepEqual(resolveSelection(app,['other','portable'],{platform:'windows'}),['other','portable']);
 assert.throws(()=>resolveSelection(app,['native'],{platform:'windows'}),/cannot run on Windows/);
 assert.throws(()=>resolveSelection(app,['wrapper'],{platform:'linux'}),/cannot run on Linux/);
 assert.equal(modCompatibility(app,'wrapper','windows').compatible,false);
 assert.equal(modCompatibility(app,'portable','linux').compatible,true);
 assert.deepEqual(resolveSelection(app,['portable'],{platform:'unknown'}),['portable']);
});
