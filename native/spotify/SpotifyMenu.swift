import AppKit
import SwiftUI
import Combine
import Security
import CoreServices
import Darwin

// Native playback uses Apple Events. Mini Library uses the narrow inherited-pipe
// bridge; the menu process never receives Spotify session credentials.
final class Player: ObservableObject {
    let library=MiniLibrary()
    let preferences=PlayerPreferences()
    @Published var atmosphere:ArtworkAtmosphere?
    @Published var settingsOpen=false
    @Published var title="Your music, a hover away"
    @Published var artist="Open Spotify and choose something to play."
    @Published var album=""
    @Published var playing=false
    @Published var shuffle=false
    @Published var repeatMode=0
    @Published var modesReady=false
    @Published var canShuffle=false
    @Published var canRepeatContext=false
    @Published var canRepeatTrack=false
    var nextRepeat:Int {
        let allowed=[0]+(canRepeatContext ? [1]:[])+(canRepeatTrack ? [2]:[])
        guard let index=allowed.firstIndex(of:repeatMode) else{return allowed.count>1 ? allowed[1]:0}
        return allowed[(index+1)%allowed.count]
    }
    var repeatName:String {repeatMode==1 ? "Repeat album or playlist":repeatMode==2 ? "Repeat one track":"Repeat off"}
    var nextRepeatName:String {nextRepeat==1 ? "Repeat album or playlist":nextRepeat==2 ? "Repeat one track":"Turn repeat off"}
    @Published var duration=0.0
    @Published var position=0.0
    @Published var artwork:NSImage?
    @Published var error=""
    @Published var ready=false
    @Published var working=false
    @Published var needsPermission=false
    var action:((String)->Void)?
}
struct PlayerWidget: View {
    @ObservedObject var model:Player
    @ObservedObject var library:MiniLibrary
    @ObservedObject var preferences:PlayerPreferences
    @ObservedObject var presentation:PlayerPresentation
    init(model:Player){self.model=model;library=model.library;preferences=model.preferences;presentation=model.library.presentation}
    var expansion:Double {presentation.layout.expansion}
    var green:Color {model.atmosphere.map{Color(nsColor:$0.accent)} ?? Color(red:0.30,green:0.88,blue:0.52)}
    func time(_ value:Double)->String {let n=max(0,Int(value.isFinite ? value : 0));return "\(n/60):\(String(format:"%02d",n%60))"}
    func modeIcon(_ name:String,active:Bool)->some View {
        ZStack {Image(systemName:name).font(.system(size:17));if active {Circle().frame(width:3,height:3).offset(y:14)}}.frame(width:30,height:38).foregroundStyle(active ? green:Color.secondary)
    }
    var body: some View {
        VStack(alignment:.leading,spacing:14-6*expansion) {
            HStack(spacing:7) {
                Circle().fill(model.playing ? green : Color.gray).frame(width:6,height:6)
                Text(model.playing ? "NOW PLAYING" : "SPOTIFY").font(.system(size:10,weight:.bold,design:.rounded)).tracking(1.5).foregroundStyle(Color.white.opacity(0.68))
                Spacer()
                Button {library.pinned.toggle()} label:{Image(systemName:"pin").foregroundStyle(library.pinned ? green:Color.secondary)}.buttonStyle(.plain).help("Keep player open")
                Button {model.settingsOpen.toggle()} label:{Image(systemName:"gearshape").font(.system(size:13))}
                    .buttonStyle(.plain).help("Mini player settings").accessibilityLabel("Mini player settings")
                    .popover(isPresented:$model.settingsOpen,arrowEdge:.top){PlayerSettings(preferences:preferences)}
                Button {model.action?("open")} label:{Image(systemName:"arrow.up.forward.app").font(.system(size:13))}.buttonStyle(.plain).help("Open Spotify").accessibilityLabel("Open Spotify")
                Button {model.action?("close")} label:{Image(systemName:"xmark").font(.system(size:11))}.buttonStyle(.plain).help("Close player").accessibilityLabel("Close player")
            }
            PlayerTrackHeader(model:model,expansion:expansion)
            if !model.error.isEmpty {
                Text(model.error).font(.system(size:11)).foregroundStyle(Color(red:1,green:0.73,blue:0.51)).fixedSize(horizontal:false,vertical:true)
                Button(model.needsPermission ? "Allow Spotify control":"Try again") {model.action?("retry")}.font(.system(size:11)).buttonStyle(.plain).foregroundStyle(green)
            } else {
                VStack(spacing:5) {
                    GeometryReader {geometry in ZStack(alignment:.leading) {
                        Capsule().fill(Color.white.opacity(0.10))
                        Capsule().fill(green.opacity(0.85)).frame(width:geometry.size.width*min(1,max(0,model.duration>0 ? model.position/model.duration : 0)))
                    }}.frame(height:3)
                    HStack {Text(time(model.position));Spacer();Text(time(model.duration))}.font(.system(size:10,design:.monospaced)).foregroundStyle(.tertiary)
                }
            }
            HStack(spacing:20) {
                Spacer()
                Button {model.action?("shuffle")} label:{modeIcon("shuffle",active:model.shuffle)}.buttonStyle(.plain).disabled(!model.modesReady || !model.canShuffle).help(model.shuffle ? "Turn shuffle off":"Turn shuffle on").accessibilityLabel(model.shuffle ? "Shuffle on":"Shuffle off")
                Button {model.action?("previous")} label:{Image(systemName:"backward.end.fill").font(.system(size:20)).frame(width:34,height:38)}.buttonStyle(.plain).help("Previous track").accessibilityLabel("Previous track")
                Button {model.action?("playpause")} label:{Image(systemName:model.playing ? "pause.fill":"play.fill").font(.system(size:19,weight:.semibold)).foregroundStyle(Color.black.opacity(0.86)).frame(width:52,height:44).background(green,in:Capsule())}.buttonStyle(.plain).help(model.playing ? "Pause":"Play").accessibilityLabel(model.playing ? "Pause":"Play")
                Button {model.action?("next")} label:{Image(systemName:"forward.end.fill").font(.system(size:20)).frame(width:34,height:38)}.buttonStyle(.plain).help("Next track").accessibilityLabel("Next track")
                Button {model.action?("repeat")} label:{modeIcon(model.repeatMode==2 ? "repeat.1":"repeat",active:model.repeatMode != 0)}.buttonStyle(.plain).disabled(!model.modesReady || !(model.canRepeatContext || model.canRepeatTrack)).help(model.nextRepeatName).accessibilityLabel(model.repeatName)
                Spacer()
            }.disabled(!model.ready || model.working)
            LibraryPanel(model:library)
        }.padding(16).frame(width:400,height:presentation.layout.height,alignment:.top).clipped().preferredColorScheme(.dark)
    }
}
// Fixed text metrics and artwork bounds avoid rewrapping/re-rasterizing the
// header at every intermediate width. Only its position and cover scale move.
struct PlayerTrackHeader:View {
    @ObservedObject var model:Player
    let expansion:Double
    var coverSize:Double {86-38*expansion}
    var rowHeight:Double {86-16*expansion}
    var textScale:Double {1-0.06*expansion}
    var body:some View {
        ZStack(alignment:.topLeading) {
            ZStack {
                RoundedRectangle(cornerRadius:12).fill(Color.white.opacity(0.07))
                if let image=model.artwork {Image(nsImage:image).resizable().scaledToFill()}
                else {Image(systemName:"music.note").font(.system(size:28,weight:.medium)).foregroundStyle(.secondary)}
            }.frame(width:86,height:86).clipShape(RoundedRectangle(cornerRadius:12))
                .scaleEffect(coverSize/86,anchor:.topLeading).offset(y:(rowHeight-coverSize)/2)
            VStack(alignment:.leading,spacing:3) {
                Text(model.title).font(.system(size:15,weight:.semibold)).lineLimit(2).fixedSize(horizontal:false,vertical:true)
                Text(model.artist).font(.system(size:12)).foregroundStyle(Color.white.opacity(0.78)).lineLimit(1)
                Text(model.album).font(.system(size:11)).foregroundStyle(Color.white.opacity(0.57)).lineLimit(1)
            }.frame(width:267,height:70,alignment:.leading)
                .scaleEffect(textScale,anchor:.topLeading).offset(x:101-38*expansion,y:(rowHeight-70*textScale)/2)
        }.frame(maxWidth:.infinity,alignment:.leading).frame(height:rowHeight).accessibilityElement(children:.combine)
    }
}
struct PlayerFrameBackground:View {
    @ObservedObject var model:Player
    @ObservedObject var library:MiniLibrary
    @ObservedObject var preferences:PlayerPreferences
    @ObservedObject var presentation:PlayerPresentation
    init(model:Player){self.model=model;library=model.library;preferences=model.preferences;presentation=model.library.presentation}
    var body:some View {
        GeometryReader{geometry in
            Color(red:0.075,green:0.09,blue:0.105).overlay(alignment:.top){
                ArtworkBackground(atmosphere:model.atmosphere,treatment:preferences.treatment)
                    .frame(height:model.error.isEmpty ? 298:368)
                    .frame(height:(model.error.isEmpty ? 298.0:368.0)*(1-presentation.layout.expansion)+276*presentation.layout.expansion,alignment:.top).clipped()
            }
        }.allowsHitTesting(false)
    }
}
final class FrameArtworkHost:NSHostingView<PlayerFrameBackground> {
    override func hitTest(_ point:NSPoint)->NSView? {nil}
}
final class HoverHost: NSHostingView<PlayerWidget> {
    private var artworkBackground:FrameArtworkHost?
    override func viewDidMoveToWindow(){
        super.viewDidMoveToWindow()
        guard window != nil,let frameView=superview else{return}
        if artworkBackground?.superview !== frameView {
            artworkBackground?.removeFromSuperview()
            let background=FrameArtworkHost(rootView:PlayerFrameBackground(model:rootView.model))
            background.frame=frameView.bounds;background.autoresizingMask=[.width,.height]
            frameView.addSubview(background,positioned:.below,relativeTo:self)
            artworkBackground=background
        }
    }
    override func acceptsFirstMouse(for event:NSEvent?)->Bool {true}
}
final class ArtworkLoader:NSObject,URLSessionDataDelegate {
    static let cache:NSCache<NSString,NSImage> = {let cache=NSCache<NSString,NSImage>();cache.countLimit=96;cache.totalCostLimit=24*1024*1024;return cache}()
    var task:URLSessionDataTask?;var session:URLSession?;var bytes=Data();var key=""
    var loaded:((String,NSImage?)->Void)?
    static func allowed(_ url:URL)->Bool {url.scheme=="https" && ["i.scdn.co","pickasso.spotifycdn.com","mosaic.scdn.co","image-cdn-ak.spotifycdn.com","image-cdn-fa.spotifycdn.com"].contains(url.host ?? "") && url.user==nil && url.password==nil && (url.port==nil || url.port==443)}
    func load(_ value:String) {
        guard value != key else{return};task?.cancel();session?.invalidateAndCancel();key=value;bytes=Data()
        guard let url=URL(string:value),Self.allowed(url) else{loaded?(value,nil);return}
        if let image=Self.cache.object(forKey:value as NSString) {loaded?(value,image);return}
        let config=URLSessionConfiguration.ephemeral;config.timeoutIntervalForRequest=8;config.urlCache=nil;config.httpCookieStorage=nil
        let session=URLSession(configuration:config,delegate:self,delegateQueue:.main);self.session=session
        let task=session.dataTask(with:url);self.task=task;task.resume()
    }
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void) {completionHandler(request.url.map(Self.allowed)==true ? request:nil)}
    func urlSession(_ session:URLSession,dataTask:URLSessionDataTask,didReceive response:URLResponse,completionHandler:@escaping(URLSession.ResponseDisposition)->Void) {
        guard dataTask===task,(response as? HTTPURLResponse)?.statusCode==200,response.expectedContentLength<=4*1024*1024,response.mimeType?.hasPrefix("image/")==true else{completionHandler(.cancel);return};completionHandler(.allow)
    }
    func urlSession(_ session:URLSession,dataTask:URLSessionDataTask,didReceive data:Data) {guard dataTask===task else{return};if bytes.count+data.count>4*1024*1024 {dataTask.cancel();return};bytes.append(data)}
    func urlSession(_ session:URLSession,task:URLSessionTask,didCompleteWithError error:Error?) {guard task===self.task else{return};let image=error==nil ? NSImage(data:bytes):nil;if let image {Self.cache.setObject(image,forKey:key as NSString,cost:max(bytes.count,Int(image.size.width*image.size.height*4)))};loaded?(key,image);session.finishTasksAndInvalidate()}
}
final class SpotifyMenu:NSObject,NSApplicationDelegate {
    let model=Player(),popover=NSPopover(),art=ArtworkLoader()
    var item:NSStatusItem!,poll:Timer?,hoverTimer:Timer?,iconHoverTimer:Timer?,outsideSince:Date?,socketPath="",spotifyPath="",server:Int32 = -1
    let scripts=DispatchQueue(label:"pme.spotify.apple-events")
    var modesQuerying=false,modesGeneration=0
    var querying=false,permissionDenied=false,trackedPID:pid_t=0,verifiedRunning=false
    var trackKey="",ownsSocket=false,waitingForEntry=false,pointerWasOverIcon=false
    var clickMonitor:Any?,keyMonitor:Any?
    var sizing:AnyCancellable?
    var layoutTimer:Timer?
    var layoutTarget:PlayerLayout?
    var automationEntitled:Bool {
        guard let task=SecTaskCreateFromSelf(nil) else{return false}
        return (SecTaskCopyValueForEntitlement(task,"com.apple.security.automation.apple-events" as CFString,nil) as? Bool)==true
    }
    func applicationDidFinishLaunching(_ notification:Notification) {
        let args=CommandLine.arguments
        func argument(_ key:String)->String? {guard let n=args.firstIndex(of:key),n+1<args.count else{return nil};return args[n+1]}
        guard let dir=argument("--data-dir"),let appPath=argument("--spotify-app"),dir.hasPrefix("/"),appPath.hasPrefix("/"),official(URL(fileURLWithPath:appPath)) else{NSApp.terminate(nil);return}
        spotifyPath=appPath;socketPath=dir+"/control.sock";model.library.socketPath=dir+"/bridge.sock"
        fputs("Automation entitlement available at runtime: \(automationEntitled)\n",stderr)
        do {try FileManager.default.createDirectory(atPath:dir,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700]);try startServer()}catch{fputs("Spotify helper: \(error.localizedDescription)\n",stderr);NSApp.terminate(nil);return}
        item=NSStatusBar.system.statusItem(withLength:28)
        if let button=item.button {
            button.image=spotifyIcon();button.toolTip="Spotify · PME Menu Player";button.setAccessibilityLabel("Spotify Menu Player")
            button.target=self;button.action=#selector(toggle)
        }
        let host=HoverHost(rootView:PlayerWidget(model:model));let controller=NSViewController();controller.view=host
        popover.contentViewController=controller;popover.contentSize=NSSize(width:400,height:280);
        sizing=model.$error.sink{ [weak self] _ in DispatchQueue.main.async {self?.resizePlayer()} };popover.behavior = .applicationDefined;popover.animates=false;popover.appearance=NSAppearance(named:.darkAqua)
        model.library.changed={ [weak self] in guard let self else{return};self.resizePlayer();if self.model.library.expanded {NSApp.activate(ignoringOtherApps:true);self.popover.contentViewController?.view.window?.makeKey()};if self.layoutTimer==nil {self.refresh()} }
        model.action={ [weak self] action in self?.perform(action) }
        clickMonitor=NSEvent.addGlobalMonitorForEvents(matching:.leftMouseDown){ [weak self] _ in self?.close() }
        keyMonitor=NSEvent.addLocalMonitorForEvents(matching:.keyDown){ [weak self] event in if event.keyCode==53,self?.popover.isShown==true {if self?.model.settingsOpen==true {self?.model.settingsOpen=false;self?.outsideSince=nil}else if self?.model.library.closeDetail() != true {self?.close()};return nil};return event }
        art.loaded={ [weak self] key,image in guard let self,self.trackKey==key else{return};self.model.artwork=image
            if let image {AtmosphereRenderer.prepare(image,key:key){[weak self] result in guard let self,self.trackKey==key else{return};self.model.atmosphere=result}}else{self.model.atmosphere=nil}
        }
        NSWorkspace.shared.notificationCenter.addObserver(self,selector:#selector(workspaceChanged),name:NSWorkspace.didLaunchApplicationNotification,object:nil)
        NSWorkspace.shared.notificationCenter.addObserver(self,selector:#selector(workspaceChanged),name:NSWorkspace.didTerminateApplicationNotification,object:nil)
        // Status visibility uses workspace state; no Spotify calls while the widget is closed.
        refreshVisibility()
        poll=Timer.scheduledTimer(withTimeInterval:1,repeats:true){ [weak self] _ in guard let self else{return};self.refreshVisibility();if self.popover.isShown && self.layoutTimer==nil {self.refresh()} }
        // NSStatusBarButton tracking areas are unreliable on some macOS versions.
        // Reading pointer position needs no input-monitoring or Accessibility permission.
        iconHoverTimer=Timer(timeInterval:0.1,repeats:true){ [weak self] _ in self?.checkIconHover() }
        if let iconHoverTimer {RunLoop.main.add(iconHoverTimer,forMode:.common)}
        if !spotifyRunning {openSpotify(activate:false)}
    }
    var spotifyRunning:Bool {NSRunningApplication.runningApplications(withBundleIdentifier:"com.spotify.client").contains{!$0.isTerminated}}
    func official(_ url:URL)->Bool {
        guard Bundle(url:url)?.bundleIdentifier=="com.spotify.client" else{return false}
        var code:SecStaticCode?,requirement:SecRequirement?
        let rule="identifier \"com.spotify.client\" and anchor apple generic and certificate leaf[subject.OU] = \"2FNC3A47ZF\""
        guard SecStaticCodeCreateWithPath(url as CFURL,[],&code)==errSecSuccess,let code,SecRequirementCreateWithString(rule as CFString,[],&requirement)==errSecSuccess else{return false}
        return SecStaticCodeCheckValidity(code,SecCSFlags(rawValue:kSecCSStrictValidate),requirement)==errSecSuccess
    }
    @objc func workspaceChanged(_ notification:Notification) {refreshVisibility()}
    func refreshVisibility() {
        let running=NSRunningApplication.runningApplications(withBundleIdentifier:"com.spotify.client").first{!$0.isTerminated}
        if let running {
            if trackedPID != running.processIdentifier {trackedPID=running.processIdentifier;verifiedRunning=running.bundleURL.map(official) ?? false}
            item.isVisible=true
        }else{trackedPID=0;verifiedRunning=false;item.isVisible=false;close();model.ready=false}
    }
    func spotifyIcon()->NSImage {
        let image=NSImage(size:NSSize(width:18,height:18),flipped:false){ rect in
            NSColor.black.setFill();NSBezierPath(ovalIn:rect.insetBy(dx:0.5,dy:0.5)).fill()
            NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current?.compositingOperation = .destinationOut
            NSColor.black.setStroke()
            for (y,width) in [(11.4,10.5),(8.6,8.7),(6.0,6.8)] {
                let p=NSBezierPath();p.move(to:NSPoint(x:4,y:y));p.curve(to:NSPoint(x:4+width,y:y-1),controlPoint1:NSPoint(x:7,y:y+1.7),controlPoint2:NSPoint(x:11,y:y+1.2));p.lineWidth=1.4;p.lineCapStyle = .round;p.stroke()
            }
            NSGraphicsContext.restoreGraphicsState();return true
        };image.isTemplate=true;return image
    }
    func checkIconHover() {
        let bounds=item.button.flatMap{button in button.window?.convertToScreen(button.convert(button.bounds,to:nil))}
        let inside=item.isVisible && (bounds?.contains(NSEvent.mouseLocation) ?? false)
        let entered=inside && !pointerWasOverIcon
        pointerWasOverIcon=inside
        if entered && model.preferences.openOnHover {show()}
    }
    @objc func toggle() {popover.isShown ? close():show()}
    func show() {
        refreshVisibility();guard item.isVisible,let button=item.button else{return}
        if !popover.isShown {
            popover.show(relativeTo:button.bounds,of:button,preferredEdge:.minY)
            popover.contentViewController?.view.window?.title="Spotify Menu Player"
            outsideSince=nil
            hoverTimer?.invalidate();hoverTimer=Timer.scheduledTimer(withTimeInterval:0.05,repeats:true){ [weak self] _ in self?.checkHover() }
        }
        refresh()
    }
    func resizePlayer(animated:Bool=true){
        let start=model.library.presentation.layout
        let target=PlayerLayout(height:model.library.expanded ? 640:(model.error.isEmpty ? 280:350),expansion:model.library.expanded ? 1:0)
        if animated,layoutTimer != nil,layoutTarget==target {return}
        layoutTimer?.invalidate();layoutTimer=nil;layoutTarget=target
        guard start.height != target.height || start.expansion != target.expansion else{return}
        func apply(_ layout:PlayerLayout){
            // AppKit auto-animation is disabled: intermediate contentSize
            // assignments must not start another animation behind this driver.
            self.model.library.presentation.layout=layout
            self.popover.contentSize=NSSize(width:400,height:layout.height)
        }
        guard animated,popover.isShown,!NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else{apply(target);return}
        let began=ProcessInfo.processInfo.systemUptime,duration=0.24
        let timer=Timer(timeInterval:1.0/60,repeats:true){[weak self] timer in
            guard let self else{timer.invalidate();return}
            let t=min(1,(ProcessInfo.processInfo.systemUptime-began)/duration)
            let eased=t*t*(3-2*t)
            apply(PlayerLayout(height:start.height+(target.height-start.height)*eased,expansion:start.expansion+(target.expansion-start.expansion)*eased))
            if t>=1 {timer.invalidate();self.layoutTimer=nil}
        }
        layoutTimer=timer;RunLoop.main.add(timer,forMode:.common)
    }
    func checkHover() {
        if !model.preferences.openOnHover || model.library.expanded || model.library.pinned || model.settingsOpen {outsideSince=nil;return}
        let point=NSEvent.mouseLocation
        let buttonRect=item.button.flatMap{button in button.window?.convertToScreen(button.convert(button.bounds,to:nil))}
        let inside=(buttonRect?.insetBy(dx:-4,dy:-4).contains(point) ?? false)||(popover.contentViewController?.view.window?.frame.insetBy(dx:-4,dy:-4).contains(point) ?? false)
        if inside {outsideSince=nil;waitingForEntry=false}else if waitingForEntry {return}else if let since=outsideSince {if Date().timeIntervalSince(since)>=model.preferences.dismissalDelay {close()}}else{outsideSince=Date()}
    }
    func presentPlayer(){show();waitingForEntry=true;NSApp.activate(ignoringOtherApps:true);popover.contentViewController?.view.window?.makeKey()}
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool {presentPlayer();return true}
    func close(){model.settingsOpen=false;model.library.expanded=false;model.library.collection=nil;model.library.generation+=1;model.library.queryTask?.cancel();resizePlayer(animated:false);waitingForEntry=false;popover.performClose(nil);hoverTimer?.invalidate();hoverTimer=nil;outsideSince=nil}
    func openSpotify(activate:Bool) {
        let config=NSWorkspace.OpenConfiguration();config.activates=activate
        NSWorkspace.shared.openApplication(at:URL(fileURLWithPath:spotifyPath),configuration:config){ [weak self] _,error in DispatchQueue.main.async {if let error {self?.model.error=error.localizedDescription};self?.refreshVisibility()} }
    }
    func perform(_ action:String) {
        if action=="close" {close();return};if action=="open" {openSpotify(activate:true);return}
        if action=="retry" {
            guard !querying,!model.working else{return}
            permissionDenied=false;refresh();return
        }
        if action=="shuffle" || action=="repeat" {changeMode(action);return}
        guard model.ready,!model.working,verifiedRunning,let command=["playpause":"playpause","previous":"previous track","next":"next track"][action] else{return}
        model.working=true
        scripts.async { [weak self] in
            var error:NSDictionary?;NSAppleScript(source:"with timeout of 3 seconds\ntell application id \"com.spotify.client\" to \(command)\nend timeout")?.executeAndReturnError(&error)
            let detail=error?[NSAppleScript.errorMessage] as? String
            DispatchQueue.main.async {guard let self else{return};self.model.working=false;if let detail {self.model.error=detail}else{self.refresh()}}
        }
    }
    func refreshModes() {
        guard !modesQuerying,!model.working,verifiedRunning else{return}
        modesQuerying=true;let ticket=modesGeneration
        model.library.send(["op":"playback-modes"]){[weak self] result in
            guard let self else{return};self.modesQuerying=false;guard ticket==self.modesGeneration else{return}
            switch result {
            case .success(let state):self.model.shuffle=state["shuffle"] as? Bool ?? false;self.model.repeatMode=state["repeat"] as? Int ?? 0;self.model.canShuffle=state["canShuffle"] as? Bool ?? false;self.model.canRepeatContext=state["canRepeatContext"] as? Bool ?? false;self.model.canRepeatTrack=state["canRepeatTrack"] as? Bool ?? false;self.model.modesReady=true
            case .failure:self.model.modesReady=false
            }
        }
    }
    func changeMode(_ action:String) {
        guard model.modesReady,!model.working,verifiedRunning else{return}
        let request:[String:Any]
        if action=="shuffle" {guard model.canShuffle else{return};request=["op":"shuffle","enabled":!model.shuffle]}
        else {guard model.canRepeatContext || model.canRepeatTrack else{return};request=["op":"repeat","mode":model.nextRepeat]}
        modesGeneration+=1;model.working=true
        model.library.send(request){[weak self] result in
            guard let self else{return};self.model.working=false
            if case .failure(let error)=result {self.model.error=error.localizedDescription}
            self.refreshModes()
        }
    }
    func refresh() {
        refreshModes()
        guard !querying,!permissionDenied,verifiedRunning else{return};querying=true
        scripts.async { [weak self] in
            let source="""
            with timeout of 3 seconds
                tell application id "com.spotify.client"
                    set s to player state as string
                    if s is "stopped" then return {s, "", "", "", 0, 0, ""}
                    set t to current track
                    return {s, name of t, artist of t, album of t, duration of t, player position, artwork url of t}
                end tell
            end timeout
            """
            var error:NSDictionary?;let result=NSAppleScript(source:source)?.executeAndReturnError(&error)
            let code=error?[NSAppleScript.errorNumber] as? Int,detail=error?[NSAppleScript.errorMessage] as? String
            let values=(1...7).map {result?.atIndex($0)?.stringValue ?? ""}
            DispatchQueue.main.async {guard let self else{return};self.querying=false
                if let code {
                    self.model.ready=false
                    if code == -1743 {self.permissionDenied=true;self.model.needsPermission=true;self.model.error="Allow PimpMyElectron to control Spotify in System Settings → Privacy & Security → Automation, then try again."}
                    else {self.model.error=detail ?? "Spotify hasn’t provided playback details yet. Try again."};return
                }
                self.model.error="";self.model.needsPermission=false;self.model.ready=true;self.model.playing=values[0]=="playing"
                self.model.title=values[1].isEmpty ? "Nothing playing yet":values[1]
                self.model.artist=values[2].isEmpty ? "Choose a track in Spotify to get started.":values[2];self.model.album=values[3]
                // Despite the dictionary's description, Spotify reports track duration in milliseconds.
                self.model.duration=(Double(values[4]) ?? 0)/1000;self.model.position=Double(values[5]) ?? 0
                if self.trackKey != values[6] {self.trackKey=values[6];self.model.artwork=nil;self.model.atmosphere=nil;self.art.load(values[6])}
            }
        }
    }
    func startServer() throws {
        guard socketPath.utf8.count<104 else{throw NSError(domain:"PME",code:1)}
        server=Darwin.socket(AF_UNIX,SOCK_STREAM,0);guard server>=0 else{throw NSError(domain:NSPOSIXErrorDomain,code:Int(errno))}
        var address=sockaddr_un();address.sun_family=sa_family_t(AF_UNIX)
        withUnsafeMutableBytes(of:&address.sun_path){target in socketPath.withCString{source in _=strcpy(target.baseAddress!.assumingMemoryBound(to:CChar.self),source)}}
        func bindSocket()->Int32 {withUnsafePointer(to:&address){$0.withMemoryRebound(to:sockaddr.self,capacity:1){Darwin.bind(server,$0,socklen_t(MemoryLayout<sockaddr_un>.size))}}}
        if FileManager.default.fileExists(atPath:socketPath) {
            let probe=Darwin.socket(AF_UNIX,SOCK_STREAM,0)
            let connected=withUnsafePointer(to:&address){$0.withMemoryRebound(to:sockaddr.self,capacity:1){Darwin.connect(probe,$0,socklen_t(MemoryLayout<sockaddr_un>.size))}}
            let connectError=errno;Darwin.close(probe)
            guard connected != 0,connectError==ECONNREFUSED else{throw NSError(domain:"PME",code:2,userInfo:[NSLocalizedDescriptionKey:"A Spotify helper is already listening."])}
            var info=stat();guard lstat(socketPath,&info)==0,(info.st_mode & S_IFMT)==S_IFSOCK else{throw NSError(domain:"PME",code:3)};unlink(socketPath)
        }
        guard bindSocket()==0 else{throw NSError(domain:NSPOSIXErrorDomain,code:Int(errno))};ownsSocket=true;chmod(socketPath,0o600)
        guard Darwin.listen(server,8)==0 else{throw NSError(domain:NSPOSIXErrorDomain,code:Int(errno))}
        DispatchQueue.global(qos:.utility).async { [weak self] in
            guard let self else{return}
            while true {
                let client=Darwin.accept(self.server,nil,nil);if client<0 {break}
                var timeout=timeval(tv_sec:1,tv_usec:0),noSignal:Int32=1
                setsockopt(client,SOL_SOCKET,SO_RCVTIMEO,&timeout,socklen_t(MemoryLayout<timeval>.size));setsockopt(client,SOL_SOCKET,SO_SNDTIMEO,&timeout,socklen_t(MemoryLayout<timeval>.size));setsockopt(client,SOL_SOCKET,SO_NOSIGPIPE,&noSignal,socklen_t(MemoryLayout<Int32>.size))
                var bytes=Data(),buffer=[UInt8](repeating:0,count:1024)
                while bytes.count<4096 {let n=Darwin.read(client,&buffer,buffer.count);if n<=0 {break};bytes.append(contentsOf:buffer.prefix(n));if bytes.contains(10){break}}
                let request=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any]
                let done=DispatchSemaphore(value:0)
                DispatchQueue.main.async {
                    let op=request?["op"] as? String
                    var response:[String:Any]
                    switch op {
                    case "status":response=["ok":true,"result":["adapter":"spotify","running":true,"pid":getpid(),"appRunning":self.spotifyRunning,"appPath":self.spotifyPath,"automationEntitled":self.automationEntitled,"popoverShown":self.popover.isShown,"statusVisible":self.item.isVisible,"statusFrame":self.item.button?.window.map{NSStringFromRect($0.frame)} ?? "none","error":self.model.error]]
                    case "show":self.presentPlayer();response=["ok":true,"result":true]
                    case "stop":response=["ok":true,"result":true];DispatchQueue.main.asyncAfter(deadline:.now()+0.1){NSApp.terminate(nil)}
                    default:response=["ok":false,"error":"Unsupported Spotify helper action"]
                    }
                    if let data=try? JSONSerialization.data(withJSONObject:response){data.withUnsafeBytes{raw in _=Darwin.write(client,raw.baseAddress,raw.count)}}
                    Darwin.close(client);done.signal()
                }
                done.wait()
            }
        }
    }
    func applicationWillTerminate(_ notification:Notification){poll?.invalidate();hoverTimer?.invalidate();iconHoverTimer?.invalidate();layoutTimer?.invalidate();if server>=0 {Darwin.close(server);if ownsSocket {unlink(socketPath)}}}
}
let app=NSApplication.shared,delegate=SpotifyMenu();if CommandLine.arguments.contains("--check-signature"){print(delegate.automationEntitled ? "automation-entitled":"automation-missing");exit(delegate.automationEntitled ? 0:1)};app.delegate=delegate;app.setActivationPolicy(.accessory);app.run()
