import AppKit
import SwiftUI
import Combine
import CoreImage

enum ArtworkTreatment:String,CaseIterable {
    case ambient,bleed,gallery
    var label:String {
        switch self {case .ambient:return "Ambient wash";case .bleed:return "Artwork bleed";case .gallery:return "Gallery glow"}
    }
}
final class PlayerPreferences:ObservableObject {
    private let defaults:UserDefaults
    @Published var treatment:ArtworkTreatment {didSet{defaults.set(treatment.rawValue,forKey:"artworkTreatment")}}
    @Published var openOnHover:Bool {didSet{defaults.set(openOnHover,forKey:"openOnHover")}}
    @Published var dismissalDelay:Double {didSet{defaults.set(dismissalDelay,forKey:"dismissalDelay")}}
    init(defaults:UserDefaults = .standard){
        self.defaults=defaults
        treatment=ArtworkTreatment(rawValue:defaults.string(forKey:"artworkTreatment") ?? "") ?? .ambient
        openOnHover=defaults.object(forKey:"openOnHover") as? Bool ?? true
        let delay=defaults.object(forKey:"dismissalDelay") as? Double ?? 0.45
        dismissalDelay=delay.isFinite ? min(5,max(0.1,delay)):0.45
    }
}


struct PlayerSettings:View {
    @ObservedObject var preferences:PlayerPreferences
    var body:some View {
        VStack(alignment:.leading,spacing:16){
            Text("Mini player settings").font(.system(size:14,weight:.semibold))
            Picker("Artwork treatment",selection:$preferences.treatment){ForEach(ArtworkTreatment.allCases,id:\.self){t in Text(t.label).tag(t)}}
                .pickerStyle(.menu).font(.system(size:12))
            Divider()
            Toggle("Open on hover",isOn:$preferences.openOnHover).toggleStyle(.switch).font(.system(size:12))
            VStack(alignment:.leading,spacing:8){
                HStack{Text("Dismiss after pointer leaves");Spacer();Text(String(format:"%.2f s",preferences.dismissalDelay)).monospacedDigit()}.font(.system(size:12))
                Slider(value:$preferences.dismissalDelay,in:0.1...5,step:0.05).accessibilityLabel("Hover dismissal delay in seconds")
                HStack{Text("0.1 s");Spacer();Text("5 s")}.font(.system(size:11)).foregroundStyle(.secondary)
            }.disabled(!preferences.openOnHover).opacity(preferences.openOnHover ? 1:0.5)
            Text(preferences.openOnHover ? "Returning to the player cancels the countdown. Pinned and browsing views stay open.":"Click to open and close. Hover dismissal is disabled.").font(.system(size:11)).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)
        }.padding(18).frame(width:310).preferredColorScheme(.dark)
    }
}

// Small, prefiltered images are reused by SwiftUI. Never blur the live window or
// recompute image filters as the progress bar advances.
final class ArtworkAtmosphere:NSObject {
    let sharp:NSImage,soft:NSImage,accent:NSColor
    init(sharp:CGImage,soft:CGImage,accent:NSColor){
        self.sharp=NSImage(cgImage:sharp,size:NSSize(width:sharp.width,height:sharp.height))
        self.soft=NSImage(cgImage:soft,size:NSSize(width:soft.width,height:soft.height))
        self.accent=accent
    }
}
final class AtmosphereRenderer {
    private static let queue=DispatchQueue(label:"pme.spotify.artwork",qos:.utility)
    private static let cache:NSCache<NSString,ArtworkAtmosphere> = {let c=NSCache<NSString,ArtworkAtmosphere>();c.countLimit=12;return c}()
    private static let context=CIContext(options:[.useSoftwareRenderer:true,.cacheIntermediates:false])
    static func prepare(_ image:NSImage,key:String,completion:@escaping(ArtworkAtmosphere?)->Void){
        if let cached=cache.object(forKey:key as NSString){completion(cached);return}
        guard let cg=image.cgImage(forProposedRect:nil,context:nil,hints:nil),cg.width>0,cg.height>0 else{completion(nil);return}
        queue.async {
            let source=CIImage(cgImage:cg),scale=180.0/Double(max(cg.width,cg.height))
            let small=source.transformed(by:CGAffineTransform(scaleX:scale,y:scale))
            let bounds=small.extent.integral
            let blur=small.clampedToExtent().applyingFilter("CIGaussianBlur",parameters:[kCIInputRadiusKey:13]).cropped(to:bounds)
            guard let sharp=context.createCGImage(small,from:bounds),let soft=context.createCGImage(blur,from:bounds) else{DispatchQueue.main.async{completion(nil)};return}
            let average=small.applyingFilter("CIAreaAverage",parameters:[kCIInputExtentKey:CIVector(cgRect:bounds)])
            var pixel=[UInt8](repeating:0,count:4)
            context.render(average,toBitmap:&pixel,rowBytes:4,bounds:CGRect(x:0,y:0,width:1,height:1),format:.RGBA8,colorSpace:CGColorSpace(name:CGColorSpace.sRGB))
            let color=NSColor(srgbRed:CGFloat(pixel[0])/255,green:CGFloat(pixel[1])/255,blue:CGFloat(pixel[2])/255,alpha:1)
            var h:CGFloat=0,s:CGFloat=0,b:CGFloat=0,a:CGFloat=0;color.getHue(&h,saturation:&s,brightness:&b,alpha:&a)
            let accent=NSColor(srgbRed:1,green:1,blue:1,alpha:1).blended(withFraction:0.55,of:NSColor(calibratedHue:h,saturation:min(0.65,s),brightness:0.9,alpha:1)) ?? color
            let result=ArtworkAtmosphere(sharp:sharp,soft:soft,accent:accent);cache.setObject(result,forKey:key as NSString)
            DispatchQueue.main.async{completion(result)}
        }
    }
}
struct ArtworkBackground:View {
    let atmosphere:ArtworkAtmosphere?
    let treatment:ArtworkTreatment
    let base=Color(red:0.075,green:0.09,blue:0.105)
    var body:some View {
        GeometryReader{geometry in
            ZStack {
                base
                if let atmosphere {
                    Image(nsImage:treatment == .bleed ? atmosphere.sharp:atmosphere.soft)
                        .resizable().scaledToFill()
                        .frame(width:geometry.size.width,height:geometry.size.height).clipped()
                        .opacity(treatment == .bleed ? 0.57:0.72)
                        .mask(LinearGradient(colors:treatment == .gallery ? [.white,.white.opacity(0.12),.clear]:[.white,.white],startPoint:.leading,endPoint:.trailing))
                    LinearGradient(colors:[Color.black.opacity(0.16),Color.black.opacity(0.42)],startPoint:.leading,endPoint:.trailing)
                    LinearGradient(stops:[.init(color:.clear,location:0),.init(color:base.opacity(0.48),location:0.65),.init(color:base,location:1)],startPoint:.top,endPoint:.bottom)
                }
            }
        }.clipped().allowsHitTesting(false).accessibilityHidden(true)
    }
}
