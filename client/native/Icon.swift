import AppKit
let folder=CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath:folder,withIntermediateDirectories:true)
for size in [16,32,64,128,256,512,1024] {
    let bitmap=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:size,pixelsHigh:size,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
    NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:bitmap)
    let context=NSGraphicsContext.current!.cgContext;context.scaleBy(x:CGFloat(size)/128,y:CGFloat(size)/128)
    let outer=NSBezierPath(roundedRect:NSRect(x:4,y:4,width:120,height:120),xRadius:29,yRadius:29)
    NSGradient(starting:NSColor(calibratedRed:0.10,green:0.11,blue:0.14,alpha:1),ending:NSColor(calibratedRed:0.23,green:0.23,blue:0.27,alpha:1))!.draw(in:outer,angle:90)
    NSColor(white:1,alpha:0.13).setStroke();outer.lineWidth=1;outer.stroke()
    // Original PME orbital mark, inspired by Electron's atom motif.
    // Coordinates are flipped to match the companion UI SVG.
    context.saveGState();context.translateBy(x:0,y:128);context.scaleBy(x:1,y:-1)
    let cyan=NSColor(calibratedRed:0.62,green:0.88,blue:0.93,alpha:1)
    let peach=NSColor(calibratedRed:1,green:0.65,blue:0.46,alpha:1)
    for degrees in [-30.0,90.0,210.0] {
        context.saveGState();context.translateBy(x:64,y:64);context.rotate(by:degrees * .pi/180)
        let orbit=NSBezierPath()
        for step in 0...180 {
            let angle=(30.0+Double(step)*300.0/180.0) * .pi/180
            let point=NSPoint(x:43*cos(angle),y:18*sin(angle))
            if step==0 {orbit.move(to:point)} else {orbit.line(to:point)}
        }
        cyan.setStroke();orbit.lineWidth=3.2;orbit.lineCapStyle = .round;orbit.lineJoinStyle = .round;orbit.stroke()
        cyan.setFill();NSBezierPath(ovalIn:NSRect(x:39,y:-4,width:8,height:8)).fill()
        context.restoreGState()
    }
    let nucleus=NSBezierPath(roundedRect:NSRect(x:53,y:53,width:22,height:22),xRadius:7,yRadius:7)
    peach.setFill();nucleus.fill()
    let plus=NSBezierPath();plus.move(to:NSPoint(x:58.5,y:64));plus.line(to:NSPoint(x:69.5,y:64));plus.move(to:NSPoint(x:64,y:58.5));plus.line(to:NSPoint(x:64,y:69.5))
    plus.lineWidth=2.8;plus.lineCapStyle = .round;NSColor(calibratedRed:0.13,green:0.16,blue:0.20,alpha:1).setStroke();plus.stroke()
    context.restoreGState()
    NSGraphicsContext.restoreGraphicsState()
    let data=bitmap.representation(using:.png,properties:[:])!
    let names:[String]
    switch size {case 16:names=["icon_16x16.png"];case 32:names=["icon_16x16@2x.png","icon_32x32.png"];case 64:names=["icon_32x32@2x.png"];case 128:names=["icon_128x128.png"];case 256:names=["icon_128x128@2x.png","icon_256x256.png"];case 512:names=["icon_256x256@2x.png","icon_512x512.png"];default:names=["icon_512x512@2x.png"]}
    for name in names {try data.write(to:URL(fileURLWithPath:folder).appendingPathComponent(name))}
}
