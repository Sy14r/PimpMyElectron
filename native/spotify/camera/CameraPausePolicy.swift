import Foundation

// Playback ownership is deliberately memory-only. Relaunching never resumes music.
struct CameraPlayback:Equatable {
    let state:String
    let track:String
    let position:Double
}
enum CameraPauseAction:Equatable {case pause,resume}
struct CameraPausePolicy {
    var active=false
    var attempted=false
    var owned:CameraPlayback?
    var clearSince:Double?
    var confirmingPause:CameraPlayback?
    var confirmationDeadline:Double=0
    var resumePending=false
    var needsPlaybackCheck:Bool {active || owned != nil || confirmingPause != nil}
    mutating func pauseAcknowledged(_ expected:CameraPlayback,now:Double){confirmingPause=expected;confirmationDeadline=now+3}
    mutating func didResume(){owned=nil;resumePending=false}
    mutating func cancelResumeAttempt(){resumePending=false}
    mutating func reset(){self=CameraPausePolicy()}
    mutating func didPause(_ snapshot:CameraPlayback){if snapshot.state=="paused",!snapshot.track.isEmpty {owned=snapshot}}
    mutating func evaluate(camera:Bool?,playback:CameraPlayback,now:Double,resumeDelay:Double=1.5)->CameraPauseAction? {
        guard let camera else{reset();return nil}
        if let pending=confirmingPause {
            if playback.track != pending.track || playback.state=="stopped" || now>confirmationDeadline {confirmingPause=nil}
            else if playback.state=="paused" {didPause(playback);confirmingPause=nil}
        }
        if let saved=owned,playback.state != "paused" || saved.track != playback.track || abs(saved.position-playback.position)>2 {owned=nil}
        if camera {
            clearSince=nil
            if !active {active=true;attempted=false}
            if !attempted {attempted=true;if playback.state=="playing" {return .pause}}
        }else{
            if active {active=false;clearSince=now}
            if owned != nil {
                if clearSince==nil {clearSince=now}
                if !resumePending && now-(clearSince ?? now)>=max(0,resumeDelay) {resumePending=true;return .resume}
            }
        }
        return nil
    }
}

// Full active snapshots only: recent activity, partial/redacted messages, and
// unrelated microphone entries must never masquerade as a camera-off event.
enum CameraAttributionParser {
    static let prefix="Active activity attributions changed to "
    static func parse(_ message:String)->Set<String>? {
        guard message.hasPrefix(prefix),let data=String(message.dropFirst(prefix.count)).data(using:.utf8),
              let entries=(try? JSONSerialization.jsonObject(with:data)) as? [String] else{return nil}
        var cameras=Set<String>()
        for entry in entries {
            guard let colon=entry.firstIndex(of:":") else{return nil}
            let kind=String(entry[..<colon]),bundle=String(entry[entry.index(after:colon)...])
            guard bundle.range(of:"^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)+$",options:.regularExpression) != nil else{return nil}
            if kind=="cam" {cameras.insert(bundle)}
        }
        return cameras
    }
}
