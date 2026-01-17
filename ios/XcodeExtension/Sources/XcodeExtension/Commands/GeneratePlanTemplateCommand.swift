import Foundation
#if canImport(XcodeKit)
    import XcodeKit

    /// Command to generate an AutoMobile plan template
    class GeneratePlanTemplateCommand: NSObject, XCSourceEditorCommand {
        func perform(
            with invocation: XCSourceEditorCommandInvocation,
            completionHandler: @escaping (Error?) -> Void
        ) {
            let buffer = invocation.buffer

            // Generate plan template
            let template = generatePlanTemplate()

            // Insert template at cursor or beginning of file
            let insertionLine = buffer.selections.firstObject as? XCSourceTextRange
            let lineIndex = insertionLine?.start.line ?? 0

            for (index, line) in template.enumerated() {
                buffer.lines.insert(line, at: lineIndex + index)
            }

            completionHandler(nil)
        }

        private func generatePlanTemplate() -> [String] {
            return [
                "# AutoMobile Test Plan",
                "name: Test Plan",
                "description: Automated test plan",
                "",
                "setup:",
                "  - action: launchApp",
                "    params:",
                "      bundleId: com.example.app",
                "",
                "steps:",
                "  - action: tapOn",
                "    params:",
                "      text: \"Button Text\"",
                "",
                "  - action: inputText",
                "    params:",
                "      text: \"Input text here\"",
                "",
                "  - action: swipe",
                "    params:",
                "      direction: up",
                "",
                "assertions:",
                "  - element:",
                "      text: \"Expected Text\"",
                "    visible: true",
                "",
                "teardown:",
                "  - action: terminateApp",
                "    params:",
                "      bundleId: com.example.app",
                "",
            ]
        }
    }
#endif
