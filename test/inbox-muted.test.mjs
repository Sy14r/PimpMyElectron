import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/renderer/triage.js',import.meta.url),'utf8');
const get=line=>source.split('\n').find(s=>s.trim().startsWith(line));
function setup(){
 const rows=['dm','groupDM','channel','thread'].map((kind,i)=>({key:String(i),name:kind,kind,unread:true,muted:true,mentions:1,triage:{state:'active'}}));
 rows.push({key:'live',name:'Live',kind:'dm',unread:true});
 const e={rows,filter:'all',heldRow:null,pillReadPending:null,items:()=>rows,notificationItems:()=>rows,replyDismissed:()=>false,displayName:i=>i.name,$:()=>({value:''})};
 vm.runInNewContext([get('const pendingInboxRead='),get('const pendingInboxUnread='),get('const inboxUnread='),get('const pillItems='),source.slice(source.indexOf('  const filtered ='),source.indexOf('  const el =')),'this.filtered=filtered;this.pillItems=pillItems;this.inboxUnread=inboxUnread;'].join('\n'),e);return e;
}
test('muted entries remain in content filters but never enter Unread or pill, even when held or marked unread',()=>{
 const e=setup();assert.equal(e.filtered().length,5);assert.equal(e.pillItems().length,1);
 for(const [filter,count] of [['mentions',4],['dms',3],['channels',1],['threads',1],['unread',1]]){e.filter=filter;assert.equal(e.filtered().length,count);}
 e.heldRow={key:'0',filter:'unread'};e.pillReadPending={key:'0',unread:true};assert.equal(e.filtered().length,1);assert.equal(e.inboxUnread(e.rows[0]),false);
 e.rows[0].muted=false;assert.equal(e.filtered().length,2);assert.equal(e.pillItems().length,2);
});

test('Apps & agents has a dedicated filter without changing read or mute policy',()=>{
 const e=setup();e.rows[0].appConversation=true;e.rows[3].appConversation=true;
 e.filter='apps';assert.deepEqual(Array.from(e.filtered(),i=>i.key),['0']);
 e.filter='dms';assert.deepEqual(Array.from(e.filtered(),i=>i.key),['1','live']);
 e.filter='threads';assert.deepEqual(Array.from(e.filtered(),i=>i.key),['3']);
 e.filter='unread';assert.deepEqual(Array.from(e.filtered(),i=>i.key),['live']);
 e.filter='all';assert.equal(e.filtered().length,5);
});
