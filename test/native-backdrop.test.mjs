import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeBackdrop} from '../src/native-backdrop.mjs';
const geometry={window:{x:980,y:39,width:820,height:1130},inbox:{x:980,y:39,width:420,height:1130}};
const request={id:'session',slackPID:123,geometry,enabled:true};
test('native backdrop admits only finite inbox geometry inside the owned window',()=>{
 assert.deepEqual(nativeBackdrop(request),{id:'session',slackPID:123,...geometry});
 for(const progress of [0,.25,.5,.75,1])assert.ok(nativeBackdrop({...request,geometry:{...geometry,inbox:{...geometry.inbox,x:980+400*progress}}}));
 for(const patch of [{enabled:false},{slackPID:0},{id:null},{geometry:null}])assert.equal(nativeBackdrop({...request,...patch}),null);
 for(const patch of [{x:979-1},{x:1381+1},{width:421},{height:9000},{width:NaN},{y:Infinity}])assert.equal(nativeBackdrop({...request,geometry:{...geometry,inbox:{...geometry.inbox,...patch}}}),null);
 for(const width of [12,44,419,821,1e9])assert.equal(nativeBackdrop({...request,geometry:{...geometry,window:{...geometry.window,width}}}),null);
 const extra={...geometry,inbox:{...geometry.inbox,text:'private'},window:{...geometry.window,command:'anything'}};
 assert.deepEqual(nativeBackdrop({...request,geometry:extra}),{id:'session',slackPID:123,...geometry});
});
