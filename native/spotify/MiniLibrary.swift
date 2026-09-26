import AppKit
import SwiftUI
import Combine
import Darwin

struct MusicItem:Identifiable {
    let uri:String,name:String,subtitle:String,type:String,image:String,uid:String
    let playable:Bool
    var id:String {uri+uid}
    var isSong:Bool {type=="track" || type=="episode"}
    init?(_ value:[String:Any]) {
        guard let uri=value["uri"] as? String,let name=value["name"] as? String else{return nil}
        self.uri=uri;self.name=name;subtitle=value["subtitle"] as? String ?? "";type=value["type"] as? String ?? "track";image=value["image"] as? String ?? "";uid=value["uid"] as? String ?? "";playable=value["playable"] as? Bool ?? true
    }
}
struct PlayerLayout:Equatable {
    var height:Double=280
    var expansion:Double=0
}
final class PlayerPresentation:ObservableObject {
    @Published var layout=PlayerLayout()
}
final class MiniLibrary:ObservableObject {
    @Published var view="library"
    @Published var expanded=false
    let presentation=PlayerPresentation()
    @Published var scope="all"
    @Published var query=""
    @Published var items:[MusicItem]=[]
    @Published var busy=false
    @Published var error=""
    @Published var notice=""
    @Published var collection:MusicItem?
    @Published var hasMore=false
    @Published var pinned=false
    var socketPath="",offset=0,generation=0
    var queryTask:DispatchWorkItem?
    var changed:(()->Void)?
    func select(_ target:String) {
        generation+=1;queryTask?.cancel()
        if expanded && view==target {expanded=false;changed?();return}
        expanded=true;view=target;collection=nil;query="";items=[];offset=0;error="";notice=""
        changed?();if expanded {load()}
    }
    func closeDetail()->Bool {
        if !query.isEmpty {query="";load();return true}
        if collection != nil {collection=nil;load();return true}
        if expanded {expanded=false;generation+=1;changed?();return true};return false
    }
    func open(_ item:MusicItem) {
        if item.isSong {play(item);return}
        if !["playlist","album","collection"].contains(item.type){return}
        collection=item;query="";view="library";expanded=true;load();changed?()
    }
    func searchChanged(){queryTask?.cancel();generation+=1;busy=true;let task=DispatchWorkItem{[weak self] in self?.load()};queryTask=task;DispatchQueue.main.asyncAfter(deadline:.now()+0.35,execute:task)}
    func load(more:Bool=false) {
        generation+=1;let ticket=generation;busy=true;error="";notice="";if !more {offset=0;items=[]}
        var request:[String:Any]=["offset":offset]
        if view=="search" {request["op"]="search";request["query"]=query}
        else if view=="queue" {request["op"]="queue"}
        else if let collection {request["op"]="collection";request["uri"]=collection.uri}
        else {request["op"]="library";request["scope"]=scope}
        send(request){ [weak self] result in
            guard let self,ticket==self.generation else{return};self.busy=false
            switch result {
            case .success(let value):let next=(value["items"] as? [[String:Any]] ?? []).compactMap(MusicItem.init);self.items=more ? self.items+next:next;self.offset+=30;self.hasMore=value["hasMore"] as? Bool ?? false
            case .failure(let e):self.error=e.localizedDescription;self.hasMore=false
            }
        }
    }
    func play(_ item:MusicItem) {
        var request:[String:Any]=["op":"play","uri":item.uri]
        if let collection {request["context"]=collection.uri;if !item.uid.isEmpty {request["uid"]=item.uid}}
        action(request,message:"Playing \(item.name)")
    }
    func enqueue(_ item:MusicItem){action(["op":"addqueue","uri":item.uri],message:"Added to queue")}
    func action(_ request:[String:Any],message:String){notice="";send(request){[weak self] result in switch result {case .success:self?.notice=message;self?.changed?();case .failure(let e):self?.error=e.localizedDescription}}}
    func send(_ request:[String:Any],completion:@escaping(Result<[String:Any],Error>)->Void) {
        let socket=socketPath
        DispatchQueue.global(qos:.userInitiated).async {
            let result:Result<[String:Any],Error>=Result{try Self.request(socket,request)}
            DispatchQueue.main.async{completion(result)}
        }
    }
    static func request(_ path:String,_ request:[String:Any]) throws->[String:Any] {
        func failure(_ message:String)->NSError {NSError(domain:"PME Spotify",code:1,userInfo:[NSLocalizedDescriptionKey:message])}
        guard !path.isEmpty,path.utf8.count<104 else{throw failure("Launch Spotify from PME to enable Mini Library.")}
        let fd=Darwin.socket(AF_UNIX,SOCK_STREAM,0);guard fd>=0 else{throw failure("Could not connect to Spotify.")};defer{Darwin.close(fd)}
        var timeout=timeval(tv_sec:14,tv_usec:0),noSignal:Int32=1
        setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&timeout,socklen_t(MemoryLayout<timeval>.size));setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&timeout,socklen_t(MemoryLayout<timeval>.size));setsockopt(fd,SOL_SOCKET,SO_NOSIGPIPE,&noSignal,socklen_t(MemoryLayout<Int32>.size))
        var address=sockaddr_un();address.sun_family=sa_family_t(AF_UNIX)
        withUnsafeMutableBytes(of:&address.sun_path){p in path.withCString{s in _=strcpy(p.baseAddress!.assumingMemoryBound(to:CChar.self),s)}}
        let connected=withUnsafePointer(to:&address){p in p.withMemoryRebound(to:sockaddr.self,capacity:1){Darwin.connect(fd,$0,socklen_t(MemoryLayout<sockaddr_un>.size))}}
        guard connected==0 else{throw failure("Quit Spotify, then launch it from PME to enable Mini Library.")}
        var data=try JSONSerialization.data(withJSONObject:request);data.append(10)
        try data.withUnsafeBytes{p in var sent=0;while sent<p.count {let n=Darwin.write(fd,p.baseAddress!.advanced(by:sent),p.count-sent);guard n>0 else{throw failure("Spotify connection interrupted.")};sent+=n}}
        var response=Data(),buffer=[UInt8](repeating:0,count:8192)
        while response.count<1024*1024 {let n=Darwin.read(fd,&buffer,buffer.count);if n==0 {break};guard n>0 else{throw failure("Spotify took too long to respond. Try again.")};response.append(contentsOf:buffer.prefix(n))}
        guard let result=(try JSONSerialization.jsonObject(with:response)) as? [String:Any] else{throw failure("Spotify returned an invalid response.")}
        guard result["ok"] as? Bool==true else{throw failure(result["error"] as? String ?? "Spotify could not complete that action.")}
        return result["result"] as? [String:Any] ?? [:]
    }
}
final class LibraryCoverModel:ObservableObject {
    @Published var image:NSImage?
    let loader=ArtworkLoader()
    init(){loader.loaded={[weak self] _,image in self?.image=image}}
}
struct LibraryCover:View {
    let url:String,type:String
    @StateObject var model=LibraryCoverModel()
    var body:some View {ZStack {
        RoundedRectangle(cornerRadius:7).fill(Color.white.opacity(0.07))
        if let image=model.image {Image(nsImage:image).resizable().scaledToFill()}else{Image(systemName:type=="collection" ? "heart.fill":"music.note").foregroundStyle(Color(red:0.39,green:0.87,blue:0.57))}
    }.frame(width:38,height:38).clipShape(RoundedRectangle(cornerRadius:7)).onAppear{model.loader.load(url)}.onChange(of:url){model.loader.load($0)}}
}
struct LibraryPanel:View {
    @ObservedObject var model:MiniLibrary
    let green=Color(red:0.39,green:0.87,blue:0.57)
    var body:some View {
        VStack(spacing:0){
            HStack(spacing:4){ForEach([("library","books.vertical","Library"),("search","magnifyingglass","Search"),("queue","list.bullet","Queue")],id:\.0){value in
                Button{model.select(value.0)}label:{Label(value.2,systemImage:value.1).font(.system(size:12,weight:.medium)).frame(maxWidth:.infinity).padding(.vertical,8).background(model.expanded && model.view==value.0 ? green.opacity(0.12):Color.clear,in:RoundedRectangle(cornerRadius:8)).foregroundStyle(model.expanded && model.view==value.0 ? green:Color.secondary)}.buttonStyle(.plain)
            }}.padding(.horizontal,14)
            LibraryReveal(model:model,presentation:model.presentation)
        }
    }
}
struct LibraryReveal:View {
    @ObservedObject var model:MiniLibrary
    @ObservedObject var presentation:PlayerPresentation
    var body:some View {
        GeometryReader { _ in LibraryDetail(model:model) }
            .clipped().opacity(presentation.layout.expansion).allowsHitTesting(model.expanded).accessibilityHidden(!model.expanded)
    }
}
// Playback transition ticks only invalidate the reveal wrapper, not every row.
struct LibraryDetail:View {
    @ObservedObject var model:MiniLibrary
    let green=Color(red:0.39,green:0.87,blue:0.57)
    var body:some View {
        VStack(spacing:0) {
                Divider().padding(.top,5)
                VStack(alignment:.leading,spacing:10){
                    if model.view=="search" {TextField("Songs, albums, playlists…",text:$model.query).textFieldStyle(.roundedBorder).onChange(of:model.query){_ in model.searchChanged()}}
                    if model.view=="library",model.collection==nil {HStack(spacing:4){ForEach([("all","All"),("playlists","Playlists"),("albums","Albums"),("liked","Liked songs")],id:\.0){scope in Button(scope.1){model.scope=scope.0;model.load()}.font(.system(size:11)).buttonStyle(.plain).padding(7).background(model.scope==scope.0 ? Color.white.opacity(0.12):Color.clear,in:Capsule())}}}
                    if let collection=model.collection {HStack{Button{model.collection=nil;model.load()}label:{Image(systemName:"chevron.left")}.buttonStyle(.plain).help("Back to library");Text(collection.name).font(.system(size:13,weight:.semibold)).lineLimit(1);Spacer()}}
                    if !model.error.isEmpty {VStack(alignment:.leading,spacing:6){Text(model.error).font(.system(size:12)).foregroundStyle(Color.orange);Button("Try again"){model.load()}.buttonStyle(.plain).foregroundStyle(green)}}
                    ScrollView {
                        VStack(spacing:0) {
                        LazyVStack(spacing:3){ForEach(model.items){item in
                            HStack(spacing:5){Button{model.open(item)}label:{HStack(spacing:10){LibraryCover(url:item.image.isEmpty ? (model.collection?.image ?? ""):item.image,type:item.type);VStack(alignment:.leading,spacing:3){Text(item.name).font(.system(size:13,weight:.medium)).lineLimit(1);Text(item.subtitle).font(.system(size:11)).foregroundStyle(.secondary).lineLimit(1)}.frame(maxWidth:.infinity,alignment:.leading);if !item.isSong {Image(systemName:"chevron.right").font(.system(size:10)).foregroundStyle(.secondary)}}.padding(.vertical,5).contentShape(Rectangle())}.buttonStyle(.plain).disabled(!item.playable)
                                if item.isSong {Button{model.enqueue(item)}label:{Image(systemName:"text.badge.plus").frame(width:28,height:32)}.buttonStyle(.plain).help("Add to queue").accessibilityLabel("Add \(item.name) to queue")}
                            }
                        }
                        if model.busy {ProgressView().controlSize(.small).padding(12)}
                        else if model.hasMore {Button("Load more"){model.load(more:true)}.buttonStyle(.plain).foregroundStyle(green).padding(10)}
                        else if model.items.isEmpty && model.error.isEmpty {Text(model.view=="search" && model.query.isEmpty ? "Find your next listen":"Nothing here yet").font(.system(size:12)).foregroundStyle(.secondary).padding(20)}
                        }.padding(.trailing,22).background(LibraryScrollChrome())
                    }.padding(.trailing,-14)}.id(model.view+model.scope+(model.collection?.uri ?? "")+model.query).frame(maxHeight:.infinity)
                    if !model.notice.isEmpty {Text(model.notice).font(.system(size:11)).foregroundStyle(green).lineLimit(1)}
                }.padding(14).frame(maxWidth:.infinity,maxHeight:.infinity)
            }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.top)

    }
}

// Keep native wheel, momentum, accessibility and thumb dragging. The reserved
// content gutter also protects row actions when macOS shows legacy scrollbars.
final class LibraryScroller:NSScroller {
    private var fade:DispatchWorkItem?
    var trackingThumb=false
    func revealBriefly(){
        fade?.cancel();alphaValue=1
        let work=DispatchWorkItem{[weak self] in
            guard let self,!self.trackingThumb else{return}
            NSAnimationContext.runAnimationGroup{context in
                context.duration=NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 0:0.2
                self.animator().alphaValue=0
            }
        }
        fade=work;DispatchQueue.main.asyncAfter(deadline:.now()+1.0,execute:work)
    }
    override func trackKnob(with event:NSEvent){
        trackingThumb=true;revealBriefly();super.trackKnob(with:event)
        trackingThumb=false;revealBriefly()
    }
    deinit {fade?.cancel()}
    override func drawKnob() {
        let knob=rect(for:.knob)
        guard knob.height>0 else{return}
        let slim=NSRect(x:knob.maxX-6,y:knob.minY+1,width:4,height:max(0,knob.height-2))
        NSColor.white.withAlphaComponent(NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast ? 0.7:0.28).setFill()
        NSBezierPath(roundedRect:slim,xRadius:2,yRadius:2).fill()
    }
    override func drawKnobSlot(in slotRect:NSRect,highlight flag:Bool) {}
}
// Filter the content underneath without a material's tint or saturation change.
// A transparent-to-opaque mask grades the effect; they never intercept input.
final class LibraryEdgeBlur:NSView {
    static let height:CGFloat=32
    private let gradient=CAGradientLayer()
    init(top:Bool){
        super.init(frame:.zero)
        wantsLayer=true
        if let blur=CIFilter(name:"CIGaussianBlur",parameters:[kCIInputRadiusKey:4]) {backgroundFilters=[blur]}
        gradient.colors=[NSColor.white.withAlphaComponent(top ? 0:1).cgColor,NSColor.white.withAlphaComponent(top ? 1:0).cgColor]
        gradient.startPoint=CGPoint(x:0.5,y:0);gradient.endPoint=CGPoint(x:0.5,y:1)
        layer?.mask=gradient;layer?.masksToBounds=true
        setAccessibilityElement(false)
    }
    override func layout(){
        super.layout();CATransaction.begin();CATransaction.setDisableActions(true)
        gradient.frame=bounds;CATransaction.commit()
    }
    required init?(coder:NSCoder){fatalError("init(coder:) has not been implemented")}
    override func hitTest(_ point:NSPoint)->NSView? {nil}
}
struct LibraryScrollChrome:NSViewRepresentable {
    final class Anchor:NSView {
        weak var observedScroll:NSScrollView?
        private var observers=[NSObjectProtocol]()
        private var lastOrigin:NSPoint?
        private let top=LibraryEdgeBlur(top:true),bottom=LibraryEdgeBlur(top:false)
        override func viewDidMoveToWindow(){super.viewDidMoveToWindow();if window==nil {detach()}else{install()}}
        override func viewDidMoveToSuperview(){super.viewDidMoveToSuperview();install()}
        func detach(){
            observers.forEach{NotificationCenter.default.removeObserver($0)};observers=[]
            top.removeFromSuperview();bottom.removeFromSuperview();observedScroll=nil;lastOrigin=nil
        }
        deinit {observers.forEach{NotificationCenter.default.removeObserver($0)}}
        func refresh(){
            guard let scroll=observedScroll,let document=scroll.documentView else{return}
            let visible=scroll.documentVisibleRect,bounds=document.bounds
            if let previous=lastOrigin,abs(previous.y-visible.origin.y)>0.5 {(scroll.verticalScroller as? LibraryScroller)?.revealBriefly()}
            lastOrigin=visible.origin
            let viewport=scroll.convert(scroll.contentView.bounds,from:scroll.contentView)
            let height=min(LibraryEdgeBlur.height,viewport.height/2)
            top.frame=NSRect(x:viewport.minX,y:scroll.isFlipped ? viewport.minY:viewport.maxY-height,width:viewport.width,height:height)
            bottom.frame=NSRect(x:viewport.minX,y:scroll.isFlipped ? viewport.maxY-height:viewport.minY,width:viewport.width,height:height)
            let before=visible.minY>bounds.minY+1,after=visible.maxY<bounds.maxY-1
            top.isHidden = !(document.isFlipped ? before:after)
            bottom.isHidden = !(document.isFlipped ? after:before)
        }
        func install(){
            // SwiftUI attaches its scroll hierarchy after creating the content.
            DispatchQueue.main.async{[weak self] in
                guard let self,self.window != nil,let scroll=self.enclosingScrollView else{return}
                if self.observedScroll===scroll {self.refresh();return}
                self.detach();self.observedScroll=scroll
                let scroller=LibraryScroller();scroller.controlSize = .small;scroller.alphaValue=0
                scroll.verticalScroller=scroller
                // A separate lane prevents even the thumb's hit target from
                // covering an action. Draw only a slim thumb, without a track.
                scroll.scrollerStyle = .legacy
                scroll.autohidesScrollers=true
                scroll.reflectScrolledClipView(scroll.contentView)
                scroll.addSubview(self.top);scroll.addSubview(self.bottom)
                scroll.contentView.postsBoundsChangedNotifications=true
                scroll.contentView.postsFrameChangedNotifications=true
                scroll.documentView?.postsFrameChangedNotifications=true
                for (name,object) in [(NSView.boundsDidChangeNotification,scroll.contentView),(NSView.frameDidChangeNotification,scroll.contentView),(NSView.frameDidChangeNotification,scroll.documentView)] {
                    guard let object else{continue}
                    self.observers.append(NotificationCenter.default.addObserver(forName:name,object:object,queue:.main){[weak self] _ in self?.refresh()})
                }
                self.refresh()
            }
        }
    }
    func makeNSView(context:Context)->Anchor {Anchor()}
    func updateNSView(_ view:Anchor,context:Context){view.install()}
    static func dismantleNSView(_ view:Anchor,coordinator:()){view.detach()}
}
