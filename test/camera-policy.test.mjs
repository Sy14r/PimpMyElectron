import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
test('native Camera Pause ownership and attribution regression suite',{skip:process.platform!=='darwin'},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-camera-policy-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const source=await fs.readFile(new URL('../native/spotify/camera/CameraPausePolicy.swift',import.meta.url),'utf8');
 const checks=`
let playing=CameraPlayback(state:"playing",track:"spotify:track:one",position:10)
let paused=CameraPlayback(state:"paused",track:playing.track,position:10)
var p=CameraPausePolicy()
precondition(p.evaluate(camera:true,playback:playing,now:0) == .pause)
p.didPause(paused)
precondition(p.evaluate(camera:true,playback:paused,now:1) == nil)
precondition(p.evaluate(camera:false,playback:paused,now:2) == nil)
precondition(p.evaluate(camera:false,playback:paused,now:3) == nil)
precondition(p.evaluate(camera:false,playback:paused,now:4) == .resume)
precondition(p.evaluate(camera:false,playback:paused,now:5) == nil)
p.didResume();precondition(p.owned==nil)
p.reset()
precondition(p.evaluate(camera:true,playback:paused,now:0) == nil)
precondition(p.evaluate(camera:false,playback:paused,now:2) == nil)
precondition(p.owned == nil)
p.reset();_ = p.evaluate(camera:true,playback:playing,now:0);p.didPause(paused)
precondition(p.evaluate(camera:true,playback:playing,now:1) == nil)
precondition(p.owned == nil)
precondition(p.evaluate(camera:false,playback:paused,now:3) == nil)
p.reset();_ = p.evaluate(camera:true,playback:playing,now:0);p.didPause(paused)
_ = p.evaluate(camera:false,playback:paused,now:1)
precondition(p.evaluate(camera:true,playback:paused,now:2) == nil)
precondition(p.owned != nil)
_ = p.evaluate(camera:false,playback:paused,now:3)
precondition(p.evaluate(camera:false,playback:paused,now:5) == .resume)
for changed in [CameraPlayback(state:"paused",track:"spotify:track:two",position:10),CameraPlayback(state:"stopped",track:"",position:0),CameraPlayback(state:"paused",track:playing.track,position:20)] {
 p.reset();_ = p.evaluate(camera:true,playback:playing,now:0);p.didPause(paused)
 _ = p.evaluate(camera:false,playback:changed,now:1)
 precondition(p.evaluate(camera:false,playback:changed,now:4) == nil && p.owned == nil)
}
p.reset();_ = p.evaluate(camera:true,playback:playing,now:0);p.didPause(paused)
_ = p.evaluate(camera:nil,playback:paused,now:1)
precondition(p.owned == nil)
precondition(p.evaluate(camera:false,playback:paused,now:10) == nil)
// Spotify may acknowledge pause while still reporting playing for a short time.
p.reset();_ = p.evaluate(camera:true,playback:playing,now:0)
p.pauseAcknowledged(playing,now:0)
precondition(p.evaluate(camera:true,playback:playing,now:0.5)==nil)
precondition(p.confirmingPause != nil && p.owned==nil)
precondition(p.evaluate(camera:false,playback:paused,now:1)==nil)
precondition(p.owned != nil)
precondition(p.evaluate(camera:false,playback:paused,now:5,resumeDelay:5)==nil)
precondition(p.evaluate(camera:false,playback:paused,now:6,resumeDelay:5) == .resume)
p.cancelResumeAttempt()
precondition(p.evaluate(camera:false,playback:paused,now:7,resumeDelay:5) == .resume)
p.didResume();precondition(p.owned==nil)
p.reset();_ = p.evaluate(camera:true,playback:playing,now:0);p.pauseAcknowledged(playing,now:0)
_ = p.evaluate(camera:true,playback:playing,now:4)
precondition(p.confirmingPause==nil && p.owned==nil)
p.reset();_ = p.evaluate(camera:true,playback:playing,now:0);p.didPause(paused)
precondition(p.evaluate(camera:false,playback:paused,now:1,resumeDelay:0) == .resume)
let prefix=CameraAttributionParser.prefix
precondition(CameraAttributionParser.parse(prefix+"[]") == Set<String>())
precondition(CameraAttributionParser.parse(prefix+"[\\"mic:com.test.browser\\", \\"cam:us.zoom.xos\\", \\"cam:com.test.browser\\"]") == Set(["us.zoom.xos","com.test.browser"]))
precondition(CameraAttributionParser.parse(prefix+"[\\"mic:us.zoom.xos\\"]") == Set<String>())
for invalid in ["Recent activity attributions changed to []",prefix+"<private>",prefix+"[\\"cam:<private>\\"]",prefix+"[\\"cam:com.test\\"] trailing",prefix+"[null]"] {precondition(CameraAttributionParser.parse(invalid) == nil)}
print("Camera ownership, manual overrides, overlap, debounce, signal loss, and attribution parsing passed")
`;
 const file=path.join(dir,'main.swift');await fs.writeFile(file,source+checks);
 const result=spawnSync('/Library/Developer/CommandLineTools/usr/bin/swift',[file],{env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr||result.error?.message);assert.match(result.stdout,/passed/);
});

test('camera preferences migrate the original app list and persist the resume delay',{skip:process.platform!=='darwin'},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pme-camera-settings-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const source=(await fs.readFile(new URL('../native/spotify/camera/CameraPausePolicy.swift',import.meta.url),'utf8'))+'\n'+(await fs.readFile(new URL('../native/spotify/camera/CameraPause.swift',import.meta.url),'utf8'));
 const checks=`
let directory=CommandLine.arguments[1]
let settingsFile=URL(fileURLWithPath:directory).appendingPathComponent("camera-pause.json")
let targets=[CameraTarget(id:"com.apple.PhotoBooth",name:"Photo Booth")]
try JSONEncoder().encode(targets).write(to:settingsFile)
let original=CameraPause(directory:directory)
precondition(original.targets.first?.id=="com.apple.PhotoBooth" && original.resumeDelay==1.5)
original.resumeDelay=7.5;original.saveConfiguration()
let reloaded=CameraPause(directory:directory)
precondition(reloaded.resumeDelay==7.5 && reloaded.targets.count==1)
original.resumeDelay=100;original.saveConfiguration()
precondition(CameraPause(directory:directory).resumeDelay==30)
original.resumeDelay = -3;original.saveConfiguration()
precondition(CameraPause(directory:directory).resumeDelay==0)
print("Settings migration and delay persistence passed")
`;
 const file=path.join(dir,'main.swift');await fs.writeFile(file,source+checks);
 const result=spawnSync('/Library/Developer/CommandLineTools/usr/bin/swift',[file,dir],{env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr||result.error?.message);assert.match(result.stdout,/passed/);
});
