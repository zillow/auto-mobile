import SwiftUI

struct SettingsTab: View {
    @AppStorage("userName") private var userName = ""
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true
    @AppStorage("darkModeEnabled") private var darkModeEnabled = false
    @AppStorage("analyticsEnabled") private var analyticsEnabled = true
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    HStack {
                        Image(systemName: "person.circle.fill")
                            .font(.system(size: 50))
                            .foregroundStyle(theme.primary)

                        VStack(alignment: .leading) {
                            Text(userName.isEmpty ? "Guest User" : userName)
                                .font(.headline)
                                .foregroundStyle(theme.textPrimary)
                            Text("Tap to edit profile")
                                .font(.caption)
                                .foregroundStyle(theme.textSecondary)
                        }
                    }
                    .padding(.vertical, 8)

                    TextField("Display Name", text: $userName)
                }

                Section("Preferences") {
                    Toggle("Enable Notifications", isOn: $notificationsEnabled)

                    Toggle("Dark Mode", isOn: $darkModeEnabled)

                    Toggle("Analytics", isOn: $analyticsEnabled)
                }

                Section("Storage") {
                    NavigationLink {
                        StorageSettingsView()
                    } label: {
                        Label("Manage Storage", systemImage: "internaldrive.fill")
                    }

                    NavigationLink {
                        CacheSettingsView()
                    } label: {
                        Label("Clear Cache", systemImage: "trash.fill")
                    }
                }

                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Text("Build")
                        Spacer()
                        Text("1")
                            .foregroundStyle(.secondary)
                    }

                    Link(destination: URL(string: "https://github.com")!) {
                        HStack {
                            Text("View Source Code")
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        userName = ""
                    }
                    .foregroundStyle(Color.autoMobileRed)
                }
            }
            .scrollContentBackground(.hidden)
            .background(theme.background)
            .navigationTitle("Settings")
        }
    }
}

struct StorageSettingsView: View {
    @State private var documents = 125.5
    @State private var cache = 45.2
    @State private var other = 12.8
    @Environment(\.autoMobileTheme) private var theme

    var total: Double {
        documents + cache + other
    }

    var body: some View {
        List {
            Section {
                VStack(spacing: 16) {
                    Text(String(format: "%.1f MB", total))
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .foregroundStyle(theme.textPrimary)

                    Text("Total Storage Used")
                        .font(.subheadline)
                        .foregroundStyle(theme.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            }

            Section("Breakdown") {
                StorageRow(title: "Documents", size: documents, color: .autoMobileLalala)
                StorageRow(title: "Cache", size: cache, color: .autoMobileRed)
                StorageRow(title: "Other", size: other, color: .autoMobileDarkGrey)
            }
        }
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle("Storage")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct StorageRow: View {
    let title: String
    let size: Double
    let color: Color

    var body: some View {
        HStack {
            Circle()
                .fill(color)
                .frame(width: 12, height: 12)

            Text(title)

            Spacer()

            Text(String(format: "%.1f MB", size))
                .foregroundStyle(.secondary)
        }
    }
}

struct CacheSettingsView: View {
    @State private var showingClearAlert = false
    @State private var isClearing = false
    @Environment(\.autoMobileTheme) private var theme

    var body: some View {
        List {
            Section {
                VStack(spacing: 12) {
                    Image(systemName: "trash.circle.fill")
                        .font(.system(size: 60))
                        .foregroundStyle(Color.autoMobileRed)

                    Text("45.2 MB")
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundStyle(theme.textPrimary)

                    Text("Cached data can be safely cleared")
                        .font(.subheadline)
                        .foregroundStyle(theme.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            }

            Section {
                Button {
                    showingClearAlert = true
                } label: {
                    HStack {
                        Spacer()
                        if isClearing {
                            ProgressView()
                        } else {
                            Text("Clear Cache")
                        }
                        Spacer()
                    }
                }
                .foregroundStyle(Color.autoMobileRed)
                .disabled(isClearing)
            }
        }
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle("Clear Cache")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Clear Cache?", isPresented: $showingClearAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Clear", role: .destructive) {
                clearCache()
            }
        } message: {
            Text("This will remove all cached data. Downloads and saved content will not be affected.")
        }
    }

    private func clearCache() {
        isClearing = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            isClearing = false
        }
    }
}

#Preview {
    SettingsTab()
        .autoMobileTheme()
}
