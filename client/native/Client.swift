import AppKit
import Sparkle
import WebKit
import UniformTypeIdentifiers

// The full-size web view consumes mouse events even in the transparent title
// bar. Keep its reserved top strip native so dragging goes to the Window Server.
final class WindowDragRegion: NSView {
    override func acceptsFirstMouse(for event:NSEvent?) -> Bool { true }
    override func mouseDown(with event:NSEvent) { window?.performDrag(with:event) }
}

final class Client: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate, SPUUpdaterDelegate {
    lazy var updaterController=SPUStandardUpdaterController(startingUpdater:false,updaterDelegate:self,userDriverDelegate:nil)
    var installingUpdate=false
    var updateReady=false
    var nativeSequence = -1
    var nativeReplies=[Int:([String:Any])->Void]()
    var window:NSWindow!
    var web:WKWebView!
    var worker:Process?
    var input:FileHandle?
    var buffer=Data()
    let io=DispatchQueue(label:"pme.client.ipc")
    let dataURL=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/PimpMyElectron",isDirectory:true)
    var uiURL:URL!
    func applicationDidFinishLaunching(_ notification:Notification) {
        if let other=NSRunningApplication.runningApplications(withBundleIdentifier:"com.pimpmyElectron.client").first(where:{$0.processIdentifier != ProcessInfo.processInfo.processIdentifier}) { other.activate(options:[.activateAllWindows]);NSApp.terminate(nil);return }
        guard let resources=Bundle.main.resourceURL else { NSApp.terminate(nil);return }
        uiURL=resources.appendingPathComponent("ui",isDirectory:true)
        let config=WKWebViewConfiguration();config.userContentController.add(self,name:"pme")
        config.preferences.javaScriptCanOpenWindowsAutomatically=false
        web=WKWebView(frame:.zero,configuration:config);web.navigationDelegate=self;web.setValue(false,forKey:"drawsBackground")
        web.isInspectable=false
        window=NSWindow(contentRect:NSRect(x:0,y:0,width:1120,height:780),styleMask:[.titled,.closable,.miniaturizable,.resizable,.fullSizeContentView],backing:.buffered,defer:false)
        window.title="PimpMyElectron";window.titleVisibility = .hidden;window.titlebarAppearsTransparent=true;window.isReleasedWhenClosed=false
        window.isMovableByWindowBackground=true
        window.backgroundColor=NSColor(calibratedRed:0.066,green:0.074,blue:0.086,alpha:1);window.appearance=NSAppearance(named:.darkAqua)
        let content=NSView(),dragRegion=WindowDragRegion()
        web.translatesAutoresizingMaskIntoConstraints=false;dragRegion.translatesAutoresizingMaskIntoConstraints=false
        content.addSubview(web);content.addSubview(dragRegion)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo:content.leadingAnchor),web.trailingAnchor.constraint(equalTo:content.trailingAnchor),
            web.topAnchor.constraint(equalTo:content.topAnchor),web.bottomAnchor.constraint(equalTo:content.bottomAnchor),
            dragRegion.leadingAnchor.constraint(equalTo:content.leadingAnchor),dragRegion.trailingAnchor.constraint(equalTo:content.trailingAnchor),
            dragRegion.topAnchor.constraint(equalTo:content.topAnchor),dragRegion.heightAnchor.constraint(equalToConstant:28)
        ])
        window.minSize=NSSize(width:920,height:650);window.contentView=content;window.delegate=self;window.center()
        let menu=NSMenu(),appItem=NSMenuItem();menu.addItem(appItem);let appMenu=NSMenu();appItem.submenu=appMenu
        appMenu.addItem(withTitle:"About PimpMyElectron",action:#selector(NSApplication.orderFrontStandardAboutPanel(_:)),keyEquivalent:"")
        let check=appMenu.addItem(withTitle:"Check for Updates…",action:#selector(SPUStandardUpdaterController.checkForUpdates(_:)),keyEquivalent:"")
        check.target=updaterController
        let automatic=appMenu.addItem(withTitle:"Check for updates automatically",action:#selector(toggleUpdateChecks(_:)),keyEquivalent:"")
        automatic.target=self;automatic.state=updaterController.updater.automaticallyChecksForUpdates ? .on:.off
        appMenu.addItem(.separator());appMenu.addItem(withTitle:"Hide PimpMyElectron",action:#selector(NSApplication.hide(_:)),keyEquivalent:"h")
        appMenu.addItem(withTitle:"Quit PimpMyElectron",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        let edit=NSMenuItem();edit.title="Edit";menu.addItem(edit);let edits=NSMenu(title:"Edit");edit.submenu=edits
        for (title,selector,key) in [("Copy","copy:","c"),("Paste","paste:","v"),("Select All","selectAll:","a")] { edits.addItem(withTitle:title,action:NSSelectorFromString(selector),keyEquivalent:key) }
        NSApp.mainMenu=menu
        do { try recordLocation();try startWorker(resources) } catch { showError("PME could not start its bundled runtime.",error.localizedDescription) }
        // Finish update recovery before the page sends its initial scan. Both
        // are runtime mutations; overlapping them can reject that first scan.
        nativeRequest("update-finish"){[weak self] _ in
            guard let self else{return}
            self.web.loadFileURL(self.uiURL.appendingPathComponent("index.html"),allowingReadAccessTo:self.uiURL)
        }
        updaterController.startUpdater()
        window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
    }
    func recordLocation() throws {
        try FileManager.default.createDirectory(at:dataURL,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        let bytes=try JSONSerialization.data(withJSONObject:["path":Bundle.main.bundleURL.path]);let file=dataURL.appendingPathComponent("client-location.json")
        try bytes.write(to:file,options:.atomic);try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
    }
    func shortcutProfile(_ id:String)throws->[String:Any] {
        guard UUID(uuidString:id) != nil else{throw NSError(domain:"PME",code:1,userInfo:[NSLocalizedDescriptionKey:"Invalid shortcut"])}
        let data=try Data(contentsOf:dataURL.appendingPathComponent("shortcuts/\(id).json"))
        guard let profile=try JSONSerialization.jsonObject(with:data) as? [String:Any],profile["id"] as? String==id else{throw NSError(domain:"PME",code:1,userInfo:[NSLocalizedDescriptionKey:"Invalid shortcut profile"])};return profile
    }
    func shortcutURL(_ id:String,allowMissing:Bool=false)throws->URL? {
        let profile=try shortcutProfile(id)
        guard let path=profile["shortcutPath"] as? String else{throw NSError(domain:"PME",code:1,userInfo:[NSLocalizedDescriptionKey:"Missing shortcut location"])}
        let url=URL(fileURLWithPath:path)
        do {_ = try FileManager.default.attributesOfItem(atPath:path)}catch {
            let failure=error as NSError
            if allowMissing && failure.domain==NSCocoaErrorDomain && [NSFileReadNoSuchFileError,NSFileNoSuchFileError].contains(failure.code) {return nil}
            throw error
        }
        let p=Process(),pipe=Pipe();p.executableURL=URL(fileURLWithPath:"/usr/bin/xattr");p.arguments=["-p","com.pimpmyElectron.launch-profile",path];p.standardOutput=pipe;p.standardError=FileHandle.nullDevice
        try p.run();let result=pipe.fileHandleForReading.readDataToEndOfFile();p.waitUntilExit()
        guard p.terminationStatus==0,String(data:result,encoding:.utf8)?.trimmingCharacters(in:.whitespacesAndNewlines)==id else{throw NSError(domain:"PME",code:1,userInfo:[NSLocalizedDescriptionKey:"Shortcut not found at its saved location. If you moved it, launch it once to update its location."])};return url
    }
    func startWorker(_ resources:URL) throws {
        try FileManager.default.createDirectory(at:dataURL,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        let process=Process(),stdin=Pipe(),stdout=Pipe()
        process.executableURL=resources.appendingPathComponent("bin/node")
        process.arguments=[resources.appendingPathComponent("runtime/client/service.mjs").path]
        var env=ProcessInfo.processInfo.environment
        for key in Array(env.keys) where key.hasPrefix("DYLD_") || ["NODE_OPTIONS","NODE_PATH","ELECTRON_RUN_AS_NODE"].contains(key) { env.removeValue(forKey:key) }
        env["PME_HELPER_PATH"]=resources.appendingPathComponent("runtime/bin/SlackTriage").path;process.environment=env
        process.standardInput=stdin;process.standardOutput=stdout
        let log=dataURL.appendingPathComponent("client.log");FileManager.default.createFile(atPath:log.path,contents:nil,attributes:[.posixPermissions:0o600]);process.standardError=try FileHandle(forWritingTo:log)
        stdout.fileHandleForReading.readabilityHandler={ [weak self] handle in
            let chunk=handle.availableData
            guard !chunk.isEmpty else {handle.readabilityHandler=nil;return}
            self?.io.async { [weak self] in
                guard let self else{return};self.buffer.append(chunk)
                if self.buffer.count>2*1024*1024 { self.buffer.removeAll();return }
                while let newline=self.buffer.firstIndex(of:10) {
                    let line=Data(self.buffer.prefix(upTo:newline));self.buffer.removeSubrange(...newline)
                    if let response=(try? JSONSerialization.jsonObject(with:line)) as? [String:Any] { DispatchQueue.main.async { self.reply(response) } }
                }
            }
        }
        process.terminationHandler={ [weak self] _ in DispatchQueue.main.async { self?.input=nil } }
        try process.run();input=stdin.fileHandleForWriting;worker=process
    }
    func nativeRequest(_ op:String,completion:@escaping([String:Any])->Void){
        let id=nativeSequence;nativeSequence-=1;nativeReplies[id]=completion
        send(["id":id,"op":op])
        DispatchQueue.main.asyncAfter(deadline:.now()+15){[weak self] in
            self?.nativeReplies.removeValue(forKey:id)?(["ok":false,"error":"The update readiness check timed out. Please reopen PME and retry."])
        }
    }
    @objc func toggleUpdateChecks(_ sender:NSMenuItem){
        let updater=updaterController.updater
        updater.automaticallyChecksForUpdates.toggle();sender.state=updater.automaticallyChecksForUpdates ? .on:.off
    }
    func updater(_ updater:SPUUpdater,willInstallUpdate item:SUAppcastItem){installingUpdate=true}
    func updater(_ updater:SPUUpdater,didAbortWithError error:Error){
        installingUpdate=false;updateReady=false;nativeRequest("update-cancel"){_ in}
    }
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply {
        guard installingUpdate,!updateReady else{return .terminateNow}
        nativeRequest("update-prepare"){[weak self] response in
            guard let self else{return}
            let ready=response["ok"] as? Bool == true
            self.updateReady=ready;sender.reply(toApplicationShouldTerminate:ready)
            if !ready {self.showError("Finish your mod sessions before updating",response["error"] as? String ?? "Could not verify that PME is ready to update.")}
        }
        return .terminateLater
    }
    func reply(_ response:[String:Any]) {
        if let id=response["id"] as? Int,let completion=nativeReplies.removeValue(forKey:id){completion(response);return}
        web.callAsyncJavaScript("window.pmeReceive(response)",arguments:["response":response],in:nil,in:.page,completionHandler:nil)
    }
    func fail(_ id:Int,_ message:String){reply(["id":id,"ok":false,"error":message])}
    func send(_ request:[String:Any]) {
        guard let input,let bytes=try? JSONSerialization.data(withJSONObject:request),bytes.count<32768 else {if let id=request["id"] as? Int {fail(id,"The client runtime is unavailable. Quit and reopen PME.")};return}
        do { try input.write(contentsOf:bytes+Data([10])) } catch { if let id=request["id"] as? Int {fail(id,"Could not reach the client runtime.")} }
    }
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage) {
        guard message.frameInfo.isMainFrame,message.frameInfo.request.url?.standardizedFileURL==uiURL.appendingPathComponent("index.html").standardizedFileURL,
              let raw=message.body as? [String:Any],let id=raw["id"] as? Int,let op=raw["op"] as? String else{return}
        guard ["license-open","source-open","feedback-copy","feedback-open","feedback-submit","release-history","status","scan","select","launch","stop","show","add-app","import","data-folder","shortcut-create","shortcut-update","shortcut-rename","shortcut-remove","shortcut-reveal","shortcut-forget","update-check"].contains(op) else {fail(id,"Unsupported client action");return}
        if op=="license-open" || op=="source-open" {
            // These destinations are fixed; web content cannot supply a path or URL.
            let destination = op=="license-open" ? Bundle.main.resourceURL?.appendingPathComponent("LICENSE.txt") : URL(string:"https://github.com/Sy14r/PimpMyElectron")
            guard let destination,NSWorkspace.shared.open(destination) else {fail(id,"Could not open the license or source location.");return}
            reply(["id":id,"ok":true]);return
        }
        if op=="feedback-submit" {
            guard let title=raw["title"] as? String, let body=raw["body"] as? String, let requestId=raw["requestId"] as? String,
                  !title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,title.count<=120,body.count<=6000,requestId.count<=60 else {fail(id,"Invalid feedback report.");return}
            send(["id":id,"op":op,"title":title,"body":body,"requestId":requestId]);return
        }
        if op=="feedback-copy" || op=="feedback-open" {
            guard let title=raw["title"] as? String,let body=raw["body"] as? String,
                  !title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,title.count<=120,body.count<=6000 else {fail(id,"The feedback report is too long.");return}
            if op=="feedback-copy" {
                NSPasteboard.general.clearContents();NSPasteboard.general.setString(title+"\n\n"+body,forType:.string)
                reply(["id":id,"ok":true]);return
            }
            // Fixed destination; the web view cannot use this bridge to open an
            // arbitrary URL. The reviewed report becomes an unsubmitted draft.
            var url=URLComponents(string:"https://github.com/Sy14r/PimpMyElectron/issues/new")!
            url.queryItems=[URLQueryItem(name:"title",value:title),URLQueryItem(name:"body",value:body)]
            guard let destination=url.url,destination.absoluteString.utf8.count<=16000 else {fail(id,"This report is too long for a browser draft. Use Copy report instead.");return}
            guard NSWorkspace.shared.open(destination) else {fail(id,"Could not open your browser. Use Copy report instead.");return}
            reply(["id":id,"ok":true]);return
        }
        if op=="update-check" {updaterController.checkForUpdates(nil);reply(["id":id,"ok":true]);return}
        if op=="data-folder" {NSWorkspace.shared.open(dataURL);reply(["id":id,"ok":true]);return}
        var request:[String:Any]=["id":id,"op":op]
        for key in ["appId","modIds","installationPath","view","profileId"] {if let value=raw[key] {request[key]=value}}
        if op=="shortcut-create" || op=="shortcut-rename" {
            let panel=NSSavePanel();panel.allowedContentTypes=[.applicationBundle];panel.canCreateDirectories=true
            panel.nameFieldStringValue=raw["appId"] as? String == "spotify" ? "Spotify — PME.app" : "Slack — PME.app";panel.prompt=op=="shortcut-create" ? "Create shortcut" : "Rename"
            panel.message="Launch with this saved mod selection without opening the PME window. Keep PME installed."
            let applications=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications")
            try? FileManager.default.createDirectory(at:applications,withIntermediateDirectories:true)
            panel.directoryURL=applications
            var old:URL?
            if op=="shortcut-rename" {do {guard let profileID=raw["profileId"] as? String else{return};old=try shortcutURL(profileID);panel.directoryURL=old!.deletingLastPathComponent();panel.nameFieldStringValue=old!.lastPathComponent}catch{fail(id,error.localizedDescription);return}}
            panel.beginSheetModal(for:window){[weak self] result in
                guard let self else{return};guard result == .OK,let url=panel.url else{self.reply(["id":id,"ok":true]);return}
                if let old {do {if old != url {try FileManager.default.moveItem(at:old,to:url)};request["op"]="shortcut-location"}catch{self.fail(id,error.localizedDescription);return}}
                request["path"]=url.path;self.send(request)
            };return
        }
        if op=="shortcut-reveal" || op=="shortcut-remove" {
            do {guard let profileID=raw["profileId"] as? String else{return}
                guard let url=try shortcutURL(profileID,allowMissing:op=="shortcut-remove") else {request["op"]="shortcut-forget";send(request);return}
                if op=="shortcut-reveal" {NSWorkspace.shared.activateFileViewerSelecting([url]);reply(["id":id,"ok":true]);return}
                NSWorkspace.shared.recycle([url]){[weak self] _,error in DispatchQueue.main.async {guard let self else{return};if let error {self.fail(id,error.localizedDescription)}else{request["op"]="shortcut-forget";self.send(request)}}};return
            }catch{fail(id,error.localizedDescription);return}
        }
        if op=="add-app" || op=="import" {
            let panel=NSOpenPanel();panel.canChooseDirectories=op=="import";panel.canChooseFiles=op=="add-app";panel.allowsMultipleSelection=false
            panel.treatsFilePackagesAsDirectories=false;panel.prompt=op=="import" ? "Import setup" : "Add app"
            panel.message=op=="import" ? "Choose your existing PimpMyElectron project folder. Settings stay on this Mac; no Slack account data is copied." : "Choose an installed official Slack or Spotify application."
            panel.directoryURL=op=="import" ? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Projects") : URL(fileURLWithPath:"/Applications")
            panel.beginSheetModal(for:window){ [weak self] result in
                guard let self else{return};if result == .OK,let url=panel.url {request["path"]=url.path;self.send(request)}else{self.reply(["id":id,"ok":true])}
            };return
        }
        send(request)
    }
    func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
        let url=navigationAction.request.url?.standardizedFileURL
        decisionHandler(url==uiURL.appendingPathComponent("index.html").standardizedFileURL ? .allow:.cancel)
    }
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool {window.makeKeyAndOrderFront(nil);return true}
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool {false}
    func applicationWillTerminate(_ notification:Notification){try? input?.close();worker?.terminate()}
    func showError(_ title:String,_ detail:String){let a=NSAlert();a.messageText=title;a.informativeText=detail;a.runModal()}
}
let app=NSApplication.shared,delegate=Client();app.delegate=delegate;app.setActivationPolicy(.regular);app.run()
