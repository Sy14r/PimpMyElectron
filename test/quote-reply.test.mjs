import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {validateCatalog,moduleSelection} from '../client/core/catalog.mjs';
const source=await fs.readFile(new URL('../src/renderer/quote-reply.js',import.meta.url),'utf8');
function helpers(extra={}){const context={...extra};vm.runInNewContext(source.slice(source.indexOf('  function messageText('),source.indexOf('  function decorate(')),context);return context;}
const json=value=>JSON.parse(JSON.stringify(value));
const text=value=>({nodeType:3,nodeValue:value});
const node=(tag,children=[],attrs={})=>({nodeType:1,tagName:tag,childNodes:children,hidden:!!attrs.hidden,getAttribute:k=>attrs[k]??null});
test('quotes only message content, preserving paragraphs, emoji, and literal unsafe-looking text',()=>{
 const h=helpers();const body=node('DIV',[node('DIV',[text('first <script>literal</script>'),node('BR'),text('second')]),node('DIV',[node('IMG',[],{alt:':wave:'}),text(' third')]),node('BUTTON',[text('Reply')]),node('SPAN',[text('hidden')],{hidden:true}),node('SPAN',[text('tooltip')],{'data-stringify-ignore':'true'})]);
 assert.equal(h.messageText(body),'first <script>literal</script>\nsecond\n:wave: third');
 assert.equal(h.messageText(node('DIV',[])),'');
});
test('rich quote deltas never delete existing drafts or create mention embeds',()=>{
 const h=helpers(),delta=json(h.quoteDelta('@person\n\n<literal>'));
 assert.deepEqual(delta.ops,[{insert:'@person'},{insert:'\n',attributes:{blockquote:true}},{insert:'\n',attributes:{blockquote:true}},{insert:'<literal>'},{insert:'\n',attributes:{blockquote:true}},{insert:'\n'}]);
 assert.deepEqual(json(h.quoteDelta('one\ntwo',false)),{ops:[{insert:'> one\n> two\n\n'}]});
});
function fixture(){
 const calls=[],draft=[{insert:'existing draft',attributes:{bold:true}},{insert:'\n'}];
 const editor={focus:()=>calls.push('focus')};
 const q={options:{formats:['blockquote']},getLength:()=>15,getModule:()=>({cutoff:()=>calls.push('cutoff')}),updateContents:(delta,source)=>{calls.push({delta:json(delta),source});},setSelection:(...args)=>calls.push({selection:args})};
 const h=helpers({});h.destination=()=>({quill:q,editor});h.messageText=()=> 'quoted text';h.showNotice=msg=>calls.push({notice:msg});
 return {h,q,calls,draft,message:{querySelector:()=>({})}};
}
test('quote edits the native model as one undo group and places focus in the existing draft',()=>{
 const f=fixture();assert.equal(f.h.quote(f.message),true);
 assert.deepEqual(f.calls.map(c=>typeof c==='string'?c:Object.keys(c)[0]),['cutoff','delta','cutoff','focus','selection']);
 assert.equal(f.calls[1].source,'user');assert.ok(f.calls[1].delta.ops.every(op=>typeof op.insert==='string'&&!('delete' in op)&&!('retain' in op)));
 assert.deepEqual(f.calls.at(-1).selection,[14,0,'user']);
});
test('missing destinations, empty text, oversize drafts and editor errors do not silently insert or resend',()=>{
 for(const kind of ['destination','empty','oversize','throw']){
  const f=fixture();if(kind==='destination')f.h.destination=()=>null;if(kind==='empty')f.h.messageText=()=>'';if(kind==='oversize')f.q.getLength=()=>39000;if(kind==='throw')f.q.updateContents=()=>{throw Error('changed editor')};
  assert.equal(f.h.quote(f.message),false);assert.ok(f.calls.some(c=>c.notice));assert.equal(f.calls.some(c=>c.delta),false);
 }
});
test('quote-only mod selection is independent of every triage module',async()=>{
 const manifest=JSON.parse(await fs.readFile(new URL('../mods/runtime.json',import.meta.url))),catalog=validateCatalog(JSON.parse(await fs.readFile(new URL('../client/catalog.json',import.meta.url))),manifest.modules),slack=catalog.apps.find(a=>a.id==='slack');
 const solo=moduleSelection(slack,['slack-quote-reply'],manifest.modules);assert.equal(solo.disabled.includes('quote-reply'),false);for(const id of ['triage-surface','state-observer','native-reply','history-reader','mark-read','slack-appearance'])assert.equal(solo.disabled.includes(id),true);
 const together=moduleSelection(slack,['slack-quote-reply','slack-triage'],manifest.modules);for(const id of ['quote-reply','triage-surface','state-observer','native-reply'])assert.equal(together.disabled.includes(id),false);
 assert.equal(slack.mods.find(m=>m.id==='slack-quote-reply').defaultEnabled,false);
});
function scopeFixture({thread=false,channel='CONE',editorChannel='CONE',editorTeam='TONE',count=1,hidden=false,editable=true,view=true}={}){
 const panel={},scope={querySelectorAll:()=>Array(count).fill(editor)};
 const box={dataset:{channelId:editorChannel,...(thread?{threadTs:'123.456'}:{})},__quill:{getContents(){},getLength(){},updateContents(){},setSelection(){},getModule(){},isEnabled:()=>editable}};
 const editor={dataset:{teamId:editorTeam},closest:s=>s==='[data-qa="message_input"]'?box:s==='.p-threads_flexpane'&&thread?panel:null};box.__quill.root=editor;panel.querySelectorAll=scope.querySelectorAll;
 const message={getAttribute:()=>channel,closest:s=>s==='.p-threads_flexpane'?thread?panel:null:s==='[data-qa="message_pane"]'?view?{}:null:s==='.p-view_contents'?scope:null};
 const h=helpers({workspace:()=> 'TONE',visible:n=>n===message||!hidden,THREAD:'.p-threads_flexpane',MESSAGE:'[data-qa="message_container"]',EDITOR:'editor'});
 return {h,message,editor,box};
}
test('destination stays in the exact visible workspace, conversation and thread',()=>{
 for(const thread of [false,true]){const f=scopeFixture({thread});assert.equal(f.h.destination(f.message)?.editor,f.editor);assert.equal(f.h.destination(f.message)?.threadTs,thread?'123.456':null);}
 for(const opts of [{editorChannel:'COTHER'},{editorTeam:'TOTHER'},{count:2},{count:0},{hidden:true},{editable:false},{view:false},{channel:'invalid'}]){const f=scopeFixture(opts);assert.equal(f.h.destination(f.message),null);}
});
test('Reply Tools accepts only real Slack permalinks and exposes both independently configurable actions',async()=>{
 const h=helpers({URL});
 assert.equal(h.parsePermalink('https://example.slack.com/archives/C123/p1234567890123456'),'https://example.slack.com/archives/C123/p1234567890123456');
 for(const value of ['https://app.slack.com/client/T/C','http://example.slack.com/archives/C123/p1234567890123456','https://example.com/archives/C123/p1234567890123456','javascript:alert(1)'])assert.equal(h.parsePermalink(value),null);
 for(const fragment of ['data-pme-reply-preview','Reply with preview','previewShortcut','compactCards','data-pme-reply-compact-cards','forwarded_message_card','ClipboardEvent','DataTransfer','event.stopImmediatePropagation()','more_message_actions','decorateMenus()','copy\\s+(?:message\\s+)?link','data-pme-quote-menu','data-pme-preview-menu','configure(value={}'])assert.ok(source.includes(fragment),`missing reply preview contract: ${fragment}`);
 const manifest=JSON.parse(await fs.readFile(new URL('../mods/runtime.json',import.meta.url))),catalog=validateCatalog(JSON.parse(await fs.readFile(new URL('../client/catalog.json',import.meta.url))),manifest.modules),mod=catalog.apps.find(app=>app.id==='slack').mods.find(item=>item.id==='slack-quote-reply');assert.equal(mod.name,'Reply Tools');for(const key of ['quoteAction','previewAction','previewShortcut','compactCards'])assert.ok(mod.settings.some(setting=>setting.key===key));
});
