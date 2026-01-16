import SwiftUI

/// Main application entry point for AutoMobile Xcode Companion
@main
struct AutoMobileCompanionApp: App {

    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 800, minHeight: 600)
        }
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About AutoMobile Companion") {
                    // Show about window
                }
            }
        }

        Settings {
            SettingsView()
        }

        MenuBarExtra("AutoMobile", systemImage: "wrench.and.screwdriver") {
            MenuBarView()
        }
    }
}

/// Application delegate for menu bar and lifecycle management
class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        print("AutoMobile Companion launched")

        // Initialize MCP connection
        MCPConnectionManager.shared.initialize()
    }

    func applicationWillTerminate(_ notification: Notification) {
        print("AutoMobile Companion terminating")

        // Cleanup MCP connection
        MCPConnectionManager.shared.disconnect()
    }
}
