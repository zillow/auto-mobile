import Foundation
#if canImport(XcodeKit)
import XcodeKit

/// Command to start test recording
class StartRecordingCommand: NSObject, XCSourceEditorCommand {

    func perform(
        with invocation: XCSourceEditorCommandInvocation,
        completionHandler: @escaping (Error?) -> Void
    ) {
        // Send notification to companion app to start recording
        DistributedNotificationCenter.default().post(
            name: NSNotification.Name("com.automobile.start-recording"),
            object: nil
        )

        print("Started AutoMobile recording")
        completionHandler(nil)
    }
}
#endif
