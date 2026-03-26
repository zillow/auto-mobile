import AutoMobileSDK
import SwiftUI

@main
struct PlaygroundApp: App {
    init() {
        // Initialize AutoMobile SDK
        AutoMobileSDK.shared.initialize(bundleId: "dev.jasonpearson.automobile.Playground")

        // Enable storage inspection in debug builds
        #if DEBUG
        UserDefaultsInspector.shared.setEnabled(true)
        DatabaseInspector.shared.setEnabled(true)
        #endif

        // Add log filter for network and image loading
        AutoMobileLog.shared.addFilter(name: "network", tagPattern: "URLSession|Network|Coil")

        // Track app launch
        AutoMobileSDK.shared.trackEvent(name: "app_launched", properties: ["screen": "PlaygroundApp"])
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .autoMobileTheme()
        }
    }
}
