import SwiftUI

/// Main content view for AutoMobile Companion
struct ContentView: View {
    @StateObject private var navigationState = NavigationState()

    var body: some View {
        NavigationSplitView {
            SidebarView(selection: $navigationState.selectedTab)
        } detail: {
            DetailView(selectedTab: navigationState.selectedTab)
        }
        .navigationTitle("AutoMobile Companion")
    }
}

/// Navigation state manager
class NavigationState: ObservableObject {
    @Published var selectedTab: SidebarTab = .devices
}

/// Sidebar tabs
enum SidebarTab: String, CaseIterable, Identifiable {
    case devices = "Devices"
    case recording = "Recording"
    case execution = "Execution"
    case performance = "Performance"
    case flags = "Feature Flags"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .devices: return "iphone"
        case .recording: return "record.circle"
        case .execution: return "play.circle"
        case .performance: return "chart.line.uptrend.xyaxis"
        case .flags: return "flag"
        }
    }
}

/// Sidebar view
struct SidebarView: View {
    @Binding var selection: SidebarTab

    var body: some View {
        List(SidebarTab.allCases, selection: $selection) { tab in
            Label(tab.rawValue, systemImage: tab.icon)
                .tag(tab)
        }
        .listStyle(.sidebar)
    }
}

/// Detail view router
struct DetailView: View {
    let selectedTab: SidebarTab

    var body: some View {
        switch selectedTab {
        case .devices:
            DevicesView()
        case .recording:
            RecordingView()
        case .execution:
            ExecutionView()
        case .performance:
            PerformanceView()
        case .flags:
            FeatureFlagsView()
        }
    }
}

/// Preview provider
struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
