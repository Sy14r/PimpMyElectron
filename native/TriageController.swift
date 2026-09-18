import AppKit
import Carbon.HIToolbox
import Darwin

// Menu and keyboard controller only. No Slack credentials or message rendering.
final class Controller: NSObject, NSApplicationDelegate, NSMenuDelegate {
    let socketPath: String
    var item: NSStatusItem!
    var hotKey: EventHotKeyRef?
    var handler: EventHandlerRef?
    var shortcut = ""
    var hotKeyOK = false
    var timer: Timer?
    var polling = false
    var trackingMenu = false
    var previousApp: NSRunningApplication?
    var spaceObserver: NSObjectProtocol?
    var slackPID: pid_t = 0
    var lastReturn = 0
    var settings: [String: Any] = [:]
    var workspaces: [[String: Any]] = []
    var displays: [[String: Any]] = []
    let queue = DispatchQueue(label: "triage.shell.socket")
    init(_ path: String) { socketPath = path }
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        spaceObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.previousApp = nil
        }
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.image = NSImage(systemSymbolName: "tray", accessibilityDescription: "Slack triage")
        item.button?.imagePosition = .imageLeading
        item.button?.toolTip = "Slack triage — local attention queue"
        var type = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, pointer in
            guard let pointer else { return OSStatus(eventNotHandledErr) }
            let controller = Unmanaged<Controller>.fromOpaque(pointer).takeUnretainedValue()
            var identifier = EventHotKeyID()
            guard GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &identifier) == noErr,
                  identifier.signature == 0x504D4554 else { return OSStatus(eventNotHandledErr) }
            DispatchQueue.main.async { controller.perform("toggle") }
            return noErr
        }, 1, &type, Unmanaged.passUnretained(self).toOpaque(), &handler)
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.refresh() }
    }
    func call(_ request: [String: Any], completion: @escaping ([String: Any]?) -> Void) {
        queue.async { [socketPath] in
            let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
            guard fd >= 0 else { DispatchQueue.main.async { completion(nil) }; return }
            defer { Darwin.close(fd) }
            var timeout = timeval(tv_sec: 3, tv_usec: 0)
            setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
            setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
            var noPipe: Int32 = 1; setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noPipe, socklen_t(MemoryLayout<Int32>.size))
            var address = sockaddr_un(); address.sun_family = sa_family_t(AF_UNIX)
            let pathBytes = Array(socketPath.utf8CString)
            guard pathBytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { DispatchQueue.main.async { completion(nil) }; return }
            withUnsafeMutableBytes(of: &address.sun_path) { bytes in pathBytes.withUnsafeBytes { bytes.copyBytes(from: $0) } }
            let connected = withUnsafePointer(to: &address) { pointer in pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) } }
            guard connected == 0, var payload = try? JSONSerialization.data(withJSONObject: request) else { DispatchQueue.main.async { completion(nil) }; return }
            payload.append(10)
            let sent = payload.withUnsafeBytes { buffer -> Bool in
                var offset = 0
                while offset < buffer.count { let count = Darwin.write(fd, buffer.baseAddress!.advanced(by: offset), buffer.count-offset); if count <= 0 { return false }; offset += count }
                return true
            }
            guard sent else { DispatchQueue.main.async { completion(nil) }; return }
            var data = Data(), bytes = [UInt8](repeating: 0, count: 4096)
            while data.count < 100000 {
                let count = Darwin.read(fd, &bytes, bytes.count); if count <= 0 { break }
                data.append(contentsOf: bytes.prefix(count)); if data.contains(10) { break }
            }
            let response = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let result = response?["ok"] as? Bool == true ? response?["result"] as? [String: Any] : nil
            DispatchQueue.main.async { completion(result) }
        }
    }
    func refresh() {
        guard !polling else { return }; polling = true
        call(["op": "state", "hotKeyOK": hotKeyOK]) { [weak self] state in
            guard let self else { return }; self.polling = false
            guard let state else { self.item.button?.title = "!"; self.item.button?.toolTip = "Triage controller disconnected — normal Slack remains available"; self.menu(connected: false); return }
            self.slackPID = pid_t(state["slackPID"] as? Int ?? 0)
            self.settings = state["settings"] as? [String: Any] ?? [:]
            self.workspaces = state["workspaces"] as? [[String: Any]] ?? []
            self.displays = state["displays"] as? [[String: Any]] ?? []
            let combination = self.settings["shortcut"] as? String ?? "cmd-shift-y"
            if combination != self.shortcut { self.register(combination) }
            let attention = state["attention"] as? Int ?? 0
            self.item.button?.title = attention > 0 ? " \(attention)" : ""
            self.item.button?.toolTip = self.hotKeyOK ? "Slack triage — \(attention) observed items need attention" : "Global shortcut unavailable; use this menu or choose another shortcut"
            let epoch = state["returnEpoch"] as? Int ?? 0
            if epoch != self.lastReturn {
                let advanced = epoch > self.lastReturn; self.lastReturn = epoch
                if advanced { self.returnFocus() }
            }
            self.menu(connected: true)
        }
    }
    func register(_ value: String) {
        let code = value == "cmd-shift-y" ? UInt32(kVK_ANSI_Y) : UInt32(kVK_Space)
        let modifiers = value == "cmd-shift-y" ? UInt32(cmdKey | shiftKey) : value == "option-space" ? UInt32(optionKey) : UInt32(controlKey | optionKey)
        var replacement: EventHotKeyRef?
        let result = RegisterEventHotKey(code, modifiers, EventHotKeyID(signature: 0x504D4554, id: 1), GetApplicationEventTarget(), 0, &replacement)
        if result == noErr { if let hotKey { UnregisterEventHotKey(hotKey) }; hotKey = replacement; hotKeyOK = true }
        else { hotKeyOK = false }
        shortcut = value
    }
    func perform(_ op: String, workspace: String? = nil) {
        let visible = visibleApplications()
        if let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != slackPID, front.processIdentifier != getpid(), visible.contains(front.processIdentifier) {
            previousApp = front
        } else if previousApp == nil || !visible.contains(previousApp!.processIdentifier) {
            previousApp = visible.first.flatMap { NSRunningApplication(processIdentifier: $0) }
        }
        var request: [String: Any] = ["op": op]; if let workspace { request["workspaceId"] = workspace }
        call(request) { [weak self] result in
            guard let self, let result else { return }
            if result["returnFocus"] as? Bool == true { self.returnFocus() }
            else if let mode = result["mode"] as? String, ["queue", "reading", "reply", "stock"].contains(mode), self.slackPID > 0 {
                NSRunningApplication(processIdentifier: self.slackPID)?.activate(options: [])
            }
            self.refresh()
        }
    }
    // Window metadata only: no titles, pixels, Accessibility access or hidden-Space windows.
    func visibleApplications() -> [pid_t] {
        guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
        var result: [pid_t] = []
        for window in windows {
            guard window[kCGWindowLayer as String] as? Int == 0,
                  (window[kCGWindowAlpha as String] as? Double ?? 1) > 0,
                  let pid = window[kCGWindowOwnerPID as String] as? Int,
                  pid_t(pid) != slackPID, pid_t(pid) != getpid(), !result.contains(pid_t(pid)) else { continue }
            result.append(pid_t(pid))
        }
        return result
    }
    func returnFocus() {
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == slackPID,
              let app = previousApp, !app.isTerminated,
              visibleApplications().contains(app.processIdentifier) else { return }
        app.activate(options: [])
    }
    @objc func action(_ sender: NSMenuItem) {
        guard let data = sender.representedObject as? [String: Any] else { return }
        if let patch = data["settings"] as? [String: Any] { call(["op":"settings","patch":patch]) { [weak self] _ in self?.refresh() } }
        else if let op = data["op"] as? String { perform(op, workspace: data["workspace"] as? String) }
    }
    func entry(_ title: String, data: [String: Any], checked: Bool = false) -> NSMenuItem {
        let row = NSMenuItem(title: title, action: #selector(action(_:)), keyEquivalent: ""); row.target = self; row.representedObject = data; row.state = checked ? .on : .off; return row
    }
    func menu(connected: Bool) {
        if trackingMenu { return }
        let menu = NSMenu();menu.delegate=self
        if !connected { let row = NSMenuItem(title:"Controller disconnected",action:nil,keyEquivalent:"");row.isEnabled=false;menu.addItem(row) }
        for (title,op) in [("Show attention queue", "queue"),("Toggle triage", "toggle"),("Return to work", "rest"),("Hide triage", "hide"),("Minimize", "minimize"),("Normal Slack", "stock")] {
            let row = entry(title,data:["op":op]); row.isEnabled=connected; menu.addItem(row)
        }
        menu.addItem(.separator())
        for (title,key,choices) in [
            ("Screen edge","edge",[("Right","right"),("Left","left")]),
            ("Resting view","rest",[("Thin edge strip","strip"),("Small rail","cluster"),("Fully hidden","hidden")]),
            ("Global shortcut","shortcut",[("⌘⇧Y","cmd-shift-y"),("⌃⌥Space","ctrl-option-space"),("⌥Space","option-space")])
        ] {
            let parent=NSMenuItem(title:title,action:nil,keyEquivalent:"");let submenu=NSMenu()
            for (label,value) in choices { submenu.addItem(entry(label,data:["settings":[key:value]],checked:settings[key] as? String == value)) }
            parent.submenu=submenu;menu.addItem(parent)
        }
        let displayMenu=NSMenu();displayMenu.addItem(entry("Main display",data:["settings":["display":"main"]],checked:settings["display"] as? String == "main"))
        for display in displays { if let id=display["id"] as? String { displayMenu.addItem(entry(display["name"] as? String ?? id,data:["settings":["display":id]],checked:settings["display"] as? String == id)) } }
        let displayItem=NSMenuItem(title:"Display",action:nil,keyEquivalent:"");displayItem.submenu=displayMenu;menu.addItem(displayItem)
        let idleMenu=NSMenu();for seconds in [0,15,30,60,300] { idleMenu.addItem(entry(seconds == 0 ? "Never" : "\(seconds) seconds",data:["settings":["idleSeconds":seconds]],checked:settings["idleSeconds"] as? Int == seconds)) }
        let idleItem=NSMenuItem(title:"Collapse when idle",action:nil,keyEquivalent:"");idleItem.submenu=idleMenu;menu.addItem(idleItem)
        if !workspaces.isEmpty { let sub=NSMenu();for ws in workspaces { if let id=ws["id"] as? String { let row=entry(ws["name"] as? String ?? id,data:["op":"switch","workspace":id]);row.isEnabled=ws["connected"] as? Bool == true;sub.addItem(row) } };let row=NSMenuItem(title:"Workspaces",action:nil,keyEquivalent:"");row.submenu=sub;menu.addItem(row) }
        menu.addItem(.separator());let quit=NSMenuItem(title:"Quit menu controller",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"");menu.addItem(quit);item.menu=menu
    }
    func menuWillOpen(_ menu: NSMenu) { trackingMenu=true }
    func menuDidClose(_ menu: NSMenu) { trackingMenu=false }
    func applicationWillTerminate(_ notification: Notification) { timer?.invalidate();if let spaceObserver { NSWorkspace.shared.notificationCenter.removeObserver(spaceObserver) };if let hotKey { UnregisterEventHotKey(hotKey) };if let handler { RemoveEventHandler(handler) } }
}
let app=NSApplication.shared
let controller=Controller(CommandLine.arguments.dropFirst().first ?? "")
app.delegate=controller
app.run()
