import AutoMobileSDK
import SwiftUI

struct DemosTab: View {
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        NavigationStack {
            List {
                Section("SDK Features") {
                    NavigationLink {
                        SDKStatusDemo()
                    } label: {
                        DemoRow(
                            title: "SDK Status",
                            description: "AutoMobile SDK state and controls",
                            icon: "antenna.radiowaves.left.and.right"
                        )
                    }

                    NavigationLink {
                        ErrorTrackingDemo()
                    } label: {
                        DemoRow(
                            title: "Error Tracking",
                            description: "Test handled exception recording",
                            icon: "exclamationmark.octagon.fill"
                        )
                    }

                    NavigationLink {
                        BiometricsDemo()
                    } label: {
                        DemoRow(
                            title: "Biometrics",
                            description: "Test biometric override injection",
                            icon: "faceid"
                        )
                    }

                    NavigationLink {
                        NetworkTrackingDemo()
                    } label: {
                        DemoRow(
                            title: "Network Tracking",
                            description: "Test network request monitoring",
                            icon: "network"
                        )
                    }
                }

                Section("Performance") {
                    NavigationLink {
                        ScrollPerformanceDemo()
                    } label: {
                        DemoRow(
                            title: "Scroll Performance",
                            description: "Test scrolling with many items",
                            icon: "scroll.fill"
                        )
                    }

                    NavigationLink {
                        AnimationDemo()
                    } label: {
                        DemoRow(
                            title: "Animations",
                            description: "Various animation types and timings",
                            icon: "wand.and.stars"
                        )
                    }

                    NavigationLink {
                        HeavyComputationDemo()
                    } label: {
                        DemoRow(
                            title: "Heavy Computation",
                            description: "Stress test with intensive calculations",
                            icon: "cpu.fill"
                        )
                    }
                }

                Section("UI Components") {
                    NavigationLink {
                        FormDemo()
                    } label: {
                        DemoRow(
                            title: "Forms & Input",
                            description: "Text fields, pickers, and toggles",
                            icon: "rectangle.and.pencil.and.ellipsis"
                        )
                    }

                    NavigationLink {
                        AlertsDemo()
                    } label: {
                        DemoRow(
                            title: "Alerts & Sheets",
                            description: "Modal presentations and dialogs",
                            icon: "exclamationmark.bubble.fill"
                        )
                    }
                }

                Section("Accessibility") {
                    NavigationLink {
                        AccessibilityDemo()
                    } label: {
                        DemoRow(
                            title: "Accessibility",
                            description: "VoiceOver and Dynamic Type",
                            icon: "accessibility.fill"
                        )
                    }
                }
            }
            .navigationTitle("Demos")
        }
    }
}

struct DemoRow: View {
    let title: String
    let description: String
    let icon: String
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(theme.primary)
                .frame(width: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(theme.textPrimary)
                Text(description)
                    .font(.caption)
                    .foregroundStyle(theme.textSecondary)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Scroll Performance Demo

struct ScrollPerformanceDemo: View {
    private let items = (1 ... 1000).map { "Item \($0)" }
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        List(items, id: \.self) { item in
            HStack {
                Circle()
                    .fill(theme.primary)
                    .frame(width: 40, height: 40)

                VStack(alignment: .leading) {
                    Text(item)
                        .font(.headline)
                        .foregroundStyle(theme.textPrimary)
                    Text("Scroll quickly to test performance")
                        .font(.caption)
                        .foregroundStyle(theme.textSecondary)
                }
            }
            .padding(.vertical, 4)
        }
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle("Scroll Performance")
        .navigationBarTitleDisplayMode(.inline)
        .trackNavigation(destination: "ScrollPerformanceDemo")
    }
}

// MARK: - Animation Demo

struct AnimationDemo: View {
    @State private var isAnimating = false
    @State private var rotation: Double = 0
    @State private var scale: CGFloat = 1.0
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(spacing: 40) {
                // Continuous rotation
                VStack(spacing: 8) {
                    Text("Continuous Rotation")
                        .font(.headline)
                        .foregroundStyle(theme.textPrimary)

                    Image(systemName: "gear")
                        .font(.system(size: 60))
                        .foregroundStyle(theme.primary)
                        .rotationEffect(.degrees(rotation))
                        .onAppear {
                            withAnimation(.linear(duration: 2).repeatForever(autoreverses: false)) {
                                rotation = 360
                            }
                        }
                }

                // Scale animation
                VStack(spacing: 8) {
                    Text("Tap to Scale")
                        .font(.headline)
                        .foregroundStyle(theme.textPrimary)

                    Circle()
                        .fill(Color.autoMobileRed)
                        .frame(width: 80, height: 80)
                        .scaleEffect(scale)
                        .onTapGesture {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                                scale = scale == 1.0 ? 1.5 : 1.0
                            }
                        }
                }

                // Toggle animation
                VStack(spacing: 8) {
                    Text("Toggle Animation")
                        .font(.headline)
                        .foregroundStyle(theme.textPrimary)

                    RoundedRectangle(cornerRadius: 12)
                        .fill(isAnimating ? theme.primary : Color.autoMobileDarkGrey)
                        .frame(width: isAnimating ? 200 : 100, height: 60)
                        .animation(.easeInOut(duration: 0.5), value: isAnimating)

                    Button(isAnimating ? "Reset" : "Animate") {
                        isAnimating.toggle()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(theme.primary)
                }

                Spacer()
            }
            .padding()
        }
        .background(theme.background)
        .navigationTitle("Animations")
        .navigationBarTitleDisplayMode(.inline)
        .trackNavigation(destination: "AnimationDemo")
    }
}

// MARK: - Heavy Computation Demo

struct HeavyComputationDemo: View {
    @State private var result = "Tap a button to test"
    @State private var isComputing = false
    @State private var progress: Double = 0
    @State private var selectedDuration = 1.0
    @Environment(\.autoMobileTheme) private var theme

    private let durations: [Double] = [0.5, 1.0, 2.0, 3.0, 5.0]

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Main Thread Blocking Section
                VStack(spacing: 12) {
                    Text("Block Main Thread")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundStyle(theme.textPrimary)

                    Text(
                        "This will freeze the UI completely by sleeping on the main thread. Use this to test jank detection."
                    )
                    .font(.body)
                    .foregroundStyle(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                    // Duration picker
                    VStack(spacing: 8) {
                        Text("Duration: \(String(format: "%.1f", selectedDuration))s")
                            .font(.subheadline)
                            .foregroundStyle(theme.textSecondary)

                        Picker("Duration", selection: $selectedDuration) {
                            ForEach(durations, id: \.self) { duration in
                                Text("\(String(format: "%.1f", duration))s").tag(duration)
                            }
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal)
                    }

                    Button {
                        blockMainThread()
                    } label: {
                        Label("Block Main Thread", systemImage: "exclamationmark.triangle.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.autoMobileRed)
                }
                .padding()
                .background(Color.autoMobileRed.opacity(0.1))
                .cornerRadius(12)

                Divider()
                    .padding(.horizontal)

                // Background Computation Section
                VStack(spacing: 12) {
                    Text("Background Computation")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundStyle(theme.textPrimary)

                    Text("This runs intensive calculations in the background without blocking the UI.")
                        .font(.body)
                        .foregroundStyle(theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)

                    ProgressView(value: progress)
                        .padding(.horizontal, 40)
                        .tint(theme.primary)

                    Button {
                        startComputation()
                    } label: {
                        if isComputing {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle())
                        } else {
                            Text("Start Computation")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(theme.primary)
                    .disabled(isComputing)
                }
                .padding()
                .background(theme.surfaceVariant)
                .cornerRadius(12)

                // Result display
                Text(result)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(theme.textPrimary)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(theme.surfaceVariant)
                    .cornerRadius(8)

                Spacer()
            }
            .padding()
        }
        .background(theme.background)
        .navigationTitle("Heavy Computation")
        .navigationBarTitleDisplayMode(.inline)
        .trackNavigation(destination: "HeavyComputationDemo")
    }

    private func blockMainThread() {
        result = "Blocking main thread for \(String(format: "%.1f", selectedDuration))s..."

        // This intentionally blocks the main thread to cause jank
        Thread.sleep(forTimeInterval: selectedDuration)

        result = "Main thread blocked for \(String(format: "%.1f", selectedDuration))s"
    }

    private func startComputation() {
        isComputing = true
        progress = 0
        result = "Computing in background..."

        // Run computation on a background queue to avoid blocking the main actor
        DispatchQueue.global(qos: .userInitiated).async {
            var sum: Double = 0
            let iterations = 10_000_000
            let updateInterval = iterations / 100

            for i in 0 ..< iterations {
                sum += sin(Double(i)) * cos(Double(i))

                if i % updateInterval == 0 {
                    let p = Double(i) / Double(iterations)
                    DispatchQueue.main.async {
                        progress = p
                    }
                }
            }

            DispatchQueue.main.async {
                progress = 1.0
                result = String(format: "Computation result: %.6f", sum)
                isComputing = false
            }
        }
    }
}

// MARK: - Form Demo

struct FormDemo: View {
    @State private var name = ""
    @State private var email = ""
    @State private var enableNotifications = true
    @State private var selectedTheme = "System"
    @State private var volume = 0.5

    private let themes = ["System", "Light", "Dark"]

    var body: some View {
        Form {
            Section("Personal Information") {
                TextField("Name", text: $name)
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
            }

            Section("Preferences") {
                Toggle("Enable Notifications", isOn: $enableNotifications)

                Picker("Theme", selection: $selectedTheme) {
                    ForEach(themes, id: \.self) { theme in
                        Text(theme)
                    }
                }

                VStack(alignment: .leading) {
                    Text("Volume: \(Int(volume * 100))%")
                    Slider(value: $volume)
                }
            }

            Section {
                Button("Save Changes") {
                    // Save action
                }
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Forms")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Alerts Demo

struct AlertsDemo: View {
    @State private var showAlert = false
    @State private var showSheet = false
    @State private var showConfirmation = false

    var body: some View {
        List {
            Section("Alerts") {
                Button("Show Alert") {
                    showAlert = true
                }
                .alert("Alert Title", isPresented: $showAlert) {
                    Button("OK", role: .cancel) {}
                } message: {
                    Text("This is an alert message.")
                }

                Button("Show Confirmation") {
                    showConfirmation = true
                }
                .confirmationDialog("Choose an action", isPresented: $showConfirmation) {
                    Button("Option 1") {}
                    Button("Option 2") {}
                    Button("Delete", role: .destructive) {}
                    Button("Cancel", role: .cancel) {}
                }
            }

            Section("Sheets") {
                Button("Show Sheet") {
                    showSheet = true
                }
                .sheet(isPresented: $showSheet) {
                    SheetContent()
                }
            }
        }
        .navigationTitle("Alerts & Sheets")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct SheetContent: View {
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("This is a sheet")
                    .font(.title)

                Text("Swipe down or tap Done to dismiss")
                    .foregroundStyle(.secondary)
            }
            .navigationTitle("Sheet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Accessibility Demo

struct AccessibilityDemo: View {
    @State private var dynamicTypeSize: DynamicTypeSize = .large
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        List {
            Section {
                Text("Dynamic Type Preview")
                    .font(.headline)
                    .foregroundStyle(theme.textPrimary)

                Text(
                    "This text will scale with Dynamic Type settings. Try changing the text size in Settings > Accessibility > Display & Text Size."
                )
                .dynamicTypeSize(dynamicTypeSize)
                .foregroundStyle(theme.textSecondary)
            }

            Section("VoiceOver Labels") {
                HStack {
                    Image(systemName: "star.fill")
                        .foregroundStyle(Color.autoMobileWarning)
                        .accessibilityLabel("Favorite")

                    Text("Favorite Item")
                        .foregroundStyle(theme.textPrimary)

                    Spacer()

                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.autoMobileSuccess)
                        .accessibilityLabel("Completed")
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Favorite Item, Completed")

                Button {
                    // Action
                } label: {
                    HStack {
                        Image(systemName: "plus")
                        Text("Add Item")
                    }
                }
                .tint(theme.primary)
                .accessibilityHint("Double tap to add a new item")
            }

            Section("AutoMobile Colors") {
                HStack {
                    Rectangle()
                        .fill(Color.autoMobileLalala)
                        .frame(width: 40, height: 40)
                        .cornerRadius(4)
                    Text("Primary (Lalala)")
                        .foregroundStyle(theme.textPrimary)
                }

                HStack {
                    Rectangle()
                        .fill(Color.autoMobileRed)
                        .frame(width: 40, height: 40)
                        .cornerRadius(4)
                    Text("Secondary (Red)")
                        .foregroundStyle(theme.textPrimary)
                }

                HStack {
                    Rectangle()
                        .fill(Color.autoMobileEggshell)
                        .frame(width: 40, height: 40)
                        .cornerRadius(4)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(Color.autoMobileLightGrey, lineWidth: 1)
                        )
                    Text("Background (Eggshell)")
                        .foregroundStyle(theme.textPrimary)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle("Accessibility")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - SDK Status Demo

struct SDKStatusDemo: View {
    @State private var sdkEnabled: Bool = AutoMobileSDK.shared.isEnabled
    @State private var eventName = ""
    @State private var eventProperty = ""
    @State private var statusMessage = ""
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        List {
            Section("SDK State") {
                HStack {
                    Text("Initialized")
                    Spacer()
                    Text(AutoMobileSDK.shared.isInitialized ? "Yes" : "No")
                        .foregroundStyle(AutoMobileSDK.shared.isInitialized ? Color.autoMobileSuccess : .secondary)
                }

                HStack {
                    Text("Bundle ID")
                    Spacer()
                    Text(AutoMobileSDK.shared.bundleId ?? "N/A")
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Toggle("Enabled", isOn: $sdkEnabled)
                    .onChange(of: sdkEnabled) { _, newValue in
                        AutoMobileSDK.shared.setEnabled(newValue)
                    }

                HStack {
                    Text("Navigation Listeners")
                    Spacer()
                    Text("\(AutoMobileSDK.shared.listenerCount)")
                        .foregroundStyle(.secondary)
                }
            }

            Section("Track Custom Event") {
                TextField("Event Name", text: $eventName)
                TextField("Property (key=value)", text: $eventProperty)

                Button("Track Event") {
                    var props: [String: String] = [:]
                    if eventProperty.contains("=") {
                        let parts = eventProperty.split(separator: "=", maxSplits: 1)
                        if parts.count == 2 {
                            props[String(parts[0])] = String(parts[1])
                        }
                    }
                    AutoMobileSDK.shared.trackEvent(name: eventName, properties: props)
                    statusMessage = "Tracked: \(eventName)"
                }
                .disabled(eventName.isEmpty)

                if !statusMessage.isEmpty {
                    Text(statusMessage)
                        .foregroundStyle(Color.autoMobileSuccess)
                        .font(.caption)
                }
            }

            Section("Storage Inspection") {
                HStack {
                    Text("UserDefaults Inspector")
                    Spacer()
                    Text(UserDefaultsInspector.shared.isEnabled ? "Enabled" : "Disabled")
                        .foregroundStyle(UserDefaultsInspector.shared.isEnabled ? Color.autoMobileSuccess : .secondary)
                }

                HStack {
                    Text("Database Inspector")
                    Spacer()
                    Text(DatabaseInspector.shared.isEnabled ? "Enabled" : "Disabled")
                        .foregroundStyle(DatabaseInspector.shared.isEnabled ? Color.autoMobileSuccess : .secondary)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle("SDK Status")
        .navigationBarTitleDisplayMode(.inline)
        .trackNavigation(destination: "SDKStatusDemo")
    }
}

// MARK: - Error Tracking Demo

struct ErrorTrackingDemo: View {
    @State private var errorCount = 0
    @State private var lastError = ""
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        List {
            Section("Handled Exceptions") {
                HStack {
                    Text("Recorded Errors")
                    Spacer()
                    Text("\(AutoMobileFailures.shared.eventCount)")
                        .foregroundStyle(.secondary)
                }

                Button("Record Test Error") {
                    let error = NSError(
                        domain: "PlaygroundDemo",
                        code: 1001,
                        userInfo: [NSLocalizedDescriptionKey: "Demo error for testing"]
                    )
                    AutoMobileFailures.shared.recordHandledException(
                        error,
                        message: "Triggered from demo",
                        currentScreen: "ErrorTrackingDemo"
                    )
                    errorCount = AutoMobileFailures.shared.eventCount
                    lastError = "PlaygroundDemo:1001"
                }

                Button("Record Network Error") {
                    let error = NSError(
                        domain: NSURLErrorDomain,
                        code: NSURLErrorTimedOut,
                        userInfo: [NSLocalizedDescriptionKey: "The request timed out"]
                    )
                    AutoMobileFailures.shared.recordHandledException(
                        error,
                        message: "API call failed",
                        currentScreen: "ErrorTrackingDemo"
                    )
                    errorCount = AutoMobileFailures.shared.eventCount
                    lastError = "NSURLErrorDomain:\(NSURLErrorTimedOut)"
                }

                if !lastError.isEmpty {
                    Text("Last: \(lastError)")
                        .font(.caption)
                        .foregroundStyle(Color.autoMobileError)
                }
            }

            Section("Recent Events") {
                let events = AutoMobileFailures.shared.getRecentEvents()
                if events.isEmpty {
                    Text("No errors recorded")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(events.suffix(5).reversed(), id: \.timestamp) { event in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.errorDomain)
                                .font(.headline)
                                .foregroundStyle(theme.textPrimary)
                            if let msg = event.customMessage {
                                Text(msg)
                                    .font(.caption)
                                    .foregroundStyle(theme.textSecondary)
                            }
                        }
                    }
                }
            }

            Section {
                Button("Clear All Events", role: .destructive) {
                    AutoMobileFailures.shared.clearEvents()
                    errorCount = 0
                    lastError = ""
                }
                .foregroundStyle(Color.autoMobileRed)
            }
        }
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle("Error Tracking")
        .navigationBarTitleDisplayMode(.inline)
        .trackNavigation(destination: "ErrorTrackingDemo")
    }
}

// MARK: - Biometrics Demo

struct BiometricsDemo: View {
    @State private var selectedResult = "success"
    @State private var statusMessage = ""
    @Environment(\.autoMobileTheme) private var theme

    private let resultOptions = ["success", "failure", "cancel", "error"]

    var body: some View {
        List {
            Section("Override Biometric Result") {
                Picker("Result", selection: $selectedResult) {
                    ForEach(resultOptions, id: \.self) { option in
                        Text(option.capitalized).tag(option)
                    }
                }
                .pickerStyle(.segmented)

                Button("Set Override") {
                    let result: BiometricResult
                    switch selectedResult {
                    case "success": result = .success
                    case "failure": result = .failure
                    case "cancel": result = .cancel
                    default: result = .error(code: 7, message: "Too many attempts")
                    }
                    AutoMobileBiometrics.shared.overrideResult(result)
                    statusMessage = "Override set: \(selectedResult)"
                }

                Button("Consume Override") {
                    if let result = AutoMobileBiometrics.shared.consumeOverride() {
                        statusMessage = "Consumed: \(result)"
                    } else {
                        statusMessage = "No override available"
                    }
                }

                Button("Clear Override") {
                    AutoMobileBiometrics.shared.clearOverride()
                    statusMessage = "Override cleared"
                }
            }

            Section("Status") {
                HStack {
                    Text("Has Override")
                    Spacer()
                    Text(AutoMobileBiometrics.shared.hasOverride ? "Yes" : "No")
                        .foregroundStyle(AutoMobileBiometrics.shared.hasOverride ? Color.autoMobileSuccess : .secondary)
                }

                if !statusMessage.isEmpty {
                    Text(statusMessage)
                        .font(.caption)
                        .foregroundStyle(Color.autoMobileInfo)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle("Biometrics")
        .navigationBarTitleDisplayMode(.inline)
        .trackNavigation(destination: "BiometricsDemo")
    }
}

// MARK: - Network Tracking Demo

struct NetworkTrackingDemo: View {
    @State private var requestCount = 0
    @State private var lastRequest = ""
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        List {
            Section("Manual Recording") {
                Button("Record GET Request") {
                    AutoMobileNetwork.shared.recordRequest(
                        url: "https://api.example.com/users",
                        method: "GET",
                        statusCode: 200,
                        responseBodySize: 2048,
                        durationMs: 150.0
                    )
                    requestCount += 1
                    lastRequest = "GET /users → 200"
                }

                Button("Record POST Request") {
                    AutoMobileNetwork.shared.recordRequest(
                        url: "https://api.example.com/posts",
                        method: "POST",
                        requestBodySize: 512,
                        statusCode: 201,
                        responseBodySize: 128,
                        durationMs: 250.0
                    )
                    requestCount += 1
                    lastRequest = "POST /posts → 201"
                }

                Button("Record Failed Request") {
                    AutoMobileNetwork.shared.recordRequest(
                        url: "https://api.example.com/timeout",
                        method: "GET",
                        durationMs: 30000.0,
                        error: "The request timed out"
                    )
                    requestCount += 1
                    lastRequest = "GET /timeout → Error"
                }
            }

            Section("WebSocket Events") {
                Button("Record WebSocket Frame") {
                    AutoMobileNetwork.shared.recordWebSocketFrame(
                        url: "wss://ws.example.com/stream",
                        direction: .received,
                        frameType: .text,
                        payloadSize: 1024
                    )
                    requestCount += 1
                    lastRequest = "WS frame received (1024 bytes)"
                }
            }

            Section("Status") {
                HStack {
                    Text("Events Recorded")
                    Spacer()
                    Text("\(requestCount)")
                        .foregroundStyle(.secondary)
                }

                if !lastRequest.isEmpty {
                    Text(lastRequest)
                        .font(.caption)
                        .foregroundStyle(Color.autoMobileInfo)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle("Network Tracking")
        .navigationBarTitleDisplayMode(.inline)
        .trackNavigation(destination: "NetworkTrackingDemo")
    }
}

#Preview {
    DemosTab()
        .autoMobileTheme()
}
