import Foundation
#if canImport(XcodeKit)
    import XcodeKit

    /// Command to execute the current AutoMobile plan
    class ExecutePlanCommand: NSObject, XCSourceEditorCommand {
        func perform(
            with invocation: XCSourceEditorCommandInvocation,
            completionHandler: @escaping (Error?) -> Void
        ) {
            let buffer = invocation.buffer

            // Get the file path
            guard let fileURL = buffer.contentUTI as? URL else {
                completionHandler(NSError(
                    domain: "AutoMobile",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Could not determine file path"]
                ))
                return
            }

            // Execute plan via companion app or MCP
            executePlan(at: fileURL.path) { error in
                completionHandler(error)
            }
        }

        private func executePlan(at path: String, completion: @escaping (Error?) -> Void) {
            // TODO: Communicate with companion app to execute plan
            // For MVP, just log the action
            print("Executing plan at: \(path)")

            // Send notification to companion app
            DistributedNotificationCenter.default().post(
                name: NSNotification.Name("com.automobile.execute-plan"),
                object: path
            )

            completion(nil)
        }
    }
#endif
