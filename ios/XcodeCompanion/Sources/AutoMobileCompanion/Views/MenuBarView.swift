import SwiftUI

/// Menu bar view for quick actions
struct MenuBarView: View {

    var body: some View {
        VStack {
            Button("Show Companion") {
                // Bring main window to front
                NSApp.activate(ignoringOtherApps: true)
            }

            Divider()

            Button("Start Recording") {
                // Start recording
            }

            Button("Stop Recording") {
                // Stop recording
            }

            Divider()

            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
        }
        .padding(4)
    }
}
