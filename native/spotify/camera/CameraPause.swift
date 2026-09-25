import AppKit
import SwiftUI

struct CameraTarget:Codable,Identifiable {let id:String;let name:String}
struct CameraPauseConfiguration:Codable {
    var targets:[CameraTarget]
    var resumeDelay:Double
}
final class CameraPause:ObservableObject {
    @Published var targets:[CameraTarget]=[]
    @Published var status="Waiting for macOS camera activity…"
    @Published var activeNames=""
    @Published var error=""
    @Published var ownsPause=false
    @Published var resumeDelay:Double=1.5
    private var lastAction="No playback action yet"
    var diagnostics:[String:Any] {["signalKnown":cameraApps != nil,"confirmingPause":policy.confirmingPause != nil,"resumePending":policy.resumePending,"lastAction":lastAction,"error":error]}
    private var icons:[String:NSImage]=[:]
    private let file:URL
    private var window:NSWindow?
    private var stream:Process?
    private var seed:Process?
    private var timer:Timer?
    private var retry:DispatchWorkItem?
    private var epoch=0
    private var workVersion=0
    private var lastTimestamp=""
    private var cameraApps:Set<String>?
    private var policy=CameraPausePolicy()
    private var busy=false
    private var stopped=false
    private var needsRetry=false
    private let work=DispatchQueue(label:"pme.spotify.camera-playback",qos:.utility)
    private let readQueue=DispatchQueue(label:"pme.spotify.camera-events",qos:.utility)
    var available:()->Bool={false}
    private var observers:[NSObjectProtocol]=[]
    init(directory:String){
        file=URL(fileURLWithPath:directory).appendingPathComponent("camera-pause.json")
        if let data=try? Data(contentsOf:file) {
            if let saved=try? JSONDecoder().decode(CameraPauseConfiguration.self,from:data) {targets=Array(saved.targets.filter{Self.validID($0.id)}.prefix(100));resumeDelay=saved.resumeDelay.isFinite ? min(30,max(0,saved.resumeDelay)):1.5}
            else if let saved=try? JSONDecoder().decode([CameraTarget].self,from:data) {targets=Array(saved.filter{Self.validID($0.id)}.prefix(100))}
        }
    }
    static func validID(_ id:String)->Bool {id.count<250 && id.range(of:"^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)+$",options:.regularExpression) != nil}
    func start(){
        startDetector()
        timer=Timer.scheduledTimer(withTimeInterval:1,repeats:true){[weak self] _ in self?.tick()}
        for name in [NSWorkspace.willSleepNotification,NSWorkspace.sessionDidResignActiveNotification] {
            observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName:name,object:nil,queue:.main){[weak self] _ in self?.suspend()})
        }
        for name in [NSWorkspace.didWakeNotification,NSWorkspace.sessionDidBecomeActiveNotification] {
            observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName:name,object:nil,queue:.main){[weak self] _ in guard let self,!self.stopped else{return};self.startDetector()})
        }
    }
    func suspend(){epoch+=1;workVersion+=1;policy.reset();ownsPause=false;cameraApps=nil;stream?.terminationHandler=nil;stream?.terminate();stream=nil;seed?.terminate();seed=nil;retry?.cancel();status="Camera monitoring suspended"}
    func stop(){stopped=true;suspend();timer?.invalidate();for observer in observers {NSWorkspace.shared.notificationCenter.removeObserver(observer)};observers=[];window?.close()}
    func startDetector(){
        guard !stopped else{return};suspend();status="Waiting for macOS camera activity…";lastTimestamp=""
        let generation=epoch
        needsRetry=false
        // This diagnostic stream carries app identifiers, never camera frames.
        let predicate="process == \"ControlCenter\" AND eventMessage BEGINSWITH \"\(CameraAttributionParser.prefix)\""
        func launch(_ args:[String],live:Bool)->Process? {
            let process=Process(),pipe=Pipe();process.executableURL=URL(fileURLWithPath:"/usr/bin/log");process.arguments=args
            process.standardOutput=pipe;process.standardError=FileHandle.nullDevice
            var buffer=Data()
            var latestSeed:[String:Any]?
            func deliver(_ event:[String:Any]) {
                guard let message=event["eventMessage"] as? String,let timestamp=event["timestamp"] as? String else{return}
                let pid=event["processID"] as? Int32
                DispatchQueue.main.async {[weak self] in guard let self,self.epoch==generation else{return}
                    guard let current=NSRunningApplication.runningApplications(withBundleIdentifier:"com.apple.controlcenter").first,pid==current.processIdentifier else{return}
                    guard timestamp>=self.lastTimestamp else{return};self.lastTimestamp=timestamp
                    guard let apps=CameraAttributionParser.parse(message) else{self.invalidateSignal("macOS camera attribution is unavailable");return}
                    self.cameraApps=apps;self.tick()
                }
            }
            pipe.fileHandleForReading.readabilityHandler={[weak self] handle in
                let bytes=handle.availableData
                if bytes.isEmpty {handle.readabilityHandler=nil;self?.readQueue.async {if !live,let event=latestSeed {deliver(event)}};return}
                self?.readQueue.async {[weak self] in
                    buffer.append(bytes)
                    if buffer.count>1024*1024 {buffer.removeAll();DispatchQueue.main.async {guard self?.epoch==generation else{return};self?.invalidateSignal("Camera activity could not be decoded")};return}
                    while let end=buffer.firstIndex(of:10) {
                        let line=Data(buffer.prefix(upTo:end));buffer.removeSubrange(...end)
                        guard let event=(try? JSONSerialization.jsonObject(with:line)) as? [String:Any],event["eventMessage"] is String,let timestamp=event["timestamp"] as? String else{continue}
                        if live {deliver(event)}else if timestamp >= (latestSeed?["timestamp"] as? String ?? "") {latestSeed=event}
                    }
                }
            }
            process.terminationHandler={[weak self] _ in DispatchQueue.main.async {guard let self,self.epoch==generation else{return};if live {self.invalidateSignal("Camera monitor disconnected; reconnecting…");let task=DispatchWorkItem{[weak self] in self?.startDetector()};self.retry=task;DispatchQueue.main.asyncAfter(deadline:.now()+5,execute:task)}}}
            do{try process.run();return process}catch{pipe.fileHandleForReading.readabilityHandler=nil;self.error="Camera activity logs are unavailable: \(error.localizedDescription)";return nil}
        }
        stream=launch(["stream","--style","ndjson","--level","info","--predicate",predicate],live:true)
        // Seed from a bounded history, while live delivery is already attached.
        // A timestamp check prevents older history from overwriting a live event.
        if stream != nil {seed=launch(["show","--last","1h","--style","ndjson","--info","--predicate",predicate],live:false)}
    }
    func invalidateSignal(_ message:String){workVersion+=1;cameraApps=nil;policy.reset();ownsPause=false;status=message}
    func selectedActive()->Bool? {guard let cameraApps else{return nil};return !cameraApps.isDisjoint(with:Set(targets.map(\.id)))}
    func tick(){
        let matching=targets.filter{cameraApps?.contains($0.id)==true};activeNames=matching.map(\.name).joined(separator:", ")
        guard !targets.isEmpty else{status="Choose apps to watch";return}
        guard let active=selectedActive() else{status="Waiting for camera activity. Toggle your camera off and on once to sync.";return}
        guard available() else{policy.reset();ownsPause=false;status="Waiting for Spotify";return}
        status=policy.confirmingPause != nil ? "Confirming Spotify paused…":policy.owned != nil ? (active ? "Spotify auto-paused":"Camera off · resuming after \(String(format: "%.1f", resumeDelay)) s"):(active ? "Camera in use · \(activeNames)":"Watching selected apps")
        guard !busy,!needsRetry,(active || policy.needsPlaybackCheck) else{return}
        busy=true;let generation=workVersion
        work.async {[weak self] in
            let snapshot=Self.playback()
            DispatchQueue.main.async {
                guard let self else{return};self.busy=false;guard generation==self.workVersion else{return}
                guard let playback=snapshot.0 else{self.policy.reset();self.ownsPause=false;self.needsRetry=true;self.error=snapshot.1 ?? "Could not read Spotify playback";return}
                self.error=""
                let confirming=self.policy.confirmingPause != nil,owned=self.policy.owned != nil
                if let action=self.policy.evaluate(camera:self.selectedActive(),playback:playback,now:ProcessInfo.processInfo.systemUptime,resumeDelay:self.resumeDelay){self.perform(action,expected:playback,generation:generation)}
                if confirming,self.policy.confirmingPause==nil {self.lastAction=self.policy.owned != nil ? "Pause confirmed":"Pause was not confirmed (state: \(playback.state))"}
                else if owned,self.policy.owned==nil {self.lastAction="Resume ownership cancelled (state: \(playback.state))"}
                self.ownsPause=self.policy.owned != nil
            }
        }
    }
    static func script(_ source:String)->(NSAppleEventDescriptor?,String?){
        var error:NSDictionary?;let result=NSAppleScript(source:"with timeout of 3 seconds\n\(source)\nend timeout")?.executeAndReturnError(&error)
        if let error {return(nil,(error[NSAppleScript.errorNumber] as? Int)==(-1743) ? "Allow PME to control Spotify in System Settings → Privacy & Security → Automation.":error[NSAppleScript.errorMessage] as? String ?? "Spotify control failed")}
        return(result,nil)
    }
    static func playback()->(CameraPlayback?,String?){
        let result=script("tell application id \"com.spotify.client\"\nif player state is stopped then return {\"stopped\", \"\", 0}\nreturn {player state as string, id of current track, player position}\nend tell")
        guard let d=result.0,let state=d.atIndex(1)?.stringValue,let track=d.atIndex(2)?.stringValue,let position=Double(d.atIndex(3)?.stringValue ?? "") else{return(nil,result.1)}
        return(CameraPlayback(state:state,track:track,position:position),nil)
    }
    func perform(_ action:CameraPauseAction,expected:CameraPlayback,generation:Int){
        guard available() else{policy.reset();return}
        // Only a Spotify track identifier is interpolated, never an app name or UI input.
        guard expected.track.range(of:"^spotify:[A-Za-z0-9:]+$",options:.regularExpression) != nil else{policy.reset();error="Spotify did not provide a resumable track";return}
        busy=true
        work.async {[weak self] in
            let valid=DispatchQueue.main.sync {guard let self else{return false};return self.workVersion==generation && self.available() && (action == .pause ? self.selectedActive()==true:self.selectedActive()==false)}
            guard valid else{DispatchQueue.main.async {self?.busy=false;if action == .resume {self?.policy.cancelResumeAttempt()}};return}
            let condition=action == .pause ? "player state is playing and (id of current track) is \"\(expected.track)\"":"player state is paused and (id of current track) is \"\(expected.track)\" and (absPositionDelta < 2)"
            let result=Self.script("tell application id \"com.spotify.client\"\nset absPositionDelta to player position - \(expected.position)\nif absPositionDelta < 0 then set absPositionDelta to -absPositionDelta\nif \(condition) then\n\(action == .pause ? "pause":"play")\nreturn true\nend if\nreturn false\nend tell")
            DispatchQueue.main.async {guard let self else{return};self.busy=false;guard self.workVersion==generation else{return}
                self.lastAction="\(action == .pause ? "Pause":"Resume") command: \(result.0?.booleanValue==true ? "accepted":"not applied")"
                if let error=result.1 {self.error=error;self.needsRetry=true;self.policy.reset()}
                else if action == .pause,result.0?.booleanValue==true {self.policy.pauseAcknowledged(expected,now:ProcessInfo.processInfo.systemUptime)}
                else if action == .resume {self.policy.didResume()}
                self.ownsPause=self.policy.owned != nil
            }
        }
    }
    func retryMonitoring(){needsRetry=false;error="";policy.reset();startDetector()}
    func cancelResume(){workVersion+=1;policy.owned=nil;policy.confirmingPause=nil;policy.resumePending=false;ownsPause=false;status="Auto-resume cancelled for this camera session"}
    func saveTargets(){
        workVersion+=1;policy.reset();ownsPause=false
        saveConfiguration();tick()
    }
    func saveConfiguration(){
        do {let data=try JSONEncoder().encode(CameraPauseConfiguration(targets:targets,resumeDelay:resumeDelay));try data.write(to:file,options:.atomic);try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path);error=""}catch{self.error="Could not save camera settings: \(error.localizedDescription)"}
    }
    func appIcon(_ id:String)->NSImage {
        if let image=icons[id] {return image}
        let image=NSWorkspace.shared.urlForApplication(withBundleIdentifier:id).map{NSWorkspace.shared.icon(forFile:$0.path)} ?? NSImage(systemSymbolName:"app.dashed",accessibilityDescription:nil)!
        icons[id]=image;return image
    }
    func addApplication(){
        let panel=NSOpenPanel();panel.allowedContentTypes=[.applicationBundle];panel.allowsMultipleSelection=true;panel.canChooseDirectories=false;panel.directoryURL=URL(fileURLWithPath:"/Applications");panel.prompt="Watch camera use"
        panel.begin {[weak self] response in guard response == .OK,let self else{return};for url in panel.urls {guard let bundle=Bundle(url:url),let id=bundle.bundleIdentifier,Self.validID(id),!self.targets.contains(where:{$0.id==id}),self.targets.count<100 else{continue};self.targets.append(CameraTarget(id:id,name:bundle.object(forInfoDictionaryKey:"CFBundleDisplayName") as? String ?? bundle.object(forInfoDictionaryKey:"CFBundleName") as? String ?? url.deletingPathExtension().lastPathComponent))};self.saveTargets()}
    }
    func showSettings(){
        if window==nil {let w=NSWindow(contentRect:NSRect(x:0,y:0,width:460,height:440),styleMask:[.titled,.closable,.resizable],backing:.buffered,defer:false);w.title="Spotify · Camera Pause";w.isReleasedWhenClosed=false;w.minSize=NSSize(width:420,height:360);w.maxSize=NSSize(width:680,height:720);let host=NSHostingView(rootView:CameraPauseSettings(model:self));host.sizingOptions=[];w.contentView=host;w.appearance=NSAppearance(named:.darkAqua);w.center();window=w}
        NSApp.activate(ignoringOtherApps:true);window?.makeKeyAndOrderFront(nil)
    }
}
struct CameraPauseSettings:View {
    @ObservedObject var model:CameraPause
    var body:some View {
        ScrollView {VStack(alignment:.leading,spacing:14){
            Label("Camera Pause",systemImage:"video.slash").font(.title2.bold())
            Text("Pause Spotify when these apps use your camera. Resume only music Camera Pause paused.").foregroundStyle(.secondary)
            HStack{Text("Watched apps").font(.headline);Spacer();Button("Add apps…"){model.addApplication()}}
            if model.targets.isEmpty {Text("No apps selected yet").foregroundStyle(.secondary).frame(maxWidth:.infinity).padding(.vertical,18).background(Color.white.opacity(0.04),in:RoundedRectangle(cornerRadius:8))}
            else {List {ForEach(model.targets){app in HStack(spacing:10){Image(nsImage:model.appIcon(app.id)).resizable().scaledToFit().frame(width:30,height:30).accessibilityHidden(true);VStack(alignment:.leading){Text(app.name);Text(app.id).font(.caption).foregroundStyle(.secondary)};Spacer();Button("Remove"){model.targets.removeAll{$0.id==app.id};model.saveTargets()}}}}.frame(height:min(180,Double(model.targets.count)*52+12))}
            VStack(alignment:.leading,spacing:7){
                HStack{Text("Resume delay");Spacer();Text(String(format:"%.1f seconds",model.resumeDelay)).monospacedDigit().foregroundStyle(.secondary)}
                Slider(value:$model.resumeDelay,in:0...30,step:0.5).onChange(of:model.resumeDelay){_ in model.saveConfiguration()}.accessibilityLabel("Resume delay in seconds")
                Text("Wait after the last watched app stops using its camera.").font(.caption).foregroundStyle(.secondary)
            }
            Text(model.status).font(.callout)
            if !model.error.isEmpty {Text(model.error).foregroundStyle(.orange).font(.caption);Button("Retry monitoring"){model.retryMonitoring()}}
            if model.ownsPause {Button("Keep Spotify paused"){model.cancelResume()}}
            Text("For web meetings, choose the browser. This watches all camera use in that browser, including previews. No video or audio is captured. macOS diagnostic changes may affect detection.").font(.caption).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)
        }.padding(22).frame(maxWidth:.infinity,alignment:.leading)}.preferredColorScheme(.dark)
    }
}
