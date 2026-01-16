import Foundation
#if canImport(XcodeKit)
import XcodeKit

/// Main source editor extension for AutoMobile
class SourceEditorExtension: NSObject, XCSourceEditorExtension {

    /// Called when the extension is initialized
    func extensionDidFinishLaunching() {
        print("AutoMobile Xcode Extension loaded")
    }

    /// Returns the command definitions for this extension
    var commandDefinitions: [[XCSourceEditorCommandDefinitionKey: Any]] {
        return [
            [
                .identifierKey: "com.automobile.xcode-extension.generate-plan-template",
                .classNameKey: GeneratePlanTemplateCommand.className(),
                .nameKey: "Generate AutoMobile Plan Template"
            ],
            [
                .identifierKey: "com.automobile.xcode-extension.execute-plan",
                .classNameKey: ExecutePlanCommand.className(),
                .nameKey: "Execute AutoMobile Plan"
            ],
            [
                .identifierKey: "com.automobile.xcode-extension.open-companion",
                .classNameKey: OpenCompanionCommand.className(),
                .nameKey: "Open AutoMobile Companion"
            ],
            [
                .identifierKey: "com.automobile.xcode-extension.start-recording",
                .classNameKey: StartRecordingCommand.className(),
                .nameKey: "Start AutoMobile Recording"
            ],
            [
                .identifierKey: "com.automobile.xcode-extension.stop-recording",
                .classNameKey: StopRecordingCommand.className(),
                .nameKey: "Stop AutoMobile Recording"
            ]
        ]
    }
}
#endif
