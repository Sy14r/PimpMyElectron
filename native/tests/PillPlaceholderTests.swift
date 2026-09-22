// Compiled together with TriageController.swift, replacing its app entry point.
let app=NSApplication.shared
app.setActivationPolicy(.accessory)
let controller=Controller("/tmp/pme-placeholder-test-missing.sock")
controller.item=NSStatusBar.system.statusItem(withLength:1)
controller.settings=["edge":"left","display":"main"]
controller.attentionCount=0
func require(_ value:Bool,_ message:String) { if !value { fatalError(message) } }
func pump() { RunLoop.main.run(until:Date().addingTimeInterval(0.10)) }
let first=controller.beginPillPlaceholder()
require(controller.pillPlaceholder?.isVisible == true,"placeholder should appear synchronously")
require(controller.pillPlaceholder?.frame.width == 44,"matches real pill width")
require(controller.pillPlaceholder?.frame.height == 132,"matches empty pill height")
require(controller.pillPlaceholder?.canBecomeKey == false,"must not steal typing focus")
controller.finishPillPlaceholder(first,["mode":"cluster"])
pump()
require(controller.pillPlaceholder?.isVisible == false,"ready result hands off")
controller.attentionCount=2
controller.settings["edge"]="right"
let old=controller.beginPillPlaceholder()
require(controller.pillPlaceholder?.frame.height == 172,"count determines matching height")
let current=controller.beginPillPlaceholder()
controller.finishPillPlaceholder(old,["mode":"cluster"])
pump()
require(controller.pillPlaceholder?.isVisible == true,"stale acknowledgement must not dismiss new request")
controller.pendingPillAction="queue"
controller.finishPillPlaceholder(current,["mode":"queue"])
pump()
require(controller.pillPlaceholder?.isVisible == false,"an already completed queued action must not be replayed")
let failed=controller.beginPillPlaceholder()
controller.finishPillPlaceholder(failed,nil)
pump()
require(controller.pillPlaceholder?.isVisible == false,"failed request removes placeholder")
let cancelled=controller.beginPillPlaceholder()
controller.dismissPillPlaceholder()
controller.finishPillPlaceholder(cancelled,["mode":"queue"])
pump()
require(controller.pillPlaceholder?.isVisible == false,"cancelled completion must not revive placeholder")
controller.openFromEdge("peek")
require(controller.pillPlaceholder?.isVisible != true,"edge hover must bypass the native placeholder")
pump()
require(controller.edgeOpening == false,"failed peek must release the opening guard")
controller.shellMode="strip"
controller.perform("peek")
require(controller.pillPlaceholder?.isVisible != true,"command peek must also bypass the placeholder")
pump()
NSStatusBar.system.removeStatusItem(controller.item)
print("PASS: native placeholder presentation, focus, handoff, stale replies and failure cleanup")
