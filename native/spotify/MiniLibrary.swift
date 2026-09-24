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
final class MiniLibrary:ObservableObject {
    @Published var view=""
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
    var expanded:Bool {!view.isEmpty}
    func select(_ target:String) {
        generation+=1;queryTask?.cancel();view=view==target ? "":target;collection=nil;query="";items=[];offset=0;error="";notice=""
        changed?();if expanded {load()}
    }
    func closeDetail()->Bool {
        if !query.isEmpty {query="";load();return true}
        if collection != nil {collection=nil;load();return true}
        if expanded {view="";generation+=1;changed?();return true};return false
    }
    func open(_ item:MusicItem) {
        if item.isSong {play(item);return}
        if !["playlist","album","collection"].contains(item.type){return}
        collection=item;query="";view="library";load();changed?()
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
                Button{model.select(value.0)}label:{Label(value.2,systemImage:value.1).font(.system(size:12,weight:.medium)).frame(maxWidth:.infinity).padding(.vertical,8).background(model.view==value.0 ? green.opacity(0.12):Color.clear,in:RoundedRectangle(cornerRadius:8)).foregroundStyle(model.view==value.0 ? green:Color.secondary)}.buttonStyle(.plain)
            }}.padding(.horizontal,14)
            if model.expanded {
                Divider().padding(.top,5)
                VStack(alignment:.leading,spacing:10){
                    if model.view=="search" {TextField("Songs, albums, playlists…",text:$model.query).textFieldStyle(.roundedBorder).onChange(of:model.query){_ in model.searchChanged()}}
                    if model.view=="library",model.collection==nil {HStack(spacing:4){ForEach([("all","All"),("playlists","Playlists"),("albums","Albums"),("liked","Liked songs")],id:\.0){scope in Button(scope.1){model.scope=scope.0;model.load()}.font(.system(size:11)).buttonStyle(.plain).padding(7).background(model.scope==scope.0 ? Color.white.opacity(0.12):Color.clear,in:Capsule())}}}
                    if let collection=model.collection {HStack{Button{model.collection=nil;model.load()}label:{Image(systemName:"chevron.left")}.buttonStyle(.plain).help("Back to library");Text(collection.name).font(.system(size:13,weight:.semibold)).lineLimit(1);Spacer()}}
                    if !model.error.isEmpty {VStack(alignment:.leading,spacing:6){Text(model.error).font(.system(size:12)).foregroundStyle(Color.orange);Button("Try again"){model.load()}.buttonStyle(.plain).foregroundStyle(green)}}
                    ScrollView {
                        LazyVStack(spacing:3){ForEach(model.items){item in
                            HStack(spacing:5){Button{model.open(item)}label:{HStack(spacing:10){LibraryCover(url:item.image.isEmpty ? (model.collection?.image ?? ""):item.image,type:item.type);VStack(alignment:.leading,spacing:3){Text(item.name).font(.system(size:13,weight:.medium)).lineLimit(1);Text(item.subtitle).font(.system(size:11)).foregroundStyle(.secondary).lineLimit(1)}.frame(maxWidth:.infinity,alignment:.leading);if !item.isSong {Image(systemName:"chevron.right").font(.system(size:10)).foregroundStyle(.secondary)}}.padding(.vertical,5).contentShape(Rectangle())}.buttonStyle(.plain).disabled(!item.playable)
                                if item.isSong {Button{model.enqueue(item)}label:{Image(systemName:"text.badge.plus").frame(width:28,height:32)}.buttonStyle(.plain).help("Add to queue").accessibilityLabel("Add \(item.name) to queue")}
                            }
                        }
                        if model.busy {ProgressView().controlSize(.small).padding(12)}
                        else if model.hasMore {Button("Load more"){model.load(more:true)}.buttonStyle(.plain).foregroundStyle(green).padding(10)}
                        else if model.items.isEmpty && model.error.isEmpty {Text(model.view=="search" && model.query.isEmpty ? "Find your next listen":"Nothing here yet").font(.system(size:12)).foregroundStyle(.secondary).padding(20)}
                    }}.id(model.view+model.scope+(model.collection?.uri ?? "")+model.query).frame(maxHeight:.infinity)
                    if !model.notice.isEmpty {Text(model.notice).font(.system(size:11)).foregroundStyle(green).lineLimit(1)}
                }.padding(14).frame(maxHeight:.infinity)
            }
        }
    }
}
