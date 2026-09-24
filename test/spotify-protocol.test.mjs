import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {validateLibraryRequest,searchDefinition} from '../src/spotify/protocol.mjs';
const track='spotify:track:1234567890123456789012';
test('Mini Library bridge restricts actions and Spotify targets; arbitrary evaluation never passes through',()=>{
 for(const request of [null,[],{op:'eval',expression:'process.exit()'},{op:'play',uri:'https://example.com'},{op:'play',uri:'spotify:track:x'},{op:'library',offset:-1},{op:'library',offset:1.5},{op:'library',scope:'__proto__'},{op:'search',query:'x'.repeat(201)},{op:'play',uri:track,uid:'";alert(1)'}])assert.throws(()=>validateLibraryRequest(request));
 assert.deepEqual(validateLibraryRequest({op:'search',query:' hello ',source:'secret',token:'secret'}),{op:'search',query:'hello'});
 assert.deepEqual(validateLibraryRequest({op:'play',uri:track,context:'spotify:collection:tracks'}),{op:'play',uri:track,context:'spotify:collection:tracks'});
});
test('Search uses a version-specific query definition from installed client resources, fails closed on mismatch',()=>{
 const hash='a'.repeat(64);assert.deepEqual(searchDefinition(`x=new r.Q("searchDesktop","query","${hash}",null)`),{name:'searchDesktop',operation:'query',sha256Hash:hash,value:null});
 assert.equal(searchDefinition('searchDesktop query unknown'),null);assert.equal(searchDefinition(`new Q("otherQuery","query","${hash}",null)`),null);
});
const source=await readFile(new URL('../src/spotify/renderer.js',import.meta.url),'utf8');
function renderer(services,origin='https://xpui.app.spotify.com'){
 const di={_map:new Map(),resolve:k=>services[Symbol.keyFor(k)]};const root={__reactContainerTest:{stateNode:{current:{memoizedProps:{value:di}}}}};
 const window={};window.top=window;
 const context=vm.createContext({window,location:{origin},document:{getElementById:()=>root},Map,URL,Symbol});vm.runInContext(source,context);return window.__PMESpotify;
}
test('Renderer rejects untrusted origins and exports only normalized music data',async()=>{
 const item={uri:track,name:'Song',artists:[{name:'Artist'}],images:[{url:'https://evil.example/image'}],accessToken:'never-export',account:{email:'never-export'}};
 const services={LibraryAPI:{getContents:async()=>({items:[item],totalLength:1})}};
 assert.equal(renderer(services,'https://example.com'),undefined);
 const result=await renderer(services).invoke({op:'library',scope:'playlists'});assert.equal(result.items[0].name,'Song');assert.equal(result.items[0].image,'');assert.equal(JSON.stringify(result).includes('never-export'),false);
});
test('Search normalizes native album enums to playable collection types and caches repeat queries',async()=>{
 let calls=0;const services={LibraryAPI:{getContents(){}},GraphQLLoader:async()=>{calls++;return {data:{searchV2:{albumsV2:{items:[{data:{uri:'spotify:album:1234567890123456789012',type:'ALBUM',name:'Album'}}]}}}}}};
 const window={__PMESpotifySearchQuery:{name:'searchDesktop'}};window.top=window;const di={_map:new Map(),resolve:k=>services[Symbol.keyFor(k)]};
 vm.runInContext(source,vm.createContext({window,location:{origin:'https://xpui.app.spotify.com'},document:{getElementById:()=>({__reactContainerTest:{stateNode:{current:{memoizedProps:{value:di}}}}})},Map,URL,Symbol}));
 const result=await window.__PMESpotify.invoke({op:'search',query:'album'});assert.equal(result.items[0].type,'album');await window.__PMESpotify.invoke({op:'search',query:'album'});assert.equal(calls,1);
});
test('Playback mode requests accept only a boolean shuffle and the three repeat modes',()=>{
 for(const enabled of [true,false])assert.deepEqual(validateLibraryRequest({op:'shuffle',enabled}),{op:'shuffle',enabled});
 for(const mode of [0,1,2])assert.deepEqual(validateLibraryRequest({op:'repeat',mode}),{op:'repeat',mode});
 for(const request of [{op:'shuffle'},{op:'shuffle',enabled:'true'},{op:'repeat',mode:3},{op:'repeat',mode:'1'},{op:'repeat',mode:-1}])assert.throws(()=>validateLibraryRequest(request));
});
test('Playback modes follow native state and restrictions, preserving three-state repeat',async()=>{
 const state={hasContext:true,shuffle:false,repeat:0,restrictions:{canToggleShuffle:true,canToggleRepeatContext:true,canToggleRepeatTrack:true}};
 const calls=[];const bridge=renderer({LibraryAPI:{getContents(){}},PlayerAPI:{getState:()=>state,setShuffle:async value=>{calls.push(['shuffle',value]);state.shuffle=value;},setRepeat:async value=>{calls.push(['repeat',value]);state.repeat=value;}}});
 await bridge.invoke({op:'shuffle',enabled:true});assert.equal((await bridge.invoke({op:'playback-modes'})).shuffle,true);
 for(const mode of [1,2,0]){await bridge.invoke({op:'repeat',mode});assert.equal((await bridge.invoke({op:'playback-modes'})).repeat,mode);}
 state.restrictions.canToggleRepeatTrack=false;await assert.rejects(bridge.invoke({op:'repeat',mode:2}),/unavailable/);
 state.restrictions.canToggleShuffle=false;await assert.rejects(bridge.invoke({op:'shuffle',enabled:false}),/unavailable/);
 assert.deepEqual(calls,[['shuffle',true],['repeat',1],['repeat',2],['repeat',0]]);
});
