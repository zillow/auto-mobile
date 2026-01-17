import Foundation
#if canImport(XcodeKit)
    import XcodeKit

    /// Command to stop test recording
    class StopRecordingCommand: NSObject, XCSourceEditorCommand {
        func perform(
            with _: XCSourceEditorCommandInvocation,
            completionHandler: @escaping (Error?) -> Void
        ) {
            // Send notification to companion app to stop recording
            DistributedNotificationCenter.default().post(
                name: NSNotification.Name("com.automobile.stop-recording"),
                object: nil
            )

            print("Stopped AutoMobile recording")
            completionHandler(nil)
        }
    }
#endif
