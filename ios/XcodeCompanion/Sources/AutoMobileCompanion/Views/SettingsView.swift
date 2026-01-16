import SwiftUI

/// Settings view for configuring the companion app
struct SettingsView: View {

    @AppStorage("mcpEndpoint") private var mcpEndpoint = "http://localhost:3000"
    @AppStorage("autoConnect") private var autoConnect = true

    var body: some View {
        Form {
            Section("MCP Connection") {
                TextField("MCP Endpoint", text: $mcpEndpoint)
                Toggle("Auto-connect on launch", isOn: $autoConnect)
            }

            Section("Recording") {
                Toggle("Auto-generate element IDs", isOn: .constant(true))
                Toggle("Capture screenshots", isOn: .constant(true))
            }

            Section("Execution") {
                Toggle("Show detailed logs", isOn: .constant(true))
                Toggle("Auto-retry failed steps", isOn: .constant(false))
            }
        }
        .padding()
        .frame(width: 450, height: 350)
    }
}
