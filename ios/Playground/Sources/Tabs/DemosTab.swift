import SwiftUI

struct DemosTab: View {
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        NavigationStack {
            List {
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

        Task {
            var sum: Double = 0
            let iterations = 10_000_000
            let updateInterval = iterations / 100

            for i in 0 ..< iterations {
                sum += sin(Double(i)) * cos(Double(i))

                if i % updateInterval == 0 {
                    await MainActor.run {
                        progress = Double(i) / Double(iterations)
                    }
                }
            }

            await MainActor.run {
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
                    .autocapitalization(.none)
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

#Preview {
    DemosTab()
        .autoMobileTheme()
}
