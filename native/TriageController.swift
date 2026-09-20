import AppKit
import Carbon.HIToolbox
import Darwin

// A borderless panel owns the outline; macOS never clips this into a capsule.
final class EdgePanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
final class EdgeStripView: NSView {
    var edge = "left"
    var count = 0
    var action: ((String) -> Void)?
    var hoverTask: DispatchWorkItem?
    override init(frame: NSRect) {
        super.init(frame: frame)
        setAccessibilityElement(true); setAccessibilityRole(.button)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas { removeTrackingArea(area) }
        addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self, userInfo: nil))
    }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    func cancelHover() { hoverTask?.cancel(); hoverTask = nil }
    func armHover() {
        guard hoverTask == nil else { return }
        let task = DispatchWorkItem { [weak self] in
            guard let self else { return }; self.hoverTask = nil
            guard let window = self.window, window.isVisible, window.frame.contains(NSEvent.mouseLocation) else { return }
            self.action?("peek")
        }
        hoverTask = task; DispatchQueue.main.asyncAfter(deadline: .now()+0.18, execute: task)
    }
    override func mouseEntered(with event: NSEvent) { armHover() }
    override func mouseExited(with event: NSEvent) { cancelHover() }
    override func mouseDown(with event: NSEvent) { cancelHover(); action?("queue") }
    override func accessibilityPerformPress() -> Bool { action?("queue"); return true }
    override func draw(_ dirtyRect: NSRect) {
        let w = bounds.width, h = bounds.height, r = min(8.0, w)
        let path = NSBezierPath()
        path.move(to: NSPoint(x: 0, y: 0)); path.line(to: NSPoint(x: w-r, y: 0))
        path.curve(to: NSPoint(x: w, y: r), controlPoint1: NSPoint(x: w, y: 0), controlPoint2: NSPoint(x: w, y: 0))
        path.line(to: NSPoint(x: w, y: h-r))
        path.curve(to: NSPoint(x: w-r, y: h), controlPoint1: NSPoint(x: w, y: h), controlPoint2: NSPoint(x: w, y: h))
        path.line(to: NSPoint(x: 0, y: h)); path.close()
        if edge == "right" { var transform = AffineTransform(); transform.translate(x: w, y: 0); transform.scale(x: -1, y: 1); path.transform(using: transform) }
        NSColor(calibratedRed: 0.094, green: 0.09, blue: 0.11, alpha: 1).setFill(); path.fill()
        NSColor(calibratedRed: 0.78, green: 0.72, blue: 0.89, alpha: count > 0 ? 1 : 0.65).setFill()
        if count == 0 { NSBezierPath(roundedRect: NSRect(x: w/2-1, y: h/2-14, width: 2, height: 28), xRadius: 1, yRadius: 1).fill() }
        else {
            let visible = min(count, 48), total = CGFloat(visible)*7-4
            let start = (h-total)/2 + (count > 48 ? 8 : 0)
            for i in 0..<visible { NSBezierPath(ovalIn: NSRect(x: w/2-1.5, y: start+CGFloat(i)*7, width: 3, height: 3)).fill() }
            if count > 48 {
                let label = NSAttributedString(string: count < 148 ? "+\(count-48)" : "+", attributes: [.font: NSFont.systemFont(ofSize: 6), .foregroundColor: NSColor.lightGray])
                label.draw(at: NSPoint(x: (w-label.size().width)/2, y: max(5,start-16)))
            }
        }
    }
}

// Local menu, keyboard and cached hover previews. No Slack credentials or API calls.
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
    var settingsWindow: NSWindow?
    var settingsSignature = ""
    var settingsSaving = false
    var settingsError = ""
    var shellOnline = false
    var lastSettingsEpoch = 0
    var inboxWorkspace: String?
    var edgePanel: EdgePanel?
    var edgeView: EdgeStripView?
    var stripReady: String?
    var edgeOpening = false
    var previewPanel: NSPanel?
    var previewSignature = ""
    var previewKey: String?
    var previewLastInside = Date.distantPast
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
        call(["op": "state", "hotKeyOK": hotKeyOK, "edgeStripVersion": 1, "stripReady": stripReady ?? "", "previewHover": previewPanel?.isVisible == true && (previewPanel!.frame.contains(NSEvent.mouseLocation) || Date().timeIntervalSince(previewLastInside) < 0.9) ? previewKey ?? "" : ""]) { [weak self] state in
            guard let self else { return }; self.polling = false
            guard let state else { self.shellOnline = false; self.renderSettings(); self.showPreview(nil); self.showEdgeStrip(nil); self.item.button?.title = "!"; self.item.button?.toolTip = "Triage controller disconnected — normal Slack remains available"; self.menu(connected: false); return }
            self.shellOnline = true
            self.slackPID = pid_t(state["slackPID"] as? Int ?? 0)
            self.settings = state["settings"] as? [String: Any] ?? [:]
            self.workspaces = state["workspaces"] as? [[String: Any]] ?? []
            self.displays = state["displays"] as? [[String: Any]] ?? []
            self.inboxWorkspace = state["inboxWorkspace"] as? String
            let settingsEpoch = state["settingsEpoch"] as? Int ?? 0
            if settingsEpoch != self.lastSettingsEpoch {
                let advanced = settingsEpoch > self.lastSettingsEpoch; self.lastSettingsEpoch = settingsEpoch
                if advanced { self.openSettings() }
            }
            self.renderSettings()
            self.showPreview(state["preview"] as? [String: Any])
            self.showEdgeStrip(state["edgeStrip"] as? [String: Any])
            let combination = self.settings["shortcut"] as? String ?? "cmd-shift-y"
            if combination != self.shortcut { self.register(combination) }
            let attention = state["attention"] as? Int ?? 0
            self.item.button?.title = attention > 0 ? " \(attention)" : ""
            self.item.button?.toolTip = self.hotKeyOK ? "Slack triage — \(attention) unread conversations and threads" : "Global shortcut unavailable; use this menu or choose another shortcut"
            let epoch = state["returnEpoch"] as? Int ?? 0
            if epoch != self.lastReturn {
                let advanced = epoch > self.lastReturn; self.lastReturn = epoch
                if advanced { self.returnFocus() }
            }
            self.menu(connected: true)
        }
    }
    func showEdgeStrip(_ value: [String: Any]?) {
        guard let value, let id = value["id"] as? String, let edge = value["edge"] as? String,
              ["left", "right"].contains(edge), let b = value["bounds"] as? [String: Double],
              let x = b["x"], let y = b["y"], let w = b["width"], let h = b["height"],
              [x,y,w,h].allSatisfy({ $0.isFinite }), w == 12, h >= 44, h <= 4096,
              let count = value["count"] as? Int, count >= 0 else {
            edgeView?.cancelHover(); edgePanel?.orderOut(nil); stripReady = nil; return
        }
        if edgeOpening { return }
        let top = NSScreen.screens.first?.frame.maxY ?? 0
        let frame = NSRect(x: x, y: top-y-h, width: w, height: h)
        if edgePanel == nil {
            let panel = EdgePanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            panel.isReleasedWhenClosed = false; panel.hidesOnDeactivate = false
            panel.backgroundColor = .clear; panel.isOpaque = false; panel.hasShadow = false; panel.level = .floating
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
            let view = EdgeStripView(frame: NSRect(origin: .zero, size: frame.size)); view.autoresizingMask = [.width, .height]
            view.action = { [weak self] op in self?.openFromEdge(op) }
            panel.contentView = view; edgePanel = panel; edgeView = view
        }
        let wasVisible = edgePanel?.isVisible == true
        edgeView?.edge = edge; edgeView?.count = count; edgeView?.needsDisplay = true
        edgeView?.setAccessibilityLabel("\(count) unread conversations and threads. Open triage inbox")
        edgeView?.toolTip = "\(count) unread conversations and threads · Hover to reveal · Click for inbox"
        edgePanel?.setFrame(frame, display: true); edgePanel?.orderFrontRegardless()
        stripReady = edgePanel?.isVisible == true ? id : nil
        if !wasVisible && frame.contains(NSEvent.mouseLocation) { edgeView?.armHover() }
    }
    func openFromEdge(_ op: String) {
        guard !edgeOpening else { return }; edgeOpening = true
        edgeView?.cancelHover(); edgePanel?.orderOut(nil); stripReady = nil
        if let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != slackPID, front.processIdentifier != getpid() { previousApp = front }
        call(["op": op]) { [weak self] result in
            guard let self else { return }; self.edgeOpening = false
            if result?["mode"] as? String == "queue", self.slackPID > 0 { NSRunningApplication(processIdentifier: self.slackPID)?.activate(options: []) }
            self.refresh()
        }
    }
    func showPreview(_ value: [String: Any]?) {
        guard let value, !trackingMenu, let anchor = value["anchor"] as? [String: Double],
              let ax = anchor["x"], let ay = anchor["y"], let aw = anchor["width"], let ah = anchor["height"],
              let title = value["title"] as? String,
              let messages = value["messages"] as? [[String: String]],
              [ax, ay, aw, ah].allSatisfy({ $0.isFinite }), aw > 0, ah > 0 else {
            previewPanel?.orderOut(nil); previewSignature = ""; previewKey = nil; return
        }
        // Electron uses a top-left screen origin; AppKit uses bottom-left.
        let top = NSScreen.screens.first?.frame.maxY ?? 0
        let origin = NSRect(x: ax, y: top-ay-ah, width: aw, height: ah)
        let onAnchor = origin.insetBy(dx: -2, dy: -2).contains(NSEvent.mouseLocation)
        let onCard = previewPanel?.isVisible == true && previewPanel!.frame.contains(NSEvent.mouseLocation)
        if onAnchor || onCard { previewLastInside = Date() }
        guard onAnchor || onCard || Date().timeIntervalSince(previewLastInside) < 0.9 else {
            previewPanel?.orderOut(nil); previewSignature = ""; previewKey = nil; return
        }
        let signature = String(data: (try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])) ?? Data(), encoding: .utf8) ?? ""
        if signature == previewSignature && previewPanel?.isVisible == true { return }
        previewSignature = signature; previewKey = value["key"] as? String
        let screen = NSScreen.screens.first(where: { $0.frame.intersects(origin) }) ?? NSScreen.main
        let area = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 800, height: 600)
        let width = min(320.0, area.width-24), contentWidth = width-28
        let content = NSView(); content.appearance = NSAppearance(named: .darkAqua)
        content.wantsLayer = true; content.layer?.backgroundColor = NSColor(calibratedRed: 0.095, green: 0.09, blue: 0.115, alpha: 0.98).cgColor
        content.layer?.cornerRadius = 12; content.layer?.masksToBounds = true
        let stack = NSStackView(); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 7
        stack.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 14), stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -14), stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 12), stack.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -12)])
        func line(_ text: String, _ font: NSFont, _ color: NSColor, _ lines: Int) {
            let label = NSTextField(wrappingLabelWithString: text); label.font = font; label.textColor = color
            label.maximumNumberOfLines = lines; label.lineBreakMode = .byWordWrapping; label.cell?.truncatesLastVisibleLine = true; label.preferredMaxLayoutWidth = contentWidth
            stack.addArrangedSubview(label); label.widthAnchor.constraint(equalToConstant: contentWidth).isActive = true
        }
        line(title, .systemFont(ofSize: 14, weight: .semibold), .labelColor, 2)
        line(value["subtitle"] as? String ?? "", .systemFont(ofSize: 11), .secondaryLabelColor, 1)
        line(value["label"] as? String ?? "Cached preview", .systemFont(ofSize: 10, weight: .medium), .secondaryLabelColor, 2)
        for message in messages.prefix(3) {
            if let author = message["author"], !author.isEmpty { line(author, .systemFont(ofSize: 11, weight: .semibold), .labelColor, 1) }
            line(message["text"] ?? "", .systemFont(ofSize: 12), .labelColor, messages.count == 1 ? 7 : 3)
        }
        let readStatus = value["readStatus"] as? String ?? ""
        if readStatus == "pending" { line("Marking read…", .systemFont(ofSize: 11), .secondaryLabelColor, 1) }
        if readStatus == "error" { line("Slack hasn’t confirmed read. Try again or open the inbox.", .systemFont(ofSize: 11), .secondaryLabelColor, 2) }
        let actions = NSStackView(); actions.orientation = .horizontal; actions.spacing = 8
        for (title, action) in [("Mark read", "read"), ("Reply", "reply"), ("Inbox", "inbox")] {
            let button = NSButton(title: title, target: self, action: #selector(previewClicked(_:)))
            button.isEnabled = action != "read" || readStatus != "pending"
            button.identifier = NSUserInterfaceItemIdentifier(action); button.bezelStyle = .rounded
            button.font = .systemFont(ofSize: 12); actions.addArrangedSubview(button)
        }
        stack.addArrangedSubview(actions)
        let height = min(stack.fittingSize.height+24, area.height-24)
        let preferredX = value["edge"] as? String == "left" ? origin.maxX+10 : origin.minX-width-10
        let frame = NSRect(x: max(area.minX+8, min(preferredX, area.maxX-width-8)), y: max(area.minY+8, min(origin.midY-height/2, area.maxY-height-8)), width: width, height: height)
        if previewPanel == nil {
            let panel = NSPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            panel.isReleasedWhenClosed = false; panel.hidesOnDeactivate = false; panel.ignoresMouseEvents = false
            panel.backgroundColor = .clear; panel.isOpaque = false; panel.hasShadow = true; panel.level = .statusBar
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
            previewPanel = panel
        }
        previewPanel?.contentView = content; previewPanel?.setFrame(frame, display: true); previewPanel?.orderFrontRegardless()
    }
    @objc func previewClicked(_ sender: NSButton) {
        guard let key = previewKey, let action = sender.identifier?.rawValue else { return }
        if let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != slackPID, front.processIdentifier != getpid() { previousApp = front }
        previewPanel?.orderOut(nil); previewSignature = ""; previewKey = nil
        call(["op": "preview-action", "key": key, "action": action]) { [weak self] result in
            guard let self else { return }
            if result != nil, result?["activate"] as? Bool != false, self.slackPID > 0 { NSRunningApplication(processIdentifier: self.slackPID)?.activate(options: []) }
            self.refresh()
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
    @objc func openSettings() {
        if settingsWindow == nil {
            let window = NSWindow(contentRect:NSRect(x:0,y:0,width:568,height:650),styleMask:[.titled,.closable,.miniaturizable],backing:.buffered,defer:false)
            window.title="Slack Triage Settings";window.isReleasedWhenClosed=false
            window.appearance=NSAppearance(named:.darkAqua)
            window.backgroundColor=NSColor(calibratedRed:0.078,green:0.098,blue:0.145,alpha:1)
            window.center();window.setFrameAutosaveName("SlackTriageSettings");settingsWindow=window
        }
        settingsSignature="";renderSettings();settingsWindow?.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
    }
    func renderSettings() {
        guard let window=settingsWindow else { return }
        let data: [String:Any] = ["settings":settings,"workspaces":workspaces,"displays":displays,"inbox":inboxWorkspace ?? "","online":shellOnline,"saving":settingsSaving,"error":settingsError]
        let signature=String(data:(try? JSONSerialization.data(withJSONObject:data,options:[.sortedKeys])) ?? Data(),encoding:.utf8) ?? ""
        if signature == settingsSignature { return };settingsSignature=signature
        let content=NSView();window.contentView=content
        let stack=NSStackView();stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=12
        stack.translatesAutoresizingMaskIntoConstraints=false;content.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:content.leadingAnchor,constant:24),stack.trailingAnchor.constraint(equalTo:content.trailingAnchor,constant:-24),stack.topAnchor.constraint(equalTo:content.topAnchor,constant:20)])
        let enabled=shellOnline && !settingsSaving
        func label(_ text:String,heading:Bool=false)->NSTextField {
            let field=NSTextField(wrappingLabelWithString:text);field.font=heading ? .systemFont(ofSize:14,weight:.semibold) : .systemFont(ofSize:12)
            field.textColor=heading ? .labelColor : .secondaryLabelColor;return field
        }
        func popup(_ title:String,key:String,choices:[(String,Any)]) {
            let row=NSStackView();row.orientation = .horizontal;row.spacing=12;row.alignment = .centerY
            let name=label(title);name.widthAnchor.constraint(equalToConstant:170).isActive=true
            let control=NSPopUpButton();control.identifier=NSUserInterfaceItemIdentifier(key);control.target=self;control.action=#selector(changeSetting(_:));control.isEnabled=enabled
            control.setAccessibilityLabel(title);control.widthAnchor.constraint(equalToConstant:338).isActive=true
            for (title,value) in choices { control.addItem(withTitle:title);control.lastItem?.representedObject=value }
            if let current=settings[key] { for (index,choice) in choices.enumerated() { if String(describing:choice.1) == String(describing:current) { control.selectItem(at:index) } } }
            row.addArrangedSubview(name);row.addArrangedSubview(control);stack.addArrangedSubview(row)
        }
        stack.addArrangedSubview(label("Appearance & behavior",heading:true))
        popup("Screen edge",key:"edge",choices:[("Left","left"),("Right","right")])
        var screens:[(String,Any)]=[("Main display","main")]
        for display in displays { if let id=display["id"] as? String { screens.append((display["name"] as? String ?? id,id)) } }
        popup("Display",key:"display",choices:screens)
        popup("Resting view",key:"rest",choices:[("Thin edge strip","strip"),("Pill","cluster"),("Hidden","hidden")])
        popup("Collapse pill when idle",key:"idleSeconds",choices:[("Never",0),("5 seconds",5),("15 seconds",15),("30 seconds",30),("1 minute",60),("5 minutes",300)])
        popup("Global shortcut",key:"shortcut",choices:[("⌘⇧Y","cmd-shift-y"),("⌃⌥Space","ctrl-option-space"),("⌥Space","option-space")])
        let reopen=NSButton(checkboxWithTitle:"Return Done items when new messages arrive",target:self,action:#selector(changeSetting(_:)))
        reopen.identifier=NSUserInterfaceItemIdentifier("reopenNew");reopen.state=settings["reopenNew"] as? Bool == false ? .off : .on;reopen.isEnabled=enabled;stack.addArrangedSubview(reopen)
        let divider=NSBox();divider.boxType = .separator;stack.addArrangedSubview(divider);divider.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        stack.addArrangedSubview(label("Notifications",heading:true))
        popup("Notify me about",key:"notificationMode",choices:[("All connected workspaces","all"),("Choose workspaces…","selected"),("Follow the inbox filter","inbox")])
        let mode=settings["notificationMode"] as? String ?? "all"
        let explanation=label(mode == "inbox" ? "The menu count, pill, and automatic expansion follow the workspace selected in your inbox. All workspaces includes every connected workspace." : mode == "selected" ? "Only checked workspaces contribute to the menu count, pill, and automatic expansion. Leave all unchecked to turn these notifications off." : "The menu count, pill, and automatic expansion include every connected workspace, regardless of your inbox filter.")
        stack.addArrangedSubview(explanation);explanation.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        let scroll=NSScrollView();scroll.hasVerticalScroller=true;scroll.autohidesScrollers=true;scroll.drawsBackground=false
        let list=NSStackView();list.orientation = .vertical;list.alignment = .leading;list.spacing=8;list.translatesAutoresizingMaskIntoConstraints=false
        let document=NSView();scroll.documentView=document;document.translatesAutoresizingMaskIntoConstraints=false;document.addSubview(list)
        NSLayoutConstraint.activate([document.widthAnchor.constraint(equalTo:scroll.contentView.widthAnchor),list.leadingAnchor.constraint(equalTo:document.leadingAnchor,constant:4),list.trailingAnchor.constraint(equalTo:document.trailingAnchor,constant:-4),list.topAnchor.constraint(equalTo:document.topAnchor,constant:4),list.bottomAnchor.constraint(equalTo:document.bottomAnchor,constant:-4)])
        let selected=settings["notificationWorkspaces"] as? [String] ?? [],inbox=inboxWorkspace
        for workspace in workspaces { if let id=workspace["id"] as? String {
            let button=NSButton(checkboxWithTitle:workspace["name"] as? String ?? id,target:self,action:#selector(changeSetting(_:)))
            button.identifier=NSUserInterfaceItemIdentifier("workspace:"+id);button.isEnabled=enabled && mode == "selected"
            button.state=(mode == "all" || mode == "selected" && selected.contains(id) || mode == "inbox" && (inbox == "*" || inbox == id)) ? .on : .off
            list.addArrangedSubview(button)
        } }
        if workspaces.isEmpty { list.addArrangedSubview(label("Connected workspaces will appear here.")) }
        stack.addArrangedSubview(scroll);scroll.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true;scroll.heightAnchor.constraint(equalToConstant:104).isActive=true
        let status=label(!shellOnline ? "Controller disconnected. Settings will be available after reconnecting." : settingsSaving ? "Saving…" : settingsError.isEmpty ? "Changes save automatically on this Mac." : settingsError)
        status.setAccessibilityIdentifier("settings-status");stack.addArrangedSubview(status);status.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
    }
    @objc func changeSetting(_ sender:NSControl) {
        guard shellOnline,!settingsSaving,let key=sender.identifier?.rawValue else { return }
        var patch:[String:Any]=[:]
        if key.hasPrefix("workspace:"),let button=sender as? NSButton {
            let id=String(key.dropFirst("workspace:".count));var ids=settings["notificationWorkspaces"] as? [String] ?? []
            ids.removeAll(where:{$0 == id});if button.state == .on { ids.append(id) };patch["notificationWorkspaces"]=ids
        } else if let popup=sender as? NSPopUpButton,let value=popup.selectedItem?.representedObject { patch[key]=value }
        else if let button=sender as? NSButton { patch[key]=button.state == .on }
        guard !patch.isEmpty else { return };settingsSaving=true;settingsError="";renderSettings()
        call(["op":"settings","patch":patch]) { [weak self] result in
            guard let self else { return };self.settingsSaving=false
            if let updated=result?["settings"] as? [String:Any] { self.settings=updated } else { self.settingsError="Could not save. Please try again." }
            self.renderSettings();self.refresh()
        }
    }
    func menu(connected: Bool) {
        if trackingMenu { return }
        let menu = NSMenu();menu.delegate=self
        if !connected { let row = NSMenuItem(title:"Controller disconnected",action:nil,keyEquivalent:"");row.isEnabled=false;menu.addItem(row) }
        for (title,op) in [("Show attention queue", "queue"),("Toggle triage", "toggle"),("Return to work", "rest"),("Hide triage", "hide"),("Minimize", "minimize"),("Normal Slack", "stock")] {
            let row = entry(title,data:["op":op]); row.isEnabled=connected; menu.addItem(row)
        }
        menu.addItem(.separator())
        let preferences=NSMenuItem(title:"Settings…",action:#selector(openSettings),keyEquivalent:",");preferences.target=self;menu.addItem(preferences)
        if !workspaces.isEmpty { let sub=NSMenu();for ws in workspaces { if let id=ws["id"] as? String { let row=entry(ws["name"] as? String ?? id,data:["op":"switch","workspace":id]);row.isEnabled=ws["connected"] as? Bool == true;sub.addItem(row) } };let row=NSMenuItem(title:"Workspaces",action:nil,keyEquivalent:"");row.submenu=sub;menu.addItem(row) }
        menu.addItem(.separator());let quit=NSMenuItem(title:"Quit menu controller",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"");menu.addItem(quit);item.menu=menu
    }
    func menuWillOpen(_ menu: NSMenu) { trackingMenu=true }
    func menuDidClose(_ menu: NSMenu) { trackingMenu=false }
    func applicationWillTerminate(_ notification: Notification) { timer?.invalidate();edgeView?.cancelHover();edgePanel?.orderOut(nil);if let spaceObserver { NSWorkspace.shared.notificationCenter.removeObserver(spaceObserver) };if let hotKey { UnregisterEventHotKey(hotKey) };if let handler { RemoveEventHandler(handler) } }
}
let app=NSApplication.shared
let controller=Controller(CommandLine.arguments.dropFirst().first ?? "")
app.delegate=controller
app.run()
