import SwiftUI

enum Tab: Hashable {
    case discover
    case demos
    case settings
}

struct ContentView: View {
    @State private var selectedTab: Tab = .discover
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        TabView(selection: $selectedTab) {
            DiscoverTab()
                .tabItem {
                    Label("Discover", systemImage: "magnifyingglass")
                }
                .tag(Tab.discover)

            DemosTab()
                .tabItem {
                    Label("Demos", systemImage: "play.fill")
                }
                .tag(Tab.demos)

            SettingsTab()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .tag(Tab.settings)
        }
        .tint(.autoMobileRed)
    }
}

#Preview {
    ContentView()
        .autoMobileTheme()
}
