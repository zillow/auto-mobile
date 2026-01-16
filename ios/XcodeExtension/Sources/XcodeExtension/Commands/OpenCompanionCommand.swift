import Foundation
#if canImport(XcodeKit)
import XcodeKit
import AppKit

/// Command to open the AutoMobile Companion app
class OpenCompanionCommand: NSObject, XCSourceEditorCommand {

    func perform(
        with invocation: XCSourceEditorCommandInvocation,
        completionHandler: @escaping (Error?) -> Void
    ) {
        // Launch or activate the companion app
        let bundleIdentifier = "com.automobile.companion"

        if let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleIdentifier) {
            NSWorkspace.shared.openApplication(
                at: appURL,
                configuration: NSWorkspace.OpenConfiguration()
            ) { app, error in
                completionHandler(error)
            }
        } else {
            completionHandler(NSError(
                domain: "AutoMobile",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "AutoMobile Companion app not found"]
            ))
        }
    }
}
#endif
