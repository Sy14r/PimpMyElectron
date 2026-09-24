import AppKit
import WebKit

final class Client: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate {
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
        window.backgroundColor=NSColor(calibratedRed:0.066,green:0.074,blue:0.086,alpha:1);window.appearance=NSAppearance(named:.darkAqua)
        window.minSize=NSSize(width:920,height:650);window.contentView=web;window.delegate=self;window.center()
        let menu=NSMenu(),appItem=NSMenuItem();menu.addItem(appItem);let appMenu=NSMenu();appItem.submenu=appMenu
        appMenu.addItem(withTitle:"About PimpMyElectron",action:#selector(NSApplication.orderFrontStandardAboutPanel(_:)),keyEquivalent:"")
        appMenu.addItem(.separator());appMenu.addItem(withTitle:"Hide PimpMyElectron",action:#selector(NSApplication.hide(_:)),keyEquivalent:"h")
        appMenu.addItem(withTitle:"Quit PimpMyElectron",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        let edit=NSMenuItem();edit.title="Edit";menu.addItem(edit);let edits=NSMenu(title:"Edit");edit.submenu=edits
        for (title,selector,key) in [("Copy","copy:","c"),("Paste","paste:","v"),("Select All","selectAll:","a")] { edits.addItem(withTitle:title,action:NSSelectorFromString(selector),keyEquivalent:key) }
        NSApp.mainMenu=menu
        do { try startWorker(resources) } catch { showError("PME could not start its bundled runtime.",error.localizedDescription) }
        web.loadFileURL(uiURL.appendingPathComponent("index.html"),allowingReadAccessTo:uiURL)
        window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
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
    func reply(_ response:[String:Any]) {
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
        guard ["status","scan","select","launch","stop","show","add-app","import","data-folder"].contains(op) else {fail(id,"Unsupported client action");return}
        if op=="data-folder" {NSWorkspace.shared.open(dataURL);reply(["id":id,"ok":true]);return}
        var request:[String:Any]=["id":id,"op":op]
        for key in ["appId","modIds","installationPath","view"] {if let value=raw[key] {request[key]=value}}
        if op=="add-app" || op=="import" {
            let panel=NSOpenPanel();panel.canChooseDirectories=op=="import";panel.canChooseFiles=op=="add-app";panel.allowsMultipleSelection=false
            panel.treatsFilePackagesAsDirectories=false;panel.prompt=op=="import" ? "Import setup" : "Add app"
            panel.message=op=="import" ? "Choose your existing PimpMyElectron project folder. Settings stay on this Mac; no Slack account data is copied." : "Choose an installed official Slack application."
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
