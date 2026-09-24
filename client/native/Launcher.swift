import AppKit
import Security

// One immutable signed template. Its bundle-root profile-ID xattr and the
// user's saved JSON profile are data; neither can supply executable arguments.
final class Launcher: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification:Notification) {
        DispatchQueue.global(qos:.userInitiated).async {
            do {try self.launch();DispatchQueue.main.async {NSApp.terminate(nil)}}
            catch {DispatchQueue.main.async {NSApp.activate(ignoringOtherApps:true);let alert=NSAlert();alert.messageText="Couldn’t launch this PME shortcut";alert.informativeText=error.localizedDescription;alert.runModal();NSApp.terminate(nil)}}
        }
    }
    func error(_ message:String)->NSError {NSError(domain:"PimpMyElectron",code:1,userInfo:[NSLocalizedDescriptionKey:message])}
    func command(_ executable:URL,_ arguments:[String],environment:[String:String]?=nil)throws->String {
        let p=Process(),pipe=Pipe();p.executableURL=executable;p.arguments=arguments;p.standardOutput=pipe;p.standardError=pipe
        if let environment {p.environment=environment}
        try p.run();let output=pipe.fileHandleForReading.readDataToEndOfFile();p.waitUntilExit()
        let message=String(data:output,encoding:.utf8)?.trimmingCharacters(in:.whitespacesAndNewlines) ?? ""
        if p.terminationStatus != 0 {throw error(message.isEmpty ? "The PME runtime could not start. Open PimpMyElectron to check your installation." : message)}
        return message
    }
    func code(_ url:URL)throws->SecStaticCode {
        var result:SecStaticCode?;guard SecStaticCodeCreateWithPath(url as CFURL,[],&result)==errSecSuccess,let result else{throw error("Could not inspect the PME code signature.")};return result
    }
    func trustedClient(_ url:URL,team:String?)->Bool {
        guard Bundle(url:url)?.bundleIdentifier=="com.pimpmyElectron.client",
              FileManager.default.fileExists(atPath:url.appendingPathComponent("Contents/Resources/runtime/client/launch-shortcut.mjs").path),let target=try? code(url) else{return false}
        var requirement:SecRequirement?
        if let team {
            let rule="identifier \"com.pimpmyElectron.client\" and anchor apple generic and certificate leaf[subject.OU] = \"\(team)\" and certificate leaf[field.1.2.840.113635.100.6.1.13] exists"
            guard SecRequirementCreateWithString(rule as CFString,[],&requirement)==errSecSuccess else{return false}
        }else{
            // Local ad-hoc development only. Distributed launchers require the
            // same Apple Developer ID team as their own signature.
            var info:CFDictionary?;guard SecCodeCopySigningInformation(target,SecCSFlags(rawValue:kSecCSSigningInformation),&info)==errSecSuccess,
                let values=info as? [String:Any],values[kSecCodeInfoTeamIdentifier as String]==nil,
                ((values[kSecCodeInfoFlags as String] as? UInt32 ?? 0)&UInt32(0x0002) /* kSecCodeSignatureAdhoc */) != 0 else{return false}
        }
        return SecStaticCodeCheckValidity(target,SecCSFlags(rawValue:kSecCSStrictValidate|kSecCSCheckNestedCode|kSecCSCheckAllArchitectures),requirement)==errSecSuccess
    }
    func launch()throws {
        let own=Bundle.main.bundleURL.resolvingSymlinksInPath(),fm=FileManager.default
        guard let id=try? command(URL(fileURLWithPath:"/usr/bin/xattr"),["-p","com.pimpmyElectron.launch-profile",own.path]) else{throw error("This shortcut lost its saved-profile identifier. Create a new shortcut from PME.")}
        guard UUID(uuidString:id) != nil else{throw error("This shortcut has no valid saved profile. Create it again from PME.")}
        let data=fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/PimpMyElectron")
        let profileURL=data.appendingPathComponent("shortcuts/\(id).json")
        guard let bytes=try? Data(contentsOf:profileURL),let profile=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any],profile["id"] as? String==id else{throw error("The saved launch profile is missing. Create a new shortcut from PME.")}
        var signing:CFDictionary?;guard SecCodeCopySigningInformation(try code(own),SecCSFlags(rawValue:kSecCSSigningInformation),&signing)==errSecSuccess else{throw error("Could not verify this shortcut.")}
        let team=(signing as? [String:Any])?[kSecCodeInfoTeamIdentifier as String] as? String
        var candidates=[URL(fileURLWithPath:"/Applications/PimpMyElectron.app"),fm.homeDirectoryForCurrentUser.appendingPathComponent("Applications/PimpMyElectron.app")]
        if let bytes=try? Data(contentsOf:data.appendingPathComponent("client-location.json")),let location=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:String],let path=location["path"] {candidates.append(URL(fileURLWithPath:path))}
        if let path=profile["clientPath"] as? String {candidates.append(URL(fileURLWithPath:path))}
        if let registered=NSWorkspace.shared.urlForApplication(withBundleIdentifier:"com.pimpmyElectron.client") {candidates.append(registered)}
        guard let client=candidates.first(where:{trustedClient($0,team:team)}) else{throw error("Install the current PimpMyElectron app in Applications and open it once, then try this shortcut again. PME must remain installed.")}
        var env=ProcessInfo.processInfo.environment
        for key in Array(env.keys) where key.hasPrefix("DYLD_") || ["NODE_OPTIONS","NODE_PATH","ELECTRON_RUN_AS_NODE","PME_CLIENT_DATA_DIR","PME_DATA_DIR","PME_HELPER_PATH"].contains(key) {env.removeValue(forKey:key)}
        let resources=client.appendingPathComponent("Contents/Resources")
        _=try command(resources.appendingPathComponent("bin/node"),[resources.appendingPathComponent("runtime/client/launch-shortcut.mjs").path,id,own.path],environment:env)
    }
}
let app=NSApplication.shared,delegate=Launcher();app.delegate=delegate;app.setActivationPolicy(.accessory);app.run()
