import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source=await fs.readFile(new URL('../client/native/Client.swift',import.meta.url),'utf8');

test('native client bridge admits and bounds live mod configuration actions',()=>{
 for(const fragment of ['"mod-settings"','"settings-export"','"settings-preview"','"settings-import"','"settings-undo"','"companion"','op=="mod-settings"','op=="companion"','slackSettingSections','patch.count<=40','encoded.count<=50000','text.utf8.count<=30000','request["modId"]=modID','request["patch"]=patch','request["enabled"]=enabled'])assert.ok(source.includes(fragment),`missing native settings bridge contract: ${fragment}`);
});

test('native client bridge forwards only recognized Slack settings deep links',()=>{
 assert.ok(source.includes('guard op=="show",slackSettingSections.contains(section)'));
 assert.ok(source.includes('request["section"]=section'));
 assert.ok(source.includes('"slack-sidebar-productivity"'));
 assert.equal(source.includes('"slack-sidebar-peek"'),false);
});
