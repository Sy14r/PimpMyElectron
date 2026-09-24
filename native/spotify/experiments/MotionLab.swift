// Isolated native comparison using the real player views and a local fixture.
// Build script removes the production entry point and replaces only transport.
final class MotionFixture {
    static var matchedHeader=false
    static let cover:NSImage = {
        let image=NSImage(size:NSSize(width:256,height:256));image.lockFocus()
        NSGradient(colors:[NSColor.systemIndigo,NSColor.systemOrange])!.draw(in:NSRect(x:0,y:0,width:256,height:256),angle:35)
        NSColor(white:1,alpha:0.8).setStroke();let ring=NSBezierPath(ovalIn:NSRect(x:40,y:40,width:176,height:176));ring.lineWidth=3;ring.stroke()
        ("PME" as NSString).draw(at:NSPoint(x:62,y:102),withAttributes:[.font:NSFont.systemFont(ofSize:48,weight:.black),.foregroundColor:NSColor.white]);image.unlockFocus();return image
    }()
    static func reply(_ request:[String:Any])->[String:Any] {
        let items=(1...18).map{["uri":"spotify:track:\($0)","name":"Sample track \($0)","subtitle":"Motion study · Local fixture","type":"track","image":"","playable":true] as [String:Any]}
        return ["items":items,"hasMore":false]
    }
    static func player()->Player {
        let model=Player();model.title="A Long Song Title That Wraps Onto Two Lines";model.artist="The Motion Study";model.album="Same artwork. Same content.";model.artwork=cover;model.ready=true;model.playing=true;model.duration=240;model.position=93;model.modesReady=true;model.canShuffle=true;model.canRepeatContext=true;model.canRepeatTrack=true
        AtmosphereRenderer.prepare(cover,key:"motion-fixture"){model.atmosphere=$0};return model
    }
}
struct MotionMatchedHeader:View {
    @ObservedObject var model:Player
    let expanded:Bool
    @Namespace private var space
    func cover(_ size:CGFloat)->some View {Image(nsImage:MotionFixture.cover).resizable().scaledToFill().matchedGeometryEffect(id:"cover",in:space).frame(width:size,height:size).clipShape(RoundedRectangle(cornerRadius:10))}
    func text(_ width:CGFloat)->some View {VStack(alignment:.leading,spacing:4){Text(model.title).font(.system(size:15,weight:.semibold)).lineLimit(2).fixedSize(horizontal:false,vertical:true);Text(model.artist).font(.system(size:12)).foregroundStyle(.secondary).lineLimit(1);Text(model.album).font(.system(size:11)).foregroundStyle(.secondary).lineLimit(1)}.frame(width:width,alignment:.leading).matchedGeometryEffect(id:"metadata",in:space,properties:.position)}
    var body:some View {Group {if expanded {HStack(spacing:15){cover(48);text(305)}}else{HStack(spacing:15){cover(86);text(267)}}}.frame(height:expanded ? 70:86).frame(maxWidth:.infinity,alignment:.leading)}
}
struct MotionShape:Shape {
    var pointerX:CGFloat
    func path(in rect:CGRect)->Path {
        var p=Path(roundedRect:CGRect(x:0,y:10,width:rect.width,height:max(0,rect.height-10)),cornerRadius:18)
        let x=min(rect.width-25,max(25,pointerX));p.move(to:CGPoint(x:x-11,y:11));p.addLine(to:CGPoint(x:x,y:0));p.addLine(to:CGPoint(x:x+11,y:11));p.closeSubpath();return p
    }
}
final class MotionPanel:NSPanel {
    override var canBecomeKey:Bool {true}
    override var canBecomeMain:Bool {false}
}
struct MotionFrameReport:AnimatableModifier {
    var height:CGFloat
    let report:(CGFloat)->Void
    var animatableData:CGFloat {get{height}set{height=newValue}}
    func body(content:Content)->some View {let value=height;DispatchQueue.main.async{report(value)};return content}
}
struct FixedMotionSurface:View {
    @ObservedObject var model:Player
    @ObservedObject var presentation:PlayerPresentation
    let pointerX:CGFloat
    let report:(CGFloat)->Void
    init(model:Player,pointerX:CGFloat,report:@escaping(CGFloat)->Void){self.model=model;presentation=model.library.presentation;self.pointerX=pointerX;self.report=report}
    var body:some View {
        VStack(spacing:0){Color.clear.frame(height:10);PlayerWidget(model:model)}
            .background(PlayerFrameBackground(model:model))
            .clipShape(MotionShape(pointerX:pointerX))
            .modifier(MotionFrameReport(height:presentation.layout.height+10,report:report))
            .shadow(color:.black.opacity(0.28),radius:9,y:4)
            .padding(16).frame(width:432,height:682,alignment:.top)
    }
}
struct MotionDashboard:View {
    @ObservedObject var lab:MotionLab
    var body:some View {
        VStack(alignment:.leading,spacing:16){
            Text("Player motion lab").font(.title2.bold())
            Text("Same local artwork and long title. This app never connects to Spotify.").foregroundStyle(.secondary)
            HStack {Button("A · Current popover"){lab.open(.baseline)};Button("B · Auto-animation off"){lab.open(.manual)};Button("C · Fixed window"){lab.open(.fixed)}}
            HStack{Button("Run measured comparison"){lab.compare()};Button("Reverse mid-transition"){lab.reverse()};Button("Toggle tab"){lab.toggle()};Button("Close preview"){lab.closePreview()}}
            Text(lab.status).font(.system(size:12,design:.monospaced)).textSelection(.enabled).frame(maxWidth:.infinity,alignment:.leading)
            Text("Use Motion Lab in the menu bar to choose A, B, or C. Try Search typing, the settings gear, and clicking outside the visible player.").font(.callout).foregroundStyle(.secondary)
            HStack {Button("Place click-through test target"){lab.placeTarget()};Spacer();Toggle("Reduce Motion in lab",isOn:$lab.reduced).toggleStyle(.switch)}
        }.padding(24).frame(width:780)
    }
}
struct MotionTarget:View {
    @ObservedObject var lab:MotionLab
    var body:some View {Button("Received clicks: \(lab.clicks)"){lab.clicks+=1}.padding(20).frame(width:180,height:90)}
}
final class MotionLab:NSObject,NSApplicationDelegate,ObservableObject {
    enum Mode:String {case baseline="A · Current popover",manual="B · Auto-animation off",fixed="C · Fixed window"}
    @Published var status="Choose a mode, or run the measured comparison."
    @Published var clicks=0
    @Published var reduced=false
    var model=MotionFixture.player(),mode=Mode.baseline,item:NSStatusItem!,dashboard:NSWindow!,popover:NSPopover?,panel:MotionPanel?,targetWindow:NSWindow?
    var driver:Timer?,sampler:Timer?,pointerTimer:Timer?,localMonitor:Any?,globalMonitor:Any?,keyMonitor:Any?
    var generation=0,requested=280.0,visibleHeight=290.0,started=0.0,chrome=0.0,samples=[[String:Double]](),results=[[String:Any]]()
    let output=URL(fileURLWithPath:CommandLine.arguments.dropFirst().first ?? NSTemporaryDirectory()+"pme-motion-results.json")
    func applicationDidFinishLaunching(_ notification:Notification){
        item=NSStatusBar.system.statusItem(withLength:NSStatusItem.variableLength);item.button?.title="Motion Lab";item.button?.toolTip="Choose a motion comparison"
        let choices=NSMenu()
        for (tag,title) in [Mode.baseline,Mode.manual,Mode.fixed].enumerated(){let choice=NSMenuItem(title:title.rawValue,action:#selector(chooseMode(_:)),keyEquivalent:"");choice.target=self;choice.tag=tag;choices.addItem(choice)}
        choices.addItem(.separator());let controls=NSMenuItem(title:"Show comparison controls",action:#selector(showControls),keyEquivalent:"");controls.target=self;choices.addItem(controls);choices.addItem(withTitle:"Quit Motion Lab",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"");item.menu=choices
        dashboard=NSWindow(contentRect:NSRect(x:0,y:0,width:828,height:280),styleMask:[.titled,.closable,.miniaturizable],backing:.buffered,defer:false);dashboard.title="PME Motion Lab";dashboard.contentView=NSHostingView(rootView:MotionDashboard(lab:self));dashboard.center();dashboard.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
        let menu=NSMenu(),entry=NSMenuItem();menu.addItem(entry);entry.submenu=NSMenu();entry.submenu?.addItem(withTitle:"Quit Motion Lab",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q");NSApp.mainMenu=menu
        pointerTimer=Timer(timeInterval:1.0/60,repeats:true){[weak self] _ in self?.updatePointer()};RunLoop.main.add(pointerTimer!,forMode:.common)
        globalMonitor=NSEvent.addGlobalMonitorForEvents(matching:.leftMouseDown){[weak self] _ in self?.outsideClick()}
        localMonitor=NSEvent.addLocalMonitorForEvents(matching:.leftMouseDown){[weak self] event in if event.window===self?.dashboard {return event};self?.outsideClick();return event}
        keyMonitor=NSEvent.addLocalMonitorForEvents(matching:.keyDown){[weak self] event in guard event.keyCode==53,let self,self.isShown else{return event};if self.model.settingsOpen {self.model.settingsOpen=false}else if !self.model.library.closeDetail(){self.closePreview()};return nil}
    }
    var isShown:Bool {popover?.isShown==true || panel?.isVisible==true}
    @objc func chooseMode(_ sender:NSMenuItem){open([Mode.baseline,Mode.manual,Mode.fixed][sender.tag])}
    @objc func showControls(){dashboard.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)}
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool {showControls();return true}
    @objc func reopen(){if isShown {closePreview()}else{open(mode)}}
    func closePreview(){driver?.invalidate();driver=nil;popover?.close();panel?.orderOut(nil)}
    func open(_ target:Mode){
        closePreview();mode=target;for (index,choice) in (item.menu?.items.prefix(3) ?? []).enumerated(){choice.state = [Mode.baseline,Mode.manual,Mode.fixed][index]==target ? .on:.off};MotionFixture.matchedHeader=target == .fixed;model=MotionFixture.player();requested=280;visibleHeight=290
        model.action={[weak self] action in guard let self else{return};if action=="close"{self.closePreview()}else if action=="playpause" {self.model.playing.toggle()}}
        model.library.changed={[weak self] in self?.resize()}
        guard let button=item.button else{return}
        if target != .fixed {
            panel=nil;let pop=NSPopover();let vc=NSViewController();vc.view=HoverHost(rootView:PlayerWidget(model:model));pop.contentViewController=vc;pop.contentSize=NSSize(width:400,height:280);pop.animates=target == .baseline;pop.behavior = .applicationDefined;pop.appearance=NSAppearance(named:.darkAqua);popover=pop;pop.show(relativeTo:button.bounds,of:button,preferredEdge:.minY);pop.contentViewController?.view.window?.title=target.rawValue
        }else{
            popover=nil;let anchor=button.window!.convertToScreen(button.convert(button.bounds,to:nil)),screen=button.window!.screen!.visibleFrame
            let width:CGFloat=432,height:CGFloat=682,x=min(screen.maxX-width,max(screen.minX,anchor.midX-width/2)),top=anchor.minY+16
            let panel=MotionPanel(contentRect:NSRect(x:x,y:max(screen.minY,top-height),width:width,height:height),styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false);panel.isOpaque=false;panel.backgroundColor = .clear;panel.hasShadow=false;panel.level = .statusBar;panel.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary];panel.isReleasedWhenClosed=false;panel.title=target.rawValue
            let host=NSHostingView(rootView:FixedMotionSurface(model:model,pointerX:anchor.midX-x-16,report:{[weak self] height in self?.visibleHeight=height;self?.updatePointer()}));host.sizingOptions=[];host.frame=NSRect(x:0,y:0,width:width,height:height);panel.contentView=host;self.panel=panel;panel.orderFrontRegardless();panel.makeKey()
        }
        status="\(target.rawValue) — expand/collapse with a tab."
    }
    func placeTarget(){
        guard let panel else{return}
        let window=NSWindow(contentRect:NSRect(x:panel.frame.midX-90,y:panel.frame.maxY-570,width:180,height:90),styleMask:[.titled,.closable],backing:.buffered,defer:false)
        window.title="Click-through test";window.isReleasedWhenClosed=false
        window.contentView=NSHostingView(rootView:MotionTarget(lab:self));targetWindow=window;window.orderFront(nil)
    }
    func toggle(){model.library.select("library")}
    func resize(){
        let start=model.library.presentation.layout,target=PlayerLayout(height:model.library.expanded ? 640:280,expansion:model.library.expanded ? 1:0)
        driver?.invalidate();requested=target.height
        if mode == .fixed {
            if reduced || NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {model.library.presentation.layout=target;visibleHeight=target.height+10}
            else{withAnimation(.easeInOut(duration:0.24)){model.library.presentation.layout=target}}
            panel?.makeKey();return
        }
        let began=ProcessInfo.processInfo.systemUptime
        if reduced {model.library.presentation.layout=target;popover?.contentSize=NSSize(width:400,height:target.height);return}
        driver=Timer(timeInterval:1.0/60,repeats:true){[weak self] timer in guard let self else{return};let t=min(1,(ProcessInfo.processInfo.systemUptime-began)/0.24),e=t*t*(3-2*t),layout=PlayerLayout(height:start.height+(target.height-start.height)*e,expansion:start.expansion+(target.expansion-start.expansion)*e);self.model.library.presentation.layout=layout;self.requested=layout.height;self.popover?.contentSize=NSSize(width:400,height:layout.height);if t>=1{timer.invalidate();self.driver=nil}}
        RunLoop.main.add(driver!,forMode:.common)
    }
    func updatePointer(){
        guard let panel,panel.isVisible else{return}
        let body=NSRect(x:panel.frame.minX+16,y:panel.frame.maxY-16-visibleHeight,width:400,height:visibleHeight)
        // Native pass-through, without synthetic event replay or input permissions.
        panel.ignoresMouseEvents = !body.contains(NSEvent.mouseLocation)
    }
    func outsideClick(){guard isShown,!model.settingsOpen else{return};if let panel {let visible=NSRect(x:panel.frame.minX+16,y:panel.frame.maxY-16-visibleHeight,width:400,height:visibleHeight);if !visible.contains(NSEvent.mouseLocation){closePreview()}}else if let w=popover?.contentViewController?.view.window,!w.frame.contains(NSEvent.mouseLocation){closePreview()}}
    func reverse(){toggle();DispatchQueue.main.asyncAfter(deadline:.now()+0.10){self.toggle()};DispatchQueue.main.asyncAfter(deadline:.now()+0.18){self.toggle()}}
    func compare(){generation+=1;results=[];measure(0,generation)}
    func measure(_ index:Int,_ ticket:Int){
        guard ticket==generation else{return};let modes:[Mode]=[.baseline,.manual,.fixed]
        guard index<modes.count else{writeResults();return}
        open(modes[index]);status="Measuring \(mode.rawValue)…"
        DispatchQueue.main.asyncAfter(deadline:.now()+0.65){guard ticket==self.generation else{return};self.started=ProcessInfo.processInfo.systemUptime;self.samples=[];self.chrome=(self.popover?.contentViewController?.view.window?.frame.height ?? 280)-280
            self.sampler=Timer(timeInterval:1.0/120,repeats:true){[weak self] _ in guard let self else{return};let frame=self.panel?.frame ?? self.popover?.contentViewController?.view.window?.frame ?? .zero;self.samples.append(["t":ProcessInfo.processInfo.systemUptime-self.started,"requested":self.requested,"windowHeight":frame.height,"contentHeight":self.panel == nil ? frame.height-self.chrome:frame.height])};RunLoop.main.add(self.sampler!,forMode:.common);self.toggle()
            DispatchQueue.main.asyncAfter(deadline:.now()+0.85){guard ticket==self.generation else{return};self.toggle()}
            DispatchQueue.main.asyncAfter(deadline:.now()+1.7){guard ticket==self.generation else{return};self.sampler?.invalidate();self.results.append(["mode":self.mode.rawValue,"samples":self.samples]);self.measure(index+1,ticket)}
        }
    }
    func writeResults(){
        let report:[String:Any]=["note":"Native window geometry sampling; not rendered-frame or GPU timing.","results":results]
        if let data=try? JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]){try? data.write(to:output)}
        status="Comparison saved to \(output.path)\nC remains available for manual review. Geometry samples do not measure rendered FPS."
    }
}
let motionApp=NSApplication.shared,motionDelegate=MotionLab();motionApp.delegate=motionDelegate;motionApp.setActivationPolicy(.regular);motionApp.run()
