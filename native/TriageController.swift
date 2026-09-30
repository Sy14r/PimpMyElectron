import AppKit
import Carbon.HIToolbox
import Darwin

func accentColor(_ value: String?) -> NSColor {
    let hex=value ?? "#bca9f0"
    guard hex.range(of:"^#[0-9a-fA-F]{6}$",options:.regularExpression) != nil,
          let rgb=UInt32(hex.dropFirst(),radix:16) else { return accentColor(nil) }
    return NSColor(srgbRed:CGFloat((rgb >> 16) & 255)/255,green:CGFloat((rgb >> 8) & 255)/255,blue:CGFloat(rgb & 255)/255,alpha:1)
}

final class AccentSwatch: NSButton {
    let hex: String
    init(name:String,hex:String) {
        self.hex=hex;super.init(frame:.zero);title=name;isBordered=false;setButtonType(.momentaryPushIn)
        identifier=NSUserInterfaceItemIdentifier("accentColor")
        setAccessibilityRole(.radioButton);setAccessibilityLabel("\(name) accent color")
    }
    required init?(coder:NSCoder) { fatalError("init(coder:) is not supported") }
    override func draw(_ dirtyRect:NSRect) {
        let circle=NSBezierPath(ovalIn:bounds.insetBy(dx:6,dy:6))
        accentColor(hex).withAlphaComponent(isEnabled ? 1 : 0.45).setFill();circle.fill()
        if state == .on || isHighlighted {
            NSColor.white.withAlphaComponent(state == .on ? 0.9 : 0.4).setStroke()
            let ring=NSBezierPath(ovalIn:bounds.insetBy(dx:2,dy:2));ring.lineWidth=2;ring.stroke()
        }
    }
}

// A borderless panel owns the outline; macOS never clips this into a capsule.
final class EdgePanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
// Owns only a click-through material surface. The private stream carries
// geometry, never message content, credentials, or executable instructions.
final class InboxBackdrop {
    var expectedPID: pid_t = 0
    private(set) var ready: String?
    private var panel: EdgePanel?
    private var request: [String:Any]?
    private var seen = Date.distantPast
    private var windowNumber = 0
    private var watchdog: Timer?
    private let streamQueue = DispatchQueue(label:"triage.backdrop.stream")
    func start(_ path:String) {
        watchdog=Timer.scheduledTimer(withTimeInterval:0.1,repeats:true){ [weak self] _ in self?.drawCurrent() }
        streamQueue.async { [weak self] in
            while self != nil {
                let fd=Darwin.socket(AF_UNIX,SOCK_STREAM,0)
                guard fd>=0 else { Thread.sleep(forTimeInterval:1);continue }
                var address=sockaddr_un();address.sun_family=sa_family_t(AF_UNIX)
                let bytes=Array(path.utf8CString)
                guard bytes.count<=MemoryLayout.size(ofValue:address.sun_path) else { Darwin.close(fd);return }
                withUnsafeMutableBytes(of:&address.sun_path){ dest in bytes.withUnsafeBytes{dest.copyBytes(from:$0)} }
                let connected=withUnsafePointer(to:&address){ $0.withMemoryRebound(to:sockaddr.self,capacity:1){Darwin.connect(fd,$0,socklen_t(MemoryLayout<sockaddr_un>.size))} }
                if connected==0 {
                    var noPipe:Int32=1;setsockopt(fd,SOL_SOCKET,SO_NOSIGPIPE,&noPipe,socklen_t(MemoryLayout<Int32>.size))
                    let hello=Array("{\"op\":\"watch-backdrop\"}\n".utf8)
                    let sent=hello.withUnsafeBytes{Darwin.write(fd,$0.baseAddress!,$0.count)}
                    if sent==hello.count {
                        var data=Data(),buffer=[UInt8](repeating:0,count:4096)
                        while true {
                            let count=Darwin.read(fd,&buffer,buffer.count);if count<=0 { break }
                            data.append(contentsOf:buffer.prefix(count));if data.count>32768 { break }
                            while let newline=data.firstIndex(of:10) {
                                let line=data.prefix(upTo:newline);data.removeSubrange(...newline)
                                let value=(try? JSONSerialization.jsonObject(with:line)) as? [String:Any]
                                let backdrop=value?["backdrop"] as? [String:Any]
                                DispatchQueue.main.async { [weak self] in self?.request=backdrop;self?.seen=Date();self?.drawCurrent() }
                            }
                        }
                    }
                }
                Darwin.close(fd)
                DispatchQueue.main.async { [weak self] in self?.request=nil;self?.hide() }
                Thread.sleep(forTimeInterval:1)
            }
        }
    }
    func hide(){ready=nil;windowNumber=0;panel?.orderOut(nil)}
    private func rect(_ raw:Any?) -> CGRect? {
        guard let b=raw as? [String:Double],let x=b["x"],let y=b["y"],let w=b["width"],let h=b["height"],
              [x,y,w,h].allSatisfy({$0.isFinite}),abs(x)<100000,abs(y)<100000,w>0,w<=820,h>0,h<=8192 else{return nil}
        return CGRect(x:x,y:y,width:w,height:h)
    }
    private func drawCurrent(){
        guard Date().timeIntervalSince(seen)<3,!NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency,
              let request,let id=request["id"] as? String,request["slackPID"] as? Int==Int(expectedPID),expectedPID>0,
              let expected=rect(request["window"]),let inbox=rect(request["inbox"]),inbox.width<=420,
              expected.insetBy(dx:-1,dy:-1).contains(inbox),
              let surface=rect(request["surface"] ?? request["inbox"]),surface.minX==inbox.minX,surface.minY==inbox.minY,surface.height==inbox.height,surface.width>=inbox.width,
              expected.insetBy(dx:-1,dy:-1).contains(surface),
              let windows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]],
              let target=windows.first(where:{ value in
                  guard value[kCGWindowOwnerPID as String] as? Int==Int(expectedPID),let b=value[kCGWindowBounds as String] as? [String:Double] else{return false}
                  return abs((b["Height"] ?? 0)-expected.height)<2 && (b["Width"] ?? 0)>=420 && (b["Width"] ?? 0)<=820 &&
                      (windowNumber==0 || value[kCGWindowNumber as String] as? Int==windowNumber)
              }),let number=target[kCGWindowNumber as String] as? Int,let b=target[kCGWindowBounds as String] as? [String:Double],
              let x=b["X"],let y=b["Y"],let screen=NSScreen.screens.first else {hide();return}
        let frame=NSRect(x:x+surface.minX-expected.minX,y:screen.frame.maxY-y-(surface.minY-expected.minY)-surface.height,width:surface.width,height:surface.height)
        if panel==nil {
            let p=EdgePanel(contentRect:frame,styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false)
            p.isReleasedWhenClosed=false;p.hidesOnDeactivate=false;p.isOpaque=false;p.backgroundColor = .clear;p.hasShadow=false;p.ignoresMouseEvents=true
            p.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary,.ignoresCycle]
            let effect=NSVisualEffectView(frame:NSRect(origin:.zero,size:frame.size))
            effect.appearance=NSAppearance(named:.darkAqua);effect.material = .hudWindow;effect.blendingMode = .behindWindow;effect.state = .active;effect.autoresizingMask=[.width,.height]
            effect.wantsLayer=true;effect.layer?.cornerRadius=10;effect.layer?.masksToBounds=true
            p.contentView=effect;panel=p
        }
        guard let panel else{return}
        if panel.frame != frame {panel.setFrame(frame,display:true)}
        panel.level=NSWindow.Level(rawValue:target[kCGWindowLayer as String] as? Int ?? 3)
        if !panel.isVisible || windowNumber != number {panel.order(.below,relativeTo:number)}
        windowNumber=number;ready=panel.isVisible ? id:nil
    }
}

final class EdgeStripView: NSView {
    var accent=accentColor(nil)
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
        accent.withAlphaComponent(count > 0 ? 1 : 0.65).setFill()
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

// Instant local placeholder while Electron prepares the real pill. It has no
// message content and never claims that a read/reply action has completed.
final class PillPlaceholderView: NSView {
    var accent=accentColor(nil)
    var edge = "left"
    var count = 0
    var action: ((String) -> Void)?
    override var isFlipped: Bool { true }
    override init(frame: NSRect) {
        super.init(frame: frame)
        setAccessibilityElement(true); setAccessibilityRole(.button)
        setAccessibilityLabel("Opening triage. Click to open inbox")
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) {
        let y=convert(event.locationInWindow,from:nil).y
        action?(y > bounds.height-38 ? "preferences" : y > bounds.height-69 ? "stock" : "queue")
    }
    override func accessibilityPerformPress() -> Bool { action?("queue"); return true }
    override func draw(_ dirtyRect: NSRect) {
        let background=NSColor(calibratedRed:0.094,green:0.09,blue:0.11,alpha:1)
        let tint=accent
        background.setFill()
        NSBezierPath(roundedRect:bounds,xRadius:12,yRadius:12).fill()
        NSBezierPath(rect:NSRect(x:edge == "left" ? 0 : bounds.width-12,y:0,width:12,height:bounds.height)).fill()
        func symbol(_ name:String,_ y:CGFloat) {
            guard let image=NSImage(systemSymbolName:name,accessibilityDescription:nil)?.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize:17,weight:.regular)) else { return }
            let tinted=NSImage(size:image.size,flipped:false) { rect in
                image.draw(in:rect);tint.setFill();rect.fill(using:.sourceAtop);return true
            }
            tinted.draw(in:NSRect(x:13,y:y,width:18,height:18),from:.zero,operation:.sourceOver,fraction:1,respectFlipped:true,hints:nil)
        }
        if count == 0 { symbol("tray",12) }
        else {
            for i in 0..<min(count,12) {
                let y=CGFloat(9+i*38);if y+32 > bounds.height-72 { break }
                tint.withAlphaComponent(0.18).setFill()
                NSBezierPath(roundedRect:NSRect(x:6,y:y,width:32,height:32),xRadius:10,yRadius:10).fill()
                tint.withAlphaComponent(0.6).setFill()
                NSBezierPath(ovalIn:NSRect(x:20,y:y+14,width:4,height:4)).fill()
            }
        }
        // The same monochrome Slack mark as the web pill.
        let transform=NSAffineTransform();transform.translateX(by:13,yBy:bounds.height-62);transform.scale(by:0.75)
        NSGraphicsContext.saveGraphicsState();transform.concat();tint.setFill()
        for turn in 0..<4 {
            let rotate=NSAffineTransform();rotate.translateX(by:12,yBy:12);rotate.rotate(byDegrees:CGFloat(turn*90));rotate.translateX(by:-12,yBy:-12)
            for rect in [NSRect(x:13,y:1,width:4.5,height:10),NSRect(x:7,y:1,width:4.5,height:4.5)] {
                let path=NSBezierPath(roundedRect:rect,xRadius:2.25,yRadius:2.25);path.transform(using:rotate as AffineTransform);path.fill()
            }
        }
        NSGraphicsContext.restoreGraphicsState();symbol("gearshape",bounds.height-31)
    }
}

final class SettingsDocumentView: NSView { override var isFlipped: Bool { true } }

// Draw sample rows rather than fetching any workspace content for Settings.
final class InboxDensityPreview: NSButton {
    var accent=accentColor(nil)
    let density: String
    let caption: String
    override var isFlipped: Bool { true }
    init(density: String, title: String, caption: String) {
        self.density=density;self.caption=caption
        super.init(frame:.zero)
        self.title=title;isBordered=false;setButtonType(.momentaryPushIn)
        identifier=NSUserInterfaceItemIdentifier("inboxDensity")
        setAccessibilityRole(.radioButton)
        setAccessibilityLabel("\(title) inbox density. \(caption)")
        setAccessibilityHelp("Select this inbox layout. Preview uses sample conversations.")
    }
    required init?(coder:NSCoder) { fatalError("init(coder:) is not supported") }
    override var focusRingMaskBounds: NSRect { bounds.insetBy(dx:3,dy:3) }
    override func drawFocusRingMask() {
        NSBezierPath(roundedRect:focusRingMaskBounds,xRadius:10,yRadius:10).fill()
    }
    override func draw(_ dirtyRect:NSRect) {
        let foreground=NSColor(calibratedRed:0.929,green:0.941,blue:0.969,alpha:1)
        let muted=NSColor(calibratedRed:0.529,green:0.588,blue:0.682,alpha:1)
        func text(_ value:String,_ rect:NSRect,size:CGFloat=11,color:NSColor?=nil,weight:NSFont.Weight = .regular,lines:Bool=false) {
            let paragraph=NSMutableParagraphStyle();paragraph.lineBreakMode=lines ? .byWordWrapping : .byTruncatingTail
            paragraph.lineSpacing=2
            (value as NSString).draw(with:rect,options:[.usesLineFragmentOrigin,.truncatesLastVisibleLine],attributes:[.font:NSFont.systemFont(ofSize:size,weight:weight),.foregroundColor:(color ?? foreground).withAlphaComponent(isEnabled ? 1 : 0.45),.paragraphStyle:paragraph])
        }
        let outline=NSBezierPath(roundedRect:bounds.insetBy(dx:3,dy:3),xRadius:10,yRadius:10)
        NSColor(calibratedRed:0.078,green:0.098,blue:0.145,alpha:1).setFill();outline.fill()
        (state == .on ? accent : NSColor.white.withAlphaComponent(isHighlighted ? 0.3 : 0.13)).setStroke()
        outline.lineWidth=state == .on ? 2 : 1;outline.stroke()
        text(title,NSRect(x:15,y:16,width:bounds.width-50,height:20),size:13,weight:.semibold)
        let radio=NSBezierPath(ovalIn:NSRect(x:bounds.width-30,y:18,width:13,height:13))
        (state == .on ? accent : muted).setStroke();radio.lineWidth=1.3;radio.stroke()
        if state == .on { accent.setFill();NSBezierPath(ovalIn:NSRect(x:bounds.width-27,y:21,width:7,height:7)).fill() }
        let rows=[("Alex Chen","Can you take a look at the latest mockups?","now","@"),
                  ("design","Maya: The updated screens are ready for review.","2m","#"),
                  ("Launch checklist","Sam: All checks passed. Ready for tomorrow!","5m","↳")]
        let rowHeight:CGFloat=density == "expanded" ? 78 : density == "cozy" ? 53 : 34
        let left:CGFloat=13,width=bounds.width-26
        for (index,row) in rows.enumerated() {
            let y=CGFloat(49)+CGFloat(index)*rowHeight
            if index == 0 {
                accent.withAlphaComponent(0.09).setFill()
                NSBezierPath(roundedRect:NSRect(x:left,y:y,width:width,height:rowHeight-3),xRadius:6,yRadius:6).fill()
            }
            text(row.3,NSRect(x:left+7,y:y+8,width:14,height:16),size:12,color:muted)
            let nameX=left+25,timeWidth:CGFloat=density == "expanded" ? 0 : 28
            text(row.0,NSRect(x:nameX,y:y+8,width:width-42-timeWidth,height:16),size:11,weight:.semibold)
            accent.setFill();NSBezierPath(ovalIn:NSRect(x:left+width-12,y:y+12,width:5,height:5)).fill()
            if density != "expanded" { text(row.2,NSRect(x:left+width-42,y:y+9,width:26,height:14),size:9,color:muted) }
            if density != "compact" {
                text(row.1,NSRect(x:nameX,y:y+28,width:width-33,height:density == "expanded" ? 30 : 16),size:10,color:muted,lines:density == "expanded")
            }
            if density == "expanded" { text("Sample workspace · \(row.2)",NSRect(x:nameX,y:y+61,width:width-33,height:13),size:9,color:muted) }
        }
        text(caption,NSRect(x:15,y:bounds.height-33,width:bounds.width-30,height:18),size:10,color:muted)
    }
}

// Local menu, keyboard and cached hover previews. No Slack credentials or API calls.
final class Controller: NSObject, NSApplicationDelegate, NSMenuDelegate {
    let socketPath: String
    var item: NSStatusItem!
    var stockHotKey: EventHotKeyRef?
    var stockHotKeyOK = false
    var stockToggleBusy = false
    var hotKey: EventHotKeyRef?
    var handler: EventHandlerRef?
    var shortcut = ""
    var stockShortcut = ""
    var hotKeyOK = false
    var timer: Timer?
    var polling = false
    var trackingMenu = false
    var previousApp: NSRunningApplication?
    var spaceObserver: NSObjectProtocol?
    var slackPID: pid_t = 0
    var lastReturn = 0
    var settings: [String: Any] = [:]
    var accentTheme: [String:String] = [:]
    var backdrop: [String:Any] = [:]
    let inboxBackdrop=InboxBackdrop()
    var currentAccent: NSColor { accentColor(accentTheme["--pme-accent-text"]) }
    var workspaces: [[String: Any]] = []
    var displays: [[String: Any]] = []
    var settingsWindow: NSWindow?
    var settingsScrollView: NSScrollView?
    var settingsSectionHeaders: [NSTextField] = []
    var settingsSectionButtons: [NSButton] = []
    var settingsScrollObservers: [NSObjectProtocol] = []
    var settingsJump: (index: Int, offset: CGFloat)?
    var settingsSignature = ""
    var settingsSaving = false
    var pendingAccent: String?
    var settingsError = ""
    var shellOnline = false
    var lastSettingsEpoch = 0
    var inboxWorkspace: String?
    var edgePanel: EdgePanel?
    var edgeView: EdgeStripView?
    var stripReady: String?
    var edgeOpening = false
    var shellMode = "stock"
    var attentionCount = 0
    var pillPlaceholder: EdgePanel?
    var pillPlaceholderToken = 0
    var pendingPillAction: String?
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
                  identifier.signature == 0x504D4554, [1, 2].contains(identifier.id) else { return OSStatus(eventNotHandledErr) }
            let op = identifier.id == 2 ? "stock-toggle" : "toggle"
            DispatchQueue.main.async { controller.perform(op) }
            return noErr
        }, 1, &type, Unmanaged.passUnretained(self).toOpaque(), &handler)
        inboxBackdrop.start(socketPath)
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
        call(["op": "state", "hotKeyOK": hotKeyOK, "stockHotKeyOK": stockHotKeyOK, "edgeStripVersion": 1, "backdropVersion":1, "backdropReady":inboxBackdrop.ready ?? "", "stripReady": stripReady ?? "", "previewHover": previewPanel?.isVisible == true && (previewPanel!.frame.contains(NSEvent.mouseLocation) || Date().timeIntervalSince(previewLastInside) < 0.9) ? previewKey ?? "" : ""]) { [weak self] state in
            guard let self else { return }; self.polling = false
            guard let state else { self.shellOnline = false; self.inboxBackdrop.hide(); self.renderSettings(); self.showPreview(nil); self.showEdgeStrip(nil); self.dismissPillPlaceholder(); self.item.button?.title = "!"; self.item.button?.toolTip = "Triage controller disconnected — normal Slack remains available"; self.menu(connected: false); return }
            self.shellOnline = true
            self.shellMode = state["mode"] as? String ?? self.shellMode
            self.slackPID = pid_t(state["slackPID"] as? Int ?? 0)
            self.inboxBackdrop.expectedPID=self.slackPID
            self.settings = state["settings"] as? [String: Any] ?? [:]
            self.backdrop = state["backdrop"] as? [String:Any] ?? [:]
            self.accentTheme = state["accentTheme"] as? [String:String] ?? [:]
            self.workspaces = state["workspaces"] as? [[String: Any]] ?? []
            self.displays = state["displays"] as? [[String: Any]] ?? []
            self.inboxWorkspace = state["inboxWorkspace"] as? String
            let settingsEpoch = state["settingsEpoch"] as? Int ?? 0
            if settingsEpoch != self.lastSettingsEpoch {
                let advanced = settingsEpoch > self.lastSettingsEpoch; self.lastSettingsEpoch = settingsEpoch
                if advanced { self.openSettings() }
            }
            let combination = self.settings["shortcut"] as? String ?? "cmd-shift-y"
            let stockCombination = self.settings["stockShortcut"] as? String ?? "cmd-shift-u"
            if combination != self.shortcut || stockCombination != self.stockShortcut { self.registerShortcuts(combination, stockCombination) }
            self.renderSettings()
            self.showPreview(state["preview"] as? [String: Any])
            self.showEdgeStrip(state["edgeStrip"] as? [String: Any])
            let attention = state["attention"] as? Int ?? 0
            self.attentionCount = attention
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
        edgeView?.edge = edge; edgeView?.count = count; edgeView?.accent = currentAccent; edgeView?.needsDisplay = true
        edgeView?.setAccessibilityLabel("\(count) unread conversations and threads. Open triage inbox")
        edgeView?.toolTip = "\(count) unread conversations and threads · Hover to reveal · Click for inbox"
        edgePanel?.setFrame(frame, display: true); edgePanel?.orderFrontRegardless()
        stripReady = edgePanel?.isVisible == true ? id : nil
        if !wasVisible && frame.contains(NSEvent.mouseLocation) { edgeView?.armHover() }
    }
    func beginPillPlaceholder() -> Int {
        pillPlaceholderToken += 1;let token=pillPlaceholderToken;pendingPillAction=nil
        let display=settings["display"] as? String ?? "main"
        let screen=NSScreen.screens.first(where:{ String(($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0) == display }) ?? NSScreen.screens.first
        guard let screen else { return token }
        let area=screen.visibleFrame,edge=settings["edge"] as? String ?? "left"
        let height=min(area.height,CGFloat(max(132,96+min(attentionCount,12)*38)))
        let frame=NSRect(x:edge == "right" ? area.maxX-44 : area.minX,y:area.midY-height/2,width:44,height:height)
        if pillPlaceholder == nil {
            let panel=EdgePanel(contentRect:frame,styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false)
            panel.isReleasedWhenClosed=false;panel.hidesOnDeactivate=false;panel.backgroundColor = .clear;panel.isOpaque=false;panel.hasShadow=false
            panel.level=NSWindow.Level(rawValue:NSWindow.Level.floating.rawValue+1)
            panel.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary,.ignoresCycle]
            let view=PillPlaceholderView(frame:NSRect(origin:.zero,size:frame.size));view.autoresizingMask=[.width,.height]
            view.action={ [weak self] op in
                guard let self else { return }
                if op == "preferences" { self.openSettings() } else { self.pendingPillAction=op }
            }
            panel.contentView=view;pillPlaceholder=panel
        }
        if let view=pillPlaceholder?.contentView as? PillPlaceholderView { view.edge=edge;view.count=attentionCount;view.accent=currentAccent;view.needsDisplay=true }
        pillPlaceholder?.setFrame(frame,display:true);pillPlaceholder?.orderFrontRegardless();pillPlaceholder?.displayIfNeeded()
        // A failed/crashed Slack must never leave an inert imitation on screen.
        DispatchQueue.main.asyncAfter(deadline:.now()+5) { [weak self] in
            guard let self, self.pillPlaceholderToken == token else { return }
            self.dismissPillPlaceholder();self.edgeOpening=false;self.refresh()
        }
        return token
    }
    func dismissPillPlaceholder() {
        pillPlaceholderToken += 1;pendingPillAction=nil;pillPlaceholder?.orderOut(nil)
    }
    func finishPillPlaceholder(_ token:Int,_ result:[String:Any]?) {
        guard token == pillPlaceholderToken else { return }
        if let mode=result?["mode"] as? String { shellMode=mode }
        if result != nil, let op=pendingPillAction {
            pendingPillAction=nil
            if result?["mode"] as? String != op {
                call(["op":op]) { [weak self] next in
                    guard let self else { return };self.finishPillPlaceholder(token,next)
                    if token == self.pillPlaceholderToken, next?["mode"] as? String == "queue" || next?["mode"] as? String == "stock" {
                        NSRunningApplication(processIdentifier:self.slackPID)?.activate(options:[])
                    }
                }
                return
            }
        }
        // The command acknowledges final native bounds/show. Give the now
        // visible renderer one display interval before uncovering it.
        DispatchQueue.main.asyncAfter(deadline:.now()+0.033) { [weak self] in
            guard let self, self.pillPlaceholderToken == token else { return }
            self.dismissPillPlaceholder();self.refresh()
        }
    }
    func openFromEdge(_ op: String) {
        guard !edgeOpening else { return }; edgeOpening = true
        // Hover already reveals the real pill quickly; reserve the temporary
        // native surface for opening the larger inbox.
        let placeholder=op == "peek" ? nil : beginPillPlaceholder()
        if placeholder == nil { dismissPillPlaceholder() }
        let requestToken=pillPlaceholderToken
        edgeView?.cancelHover(); edgePanel?.orderOut(nil); stripReady = nil
        if let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != slackPID, front.processIdentifier != getpid() { previousApp = front }
        call(["op": op]) { [weak self] result in
            guard let self, requestToken == self.pillPlaceholderToken else { return }; self.edgeOpening = false
            if let placeholder { self.finishPillPlaceholder(placeholder,result) }
            if let mode=result?["mode"] as? String { self.shellMode=mode }
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
        let signature = (String(data: (try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])) ?? Data(), encoding: .utf8) ?? "") + (settings["accentColor"] as? String ?? "")
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
            if action == "reply" { button.contentTintColor=currentAccent }
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
    func shortcutLabel(_ value: String) -> String {
        return ["cmd-shift-y":"⌘⇧Y", "cmd-shift-u":"⌘⇧U", "ctrl-option-space":"⌃⌥Space", "option-space":"⌥Space"][value] ?? value
    }
    func registerShortcuts(_ triage: String, _ stock: String) {
        // Release both before registering so swapping their assignments works.
        if let hotKey { UnregisterEventHotKey(hotKey) }; hotKey = nil
        if let stockHotKey { UnregisterEventHotKey(stockHotKey) }; stockHotKey = nil
        func register(_ value: String, _ id: UInt32, _ ref: inout EventHotKeyRef?) -> Bool {
            let code = value == "cmd-shift-y" ? UInt32(kVK_ANSI_Y) : value == "cmd-shift-u" ? UInt32(kVK_ANSI_U) : UInt32(kVK_Space)
            let modifiers = value.hasPrefix("cmd-shift-") ? UInt32(cmdKey | shiftKey) : value == "option-space" ? UInt32(optionKey) : UInt32(controlKey | optionKey)
            return RegisterEventHotKey(code, modifiers, EventHotKeyID(signature: 0x504D4554, id: id), GetApplicationEventTarget(), 0, &ref) == noErr
        }
        hotKeyOK = register(triage, 1, &hotKey); stockHotKeyOK = register(stock, 2, &stockHotKey)
        shortcut = triage; stockShortcut = stock
    }
    func perform(_ op: String, workspace: String? = nil) {
        let optimistic=["toggle","queue"].contains(op) && (edgePanel?.isVisible == true || ["strip","hidden"].contains(shellMode))
        let placeholder=optimistic ? beginPillPlaceholder() : nil
        if !optimistic { dismissPillPlaceholder() }
        if op == "stock-toggle" { if stockToggleBusy { return }; stockToggleBusy = true }
        let visible = visibleApplications()
        if let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != slackPID, front.processIdentifier != getpid(), visible.contains(front.processIdentifier) {
            previousApp = front
        } else if previousApp == nil || !visible.contains(previousApp!.processIdentifier) {
            previousApp = visible.first.flatMap { NSRunningApplication(processIdentifier: $0) }
        }
        var request: [String: Any] = ["op": op]; if let workspace { request["workspaceId"] = workspace }
        call(request) { [weak self] result in
            guard let self else { return }
            if op == "stock-toggle" { self.stockToggleBusy = false }
            if let placeholder {
                guard placeholder == self.pillPlaceholderToken else { return }
                self.finishPillPlaceholder(placeholder,result)
            }
            if let mode=result?["mode"] as? String { self.shellMode=mode }
            guard let result else { return }
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
            let window = NSWindow(contentRect:NSRect(x:0,y:0,width:900,height:720),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
            window.contentMinSize=NSSize(width:820,height:420)
            window.title="Slack Triage Settings";window.isReleasedWhenClosed=false
            window.appearance=NSAppearance(named:.darkAqua)
            window.backgroundColor=NSColor(calibratedRed:0.078,green:0.098,blue:0.145,alpha:1)
            window.center();window.setFrameAutosaveName("SlackTriageSettings")
            if (window.contentView?.bounds.width ?? 0) < 820 { window.setContentSize(NSSize(width:900,height:max(420,window.contentView?.bounds.height ?? 720))) }
            settingsWindow=window
        }
        settingsSignature="";renderSettings();settingsWindow?.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
    }
    @objc func jumpToSettingsSection(_ sender: NSButton) {
        guard let scroll=settingsScrollView,let document=scroll.documentView,settingsSectionHeaders.indices.contains(sender.tag) else { return }
        document.layoutSubtreeIfNeeded()
        let header=settingsSectionHeaders[sender.tag]
        let top=document.convert(header.bounds,from:header).minY-20
        let offset=max(0,min(top,document.bounds.height-scroll.contentView.bounds.height))
        // Short final sections cannot always reach the top. Keep the clicked
        // section selected until the user scrolls away from this position.
        settingsJump=(sender.tag,offset)
        scroll.contentView.scroll(to:NSPoint(x:0,y:offset));scroll.reflectScrolledClipView(scroll.contentView)
        updateSettingsSection()
    }
    func updateSettingsSection() {
        guard let scroll=settingsScrollView,let document=scroll.documentView,!settingsSectionHeaders.isEmpty else { return }
        let offset=scroll.contentView.bounds.minY,maxOffset=max(0,document.bounds.height-scroll.contentView.bounds.height)
        var active=0
        if let jump=settingsJump,abs(jump.offset-offset)<1 { active=jump.index }
        else {
            settingsJump=nil
            for (index,header) in settingsSectionHeaders.enumerated() {
                if document.convert(header.bounds,from:header).minY<=offset+28 { active=index }
            }
            if maxOffset>0 && offset>=maxOffset-1 { active=settingsSectionHeaders.count-1 }
        }
        for (index,button) in settingsSectionButtons.enumerated() {
            button.font = .systemFont(ofSize:12,weight:index==active ? .bold : .regular)
            button.contentTintColor=index==active ? .labelColor : .secondaryLabelColor
            button.setAccessibilityValue(index==active ? "Current section" : "")
        }
    }
    func renderSettings() {
        guard let window=settingsWindow else { return }
        let data: [String:Any] = ["settings":settings,"backdrop":backdrop,"accentTheme":accentTheme,"workspaces":workspaces,"displays":displays,"inbox":inboxWorkspace ?? "","online":shellOnline,"saving":settingsSaving,"error":settingsError,"triageHotkey":hotKeyOK,"stockHotkey":stockHotKeyOK]
        let signature=String(data:(try? JSONSerialization.data(withJSONObject:data,options:[.sortedKeys])) ?? Data(),encoding:.utf8) ?? ""
        if signature == settingsSignature { return };settingsSignature=signature
        let oldOffset=settingsScrollView?.contentView.bounds.origin.y ?? 0
        for observer in settingsScrollObservers { NotificationCenter.default.removeObserver(observer) };settingsScrollObservers=[]
        settingsSectionHeaders=[];settingsSectionButtons=[];settingsJump=nil
        let content=NSView();window.contentView=content
        let sidebar=NSView();sidebar.translatesAutoresizingMaskIntoConstraints=false;sidebar.wantsLayer=true
        sidebar.layer?.backgroundColor=NSColor(calibratedRed:0.064,green:0.08,blue:0.12,alpha:1).cgColor;content.addSubview(sidebar)
        let navigation=NSStackView();navigation.orientation = .vertical;navigation.alignment = .leading;navigation.spacing=6;navigation.translatesAutoresizingMaskIntoConstraints=false;sidebar.addSubview(navigation)
        let scroll=NSScrollView();scroll.hasVerticalScroller=true;scroll.autohidesScrollers=true;scroll.drawsBackground=false;scroll.translatesAutoresizingMaskIntoConstraints=false;content.addSubview(scroll);settingsScrollView=scroll
        NSLayoutConstraint.activate([sidebar.leadingAnchor.constraint(equalTo:content.leadingAnchor),sidebar.topAnchor.constraint(equalTo:content.topAnchor),sidebar.bottomAnchor.constraint(equalTo:content.bottomAnchor),sidebar.widthAnchor.constraint(equalToConstant:180),navigation.leadingAnchor.constraint(equalTo:sidebar.leadingAnchor,constant:12),navigation.trailingAnchor.constraint(equalTo:sidebar.trailingAnchor,constant:-12),navigation.topAnchor.constraint(equalTo:sidebar.topAnchor,constant:20),scroll.leadingAnchor.constraint(equalTo:sidebar.trailingAnchor),scroll.trailingAnchor.constraint(equalTo:content.trailingAnchor),scroll.topAnchor.constraint(equalTo:content.topAnchor),scroll.bottomAnchor.constraint(equalTo:content.bottomAnchor)])
        let document=SettingsDocumentView();document.translatesAutoresizingMaskIntoConstraints=false;scroll.documentView=document
        let stack=NSStackView();stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=12
        stack.translatesAutoresizingMaskIntoConstraints=false;document.addSubview(stack)
        NSLayoutConstraint.activate([document.widthAnchor.constraint(equalTo:scroll.contentView.widthAnchor),stack.leadingAnchor.constraint(equalTo:document.leadingAnchor,constant:24),stack.trailingAnchor.constraint(equalTo:document.trailingAnchor,constant:-24),stack.topAnchor.constraint(equalTo:document.topAnchor,constant:20),stack.bottomAnchor.constraint(equalTo:document.bottomAnchor,constant:-24)])
        let enabled=shellOnline && !settingsSaving
        func label(_ text:String,heading:Bool=false)->NSTextField {
            let field=NSTextField(wrappingLabelWithString:text);field.font=heading ? .systemFont(ofSize:14,weight:.semibold) : .systemFont(ofSize:12)
            field.textColor=heading ? .labelColor : .secondaryLabelColor;return field
        }
        func note(_ text:String) { let field=label(text);stack.addArrangedSubview(field);field.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true }
        func section(_ title:String) {
            if !stack.arrangedSubviews.isEmpty { let divider=NSBox();divider.boxType = .separator;stack.addArrangedSubview(divider);divider.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true }
            let heading=label(title,heading:true);stack.addArrangedSubview(heading);settingsSectionHeaders.append(heading)
            let button=NSButton(title:title,target:self,action:#selector(jumpToSettingsSection(_:)))
            button.tag=settingsSectionButtons.count;button.isBordered=false;button.alignment = .left;button.setButtonType(.momentaryPushIn)
            button.font = .systemFont(ofSize:12);button.lineBreakMode = .byWordWrapping;button.cell?.wraps=true
            button.setAccessibilityLabel(title);button.setAccessibilityHelp("Jump to the \(title) section")
            navigation.addArrangedSubview(button);button.widthAnchor.constraint(equalTo:navigation.widthAnchor).isActive=true;button.heightAnchor.constraint(greaterThanOrEqualToConstant:34).isActive=true;settingsSectionButtons.append(button)
        }
        func popup(_ title:String,key:String,choices:[(String,Any)]) {
            let row=NSStackView();row.orientation = .horizontal;row.spacing=12;row.alignment = .centerY
            let name=label(title);name.widthAnchor.constraint(equalToConstant:230).isActive=true
            let control=NSPopUpButton();control.identifier=NSUserInterfaceItemIdentifier(key);control.target=self;control.action=#selector(changeSetting(_:));control.isEnabled=enabled
            control.setAccessibilityLabel(title);control.setContentHuggingPriority(.defaultLow,for:.horizontal)
            for (title,value) in choices {
                control.addItem(withTitle:title);control.lastItem?.representedObject=value
                if key == "shortcut" || key == "stockShortcut" { let other=settings[key == "shortcut" ? "stockShortcut" : "shortcut"] as? String;control.lastItem?.isEnabled = String(describing:value) != other }
            }
            control.menu?.autoenablesItems=false
            if let current=settings[key] { for (index,choice) in choices.enumerated() { if String(describing:choice.1) == String(describing:current) { control.selectItem(at:index) } } }
            row.addArrangedSubview(name);row.addArrangedSubview(control);stack.addArrangedSubview(row);row.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        }
        func checkbox(_ title:String,key:String,defaultValue:Bool=true) {
            let button=NSButton(checkboxWithTitle:title,target:self,action:#selector(changeSetting(_:)))
            button.identifier=NSUserInterfaceItemIdentifier(key);button.state=(settings[key] as? Bool ?? defaultValue) ? .on : .off;button.isEnabled=enabled;stack.addArrangedSubview(button)
        }
        section("Appearance & behavior")
        note("Accent color")
        let accentRow=NSStackView();accentRow.orientation = .horizontal;accentRow.spacing=10;accentRow.alignment = .centerY
        let selectedAccent=settings["accentColor"] as? String ?? "#bca9f0"
        let presets=[("Lavender","#bca9f0"),("Blue","#86b7ff"),("Teal","#65d6c1"),("Green","#a0d789"),("Amber","#efc477"),("Rose","#ed9cbd")]
        for (name,hex) in presets {
            let swatch=AccentSwatch(name:name,hex:hex);swatch.target=self;swatch.action=#selector(changeSetting(_:));swatch.isEnabled=enabled
            swatch.state=selectedAccent == hex ? .on : .off;swatch.setAccessibilityValue(swatch.state == .on ? 1 : 0)
            swatch.toolTip="\(name)\(name == "Lavender" ? " (default)" : "") · \(hex.uppercased())"
            accentRow.addArrangedSubview(swatch);swatch.widthAnchor.constraint(equalToConstant:34).isActive=true;swatch.heightAnchor.constraint(equalToConstant:34).isActive=true
        }
        let custom=NSButton(title:"Custom…",target:self,action:#selector(chooseCustomAccent));custom.bezelStyle = .rounded;custom.isEnabled=enabled
        custom.setAccessibilityLabel("Choose a custom accent color");accentRow.addArrangedSubview(custom)
        let colorLabel=label(selectedAccent.uppercased());colorLabel.setAccessibilityLabel("Current accent color: \(selectedAccent)");accentRow.addArrangedSubview(colorLabel)
        stack.addArrangedSubview(accentRow)
        note("Applies to triage, the pill, and embedded Slack views. Dark colors are lightened for text and indicators to keep them readable.")
        checkbox("Translucent inbox (experimental)",key:"inboxGlass",defaultValue:false)
        note("Keeps macOS background blur behind the inbox list, including when Slack is unfocused. Detail panes use a stronger background tint. The first activation enables Slack’s native transparency and needs a restart. Turning this off restores your previous preference. Respects Reduce Transparency.")
        let opacityRow=NSStackView();opacityRow.orientation = .horizontal;opacityRow.spacing=12;opacityRow.alignment = .centerY
        let opacityName=label("Background opacity");opacityRow.addArrangedSubview(opacityName)
        let opacity=NSSlider(value:Double(settings["inboxOpacity"] as? Int ?? 28),minValue:0,maxValue:100,target:self,action:#selector(changeSetting(_:)))
        opacity.identifier=NSUserInterfaceItemIdentifier("inboxOpacity");opacity.isContinuous=false
        opacity.isEnabled=enabled && (settings["inboxGlass"] as? Bool ?? false)
        opacity.setAccessibilityLabel("Inbox background opacity");opacity.toolTip="0% shows the most blur; 100% is opaque. Text and controls stay fully opaque."
        opacityRow.addArrangedSubview(opacity);opacity.widthAnchor.constraint(greaterThanOrEqualToConstant:140).isActive=true
        let opacityValue=label("\(settings["inboxOpacity"] as? Int ?? 28)%");opacityValue.alignment = .right;opacityValue.widthAnchor.constraint(equalToConstant:40).isActive=true;opacityRow.addArrangedSubview(opacityValue)
        stack.addArrangedSubview(opacityRow);opacityRow.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        note("Less opaque ← → More opaque. Adjusts the inbox background tint only; text and controls stay fully opaque. Applies when you release the slider.")
        let boostRow=NSStackView();boostRow.orientation = .horizontal;boostRow.spacing=12;boostRow.alignment = .centerY
        boostRow.addArrangedSubview(label("Detail opacity increase"))
        let boostValue=settings["detailOpacityBoost"] as? Int ?? 35
        let boost=NSSlider(value:Double(boostValue),minValue:0,maxValue:100,target:self,action:#selector(changeSetting(_:)))
        boost.identifier=NSUserInterfaceItemIdentifier("detailOpacityBoost");boost.isContinuous=false;boost.isEnabled=opacity.isEnabled
        boost.setAccessibilityLabel("Detail opacity increase in percentage points")
        boostRow.addArrangedSubview(boost);boost.widthAnchor.constraint(greaterThanOrEqualToConstant:100).isActive=true
        boostRow.addArrangedSubview(label("+\(boostValue) → \(min(100,(settings["inboxOpacity"] as? Int ?? 28)+boostValue))%"))
        stack.addArrangedSubview(boostRow);boostRow.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        note("Adds percentage points to the inbox opacity for conversations, threads, and other detail panes, capped at 100%. Composer controls and popups keep a solid background.")
        if backdrop["state"] as? String == "restart-required" {
            note("Restart Slack with your usual Pimp My Electron launcher to finish enabling translucency. The inbox stays opaque until then.")
        } else if backdrop["state"] as? String == "unavailable" {
            note("Native translucency is unavailable. The inbox stays opaque; turn this option off to retry restoring the native preference.")
        }
        note("Inbox density — choose a preview")
        let densityChoices=NSStackView();densityChoices.orientation = .horizontal;densityChoices.spacing=10;densityChoices.distribution = .fillEqually
        for (value,title,caption) in [("expanded","Expanded","Two-line previews"),("cozy","Cozy","One-line previews"),("compact","Compact","Names and status")] {
            let preview=InboxDensityPreview(density:value,title:title,caption:caption)
            preview.accent=currentAccent
            preview.target=self;preview.action=#selector(changeSetting(_:));preview.isEnabled=enabled
            preview.state=(settings["inboxDensity"] as? String ?? "expanded") == value ? .on : .off
            preview.setAccessibilityValue(preview.state == .on ? 1 : 0)
            densityChoices.addArrangedSubview(preview);preview.heightAnchor.constraint(equalToConstant:322).isActive=true
        }
        stack.addArrangedSubview(densityChoices);densityChoices.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        popup("Screen edge",key:"edge",choices:[("Left","left"),("Right","right")])
        var screens:[(String,Any)]=[("Main display","main")]
        for display in displays { if let id=display["id"] as? String { screens.append((display["name"] as? String ?? id,id)) } }
        popup("Display",key:"display",choices:screens)
        popup("When closing the inbox",key:"rest",choices:[("Edge strip","strip"),("Pill","cluster"),("Hidden","hidden")])
        popup("Shrink pill to edge strip after",key:"idleSeconds",choices:[("Never",0),("5 seconds",5),("15 seconds",15),("30 seconds",30),("1 minute",60),("5 minutes",300)])
        note("The idle timer only shrinks the pill. It never closes your inbox or an open conversation.")
        section("Triage notifications")
        popup("Workspaces shown in triage notifications",key:"notificationMode",choices:[("All connected workspaces","all"),("Choose workspaces…","selected"),("Follow the selected inbox workspace","inbox")])
        note("Controls the pill, its previews, and the menu count. Slack’s own notification preferences are unchanged. Following the inbox means its workspace selection, not All / Unread / Mentions / DMs / Threads.")
        let mode=settings["notificationMode"] as? String ?? "all",selected=settings["notificationWorkspaces"] as? [String] ?? [],inbox=inboxWorkspace
        for workspace in workspaces { if let id=workspace["id"] as? String {
            let button=NSButton(checkboxWithTitle:workspace["name"] as? String ?? id,target:self,action:#selector(changeSetting(_:)))
            button.identifier=NSUserInterfaceItemIdentifier("workspace:"+id);button.isEnabled=enabled && mode == "selected"
            button.state=(mode == "all" || mode == "selected" && selected.contains(id) || mode == "inbox" && (inbox == "*" || inbox == id)) ? .on : .off
            stack.addArrangedSubview(button)
        } }
        if workspaces.isEmpty { note("Connected workspaces will appear here.") }
        if mode == "selected" { note("Leave all workspaces unchecked to turn off triage notifications.") }
        checkbox("Expand the edge strip when new activity arrives",key:"expandOnActivity")
        note("Opens only the pill, without taking focus. Turn this off to keep the strip quiet while its unread dots continue to update.")
        section("Global shortcuts")
        let choices:[(String,Any)]=[("⌘⇧Y","cmd-shift-y"),("⌘⇧U","cmd-shift-u"),("⌃⌥Space","ctrl-option-space"),("⌥Space","option-space")]
        popup("Toggle triage shortcut",key:"shortcut",choices:choices)
        note(!shellOnline ? "Triage shortcut: controller disconnected." : hotKeyOK ? "Triage shortcut: registered globally." : "Triage shortcut: unavailable. Another app may be using it; choose a different combination.")
        popup("Normal Slack shortcut",key:"stockShortcut",choices:choices)
        note(!shellOnline ? "Normal Slack shortcut: controller disconnected." : stockHotKeyOK ? "Normal Slack shortcut: registered globally." : "Normal Slack shortcut: unavailable. Another app may be using it; choose a different combination.")
        note("Opens normal Slack from triage; then hides or restores its window. Each global action needs a different shortcut.")
        section("Keyboard reference")
        func shortcutRow(_ keys:String,_ text:String) {
            let row=NSStackView();row.orientation = .horizontal;row.spacing=16;row.alignment = .top
            let key=label(keys);key.font = .monospacedSystemFont(ofSize:12,weight:.medium);key.widthAnchor.constraint(equalToConstant:150).isActive=true
            let description=label(text);description.setContentHuggingPriority(.defaultLow,for:.horizontal)
            row.addArrangedSubview(key);row.addArrangedSubview(description);stack.addArrangedSubview(row);row.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        }
        shortcutRow("J / K · ↓ / ↑","Move between inbox rows")
        shortcutRow("0","Jump to the first inbox row")
        shortcutRow("1","Jump to the first unstarred row in the current filter")
        shortcutRow("H / L · ← / →","Cycle inbox filters")
        shortcutRow("Enter","Open the selected item and focus its composer")
        shortcutRow("X","Toggle the selected item read / unread")
        shortcutRow("N","Toggle the new-message composer")
        shortcutRow("/","Focus the conversation filter")
        shortcutRow("⇧/","Clear the conversation filter without moving focus")
        shortcutRow("⌘K","Search Slack and switch conversations")
        shortcutRow("⌥⇧↓ / ⌥⇧↑","Open the next / previous unread item")
        shortcutRow("F6 / ⇧F6","Cycle inbox, messages, and composer focus (Fn may be needed)")
        shortcutRow("Escape","Leave text focus first, then close the conversation, then collapse the inbox")
        note("Single-key shortcuts stay inactive while typing. In the conversation filter, Down Arrow moves into results. Dialogs handle Escape before the inbox.")
        let status=label(!shellOnline ? "Controller disconnected. Settings will be available after reconnecting." : settingsSaving ? "Saving…" : settingsError.isEmpty ? "Changes save automatically on this Mac." : settingsError)
        status.setAccessibilityIdentifier("settings-status");stack.addArrangedSubview(status);status.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        window.contentView?.layoutSubtreeIfNeeded()
        scroll.contentView.scroll(to:NSPoint(x:0,y:min(oldOffset,max(0,document.frame.height-scroll.contentSize.height))));scroll.reflectScrolledClipView(scroll.contentView)
        scroll.contentView.postsBoundsChangedNotifications=true;document.postsFrameChangedNotifications=true
        for (name,object) in [(NSView.boundsDidChangeNotification,scroll.contentView as NSView),(NSView.frameDidChangeNotification,document as NSView)] {
            settingsScrollObservers.append(NotificationCenter.default.addObserver(forName:name,object:object,queue:.main) { [weak self] _ in self?.updateSettingsSection() })
        }
        updateSettingsSection()
    }
    @objc func changeSetting(_ sender:NSControl) {
        guard shellOnline,!settingsSaving,let key=sender.identifier?.rawValue else { return }
        var patch:[String:Any]=[:]
        if key.hasPrefix("workspace:"),let button=sender as? NSButton {
            let id=String(key.dropFirst("workspace:".count));var ids=settings["notificationWorkspaces"] as? [String] ?? []
            ids.removeAll(where:{$0 == id});if button.state == .on { ids.append(id) };patch["notificationWorkspaces"]=ids
        } else if let popup=sender as? NSPopUpButton,let value=popup.selectedItem?.representedObject { patch[key]=value }
        else if let slider=sender as? NSSlider { patch[key]=Int(slider.doubleValue.rounded()) }
        else if let swatch=sender as? AccentSwatch { patch[key]=swatch.hex }
        else if let preview=sender as? InboxDensityPreview { patch[key]=preview.density }
        else if let button=sender as? NSButton { patch[key]=button.state == .on }
        saveSetting(patch)
    }
    @objc func chooseCustomAccent() {
        let panel=NSColorPanel.shared;panel.showsAlpha=false;panel.isContinuous=false
        panel.color=accentColor(settings["accentColor"] as? String)
        panel.setTarget(self);panel.setAction(#selector(customAccentChanged(_:)))
        panel.orderFront(nil)
    }
    @objc func customAccentChanged(_ panel:NSColorPanel) {
        guard shellOnline,let color=panel.color.usingColorSpace(.sRGB) else { return }
        func byte(_ component:CGFloat)->Int { Int((min(1,max(0,component))*255).rounded()) }
        let hex=String(format:"#%02x%02x%02x",byte(color.redComponent),byte(color.greenComponent),byte(color.blueComponent))
        if settingsSaving { pendingAccent=hex;return }
        saveSetting(["accentColor":hex])
    }
    func saveSetting(_ patch:[String:Any]) {
        guard !patch.isEmpty else { return };settingsSaving=true;settingsError="";renderSettings()
        call(["op":"settings","patch":patch]) { [weak self] result in
            guard let self else { return };self.settingsSaving=false
            if let updated=result?["settings"] as? [String:Any] { self.settings=updated } else { self.settingsError="Could not save. Please try again." }
            if let status=result?["backdrop"] as? [String:Any] { self.backdrop=status }
            if let theme=result?["accentTheme"] as? [String:String] { self.accentTheme=theme }
            self.renderSettings();self.refresh()
            if let next=self.pendingAccent { self.pendingAccent=nil;self.saveSetting(["accentColor":next]) }
        }
    }
    func menu(connected: Bool) {
        if trackingMenu { return }
        let menu = NSMenu();menu.delegate=self
        if !connected { let row = NSMenuItem(title:"Controller disconnected",action:nil,keyEquivalent:"");row.isEnabled=false;menu.addItem(row) }
        for (title,op) in [("Open inbox", "queue"),("Toggle triage (\(shortcutLabel(shortcut)))", "toggle"),("Return to work", "rest"),("Normal Slack (\(shortcutLabel(stockShortcut)))", "stock-toggle")] {
            let row = entry(title,data:["op":op]); row.isEnabled=connected; menu.addItem(row)
        }
        let windowActions=NSMenu()
        for (title,op) in [("Hide triage","hide"),("Minimize","minimize"),("Open normal Slack","stock")] { let row=entry(title,data:["op":op]);row.isEnabled=connected;windowActions.addItem(row) }
        let more=NSMenuItem(title:"More window actions",action:nil,keyEquivalent:"");more.submenu=windowActions;menu.addItem(more)
        menu.addItem(.separator())
        let preferences=NSMenuItem(title:"Settings…",action:#selector(openSettings),keyEquivalent:",");preferences.target=self;menu.addItem(preferences)
        if !workspaces.isEmpty { let sub=NSMenu();for ws in workspaces { if let id=ws["id"] as? String { let row=entry(ws["name"] as? String ?? id,data:["op":"switch","workspace":id]);row.isEnabled=ws["connected"] as? Bool == true;sub.addItem(row) } };let row=NSMenuItem(title:"Workspaces",action:nil,keyEquivalent:"");row.submenu=sub;menu.addItem(row) }
        menu.addItem(.separator());let quit=NSMenuItem(title:"Quit menu controller",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"");menu.addItem(quit);item.menu=menu
    }
    func menuWillOpen(_ menu: NSMenu) { trackingMenu=true }
    func menuDidClose(_ menu: NSMenu) { trackingMenu=false }
    func applicationWillTerminate(_ notification: Notification) { for observer in settingsScrollObservers { NotificationCenter.default.removeObserver(observer) };timer?.invalidate();edgeView?.cancelHover();edgePanel?.orderOut(nil);if let spaceObserver { NSWorkspace.shared.notificationCenter.removeObserver(spaceObserver) };if let hotKey { UnregisterEventHotKey(hotKey) };if let stockHotKey { UnregisterEventHotKey(stockHotKey) };if let handler { RemoveEventHandler(handler) } }
}
let app=NSApplication.shared
let controller=Controller(CommandLine.arguments.dropFirst().first ?? "")
app.delegate=controller
app.run()
