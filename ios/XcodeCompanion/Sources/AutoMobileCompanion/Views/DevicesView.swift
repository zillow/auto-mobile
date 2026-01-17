import SwiftUI

/// Devices view for managing iOS simulators and devices
struct DevicesView: View {
    @StateObject private var viewModel = DevicesViewModel()

    var body: some View {
        VStack {
            HStack {
                Text("iOS Devices & Simulators")
                    .font(.title)

                Spacer()

                Button("Refresh") {
                    viewModel.refreshDevices()
                }
            }
            .padding()

            if viewModel.isLoading {
                ProgressView("Loading devices...")
            } else if viewModel.devices.isEmpty {
                Text("No devices found")
                    .foregroundColor(.secondary)
            } else {
                List(viewModel.devices) { device in
                    DeviceRow(device: device)
                }
            }
        }
        .onAppear {
            viewModel.refreshDevices()
        }
    }
}

/// Device row view
struct DeviceRow: View {
    let device: SimulatorDevice

    var body: some View {
        HStack {
            Image(systemName: deviceIcon)
                .foregroundColor(.blue)

            VStack(alignment: .leading) {
                Text(device.name)
                    .font(.headline)

                Text(device.runtime)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            StateLabel(state: device.state)
        }
        .padding(.vertical, 4)
    }

    private var deviceIcon: String {
        if device.name.contains("iPad") {
            return "ipad"
        } else {
            return "iphone"
        }
    }
}

/// State label view
struct StateLabel: View {
    let state: String

    var body: some View {
        Text(state)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(stateColor.opacity(0.2))
            .foregroundColor(stateColor)
            .cornerRadius(4)
    }

    private var stateColor: Color {
        switch state {
        case "Booted": return .green
        case "Shutdown": return .gray
        case "Booting", "ShuttingDown": return .orange
        default: return .secondary
        }
    }
}

/// Devices view model
class DevicesViewModel: ObservableObject {
    @Published var devices: [SimulatorDevice] = []
    @Published var isLoading = false

    func refreshDevices() {
        isLoading = true

        // TODO: Integrate with Simctl to fetch real devices
        // For MVP, use mock data
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            self.devices = [
                SimulatorDevice(
                    id: "1",
                    udid: "ABC123",
                    name: "iPhone 15 Pro",
                    state: "Booted",
                    runtime: "iOS 17.0"
                ),
                SimulatorDevice(
                    id: "2",
                    udid: "DEF456",
                    name: "iPad Pro (12.9-inch)",
                    state: "Shutdown",
                    runtime: "iOS 17.0"
                ),
            ]
            self.isLoading = false
        }
    }
}

/// Simulator device model
struct SimulatorDevice: Identifiable {
    let id: String
    let udid: String
    let name: String
    let state: String
    let runtime: String
}
