import SwiftUI

// MARK: - AutoMobile Theme

struct AutoMobileTheme {
    let colorScheme: ColorScheme

    /// Primary colors
    var primary: Color {
        colorScheme == .dark ? .autoMobileWhite : .autoMobileLalala
    }

    var onPrimary: Color {
        colorScheme == .dark ? .autoMobileLalala : .autoMobileWhite
    }

    /// Secondary colors (red accent)
    var secondary: Color {
        .autoMobileRed
    }

    var onSecondary: Color {
        .autoMobileWhite
    }

    /// Background colors
    var background: Color {
        colorScheme == .dark ? .autoMobileBlack : .autoMobileEggshell
    }

    var onBackground: Color {
        colorScheme == .dark ? .autoMobileWhite : .autoMobileLalala
    }

    /// Surface colors
    var surface: Color {
        colorScheme == .dark ? .autoMobileLalala : .autoMobileWhite
    }

    var onSurface: Color {
        colorScheme == .dark ? .autoMobileWhite : .autoMobileBlack
    }

    var surfaceVariant: Color {
        colorScheme == .dark ? .autoMobileLalala : .autoMobileEggshell
    }

    /// Semantic colors
    var success: Color {
        .autoMobileSuccess
    }

    var warning: Color {
        .autoMobileWarning
    }

    var error: Color {
        .autoMobileError
    }

    var info: Color {
        .autoMobileInfo
    }

    /// Text colors
    var textPrimary: Color {
        onSurface
    }

    var textSecondary: Color {
        colorScheme == .dark ? .autoMobileLightGrey : .autoMobileDarkGrey
    }
}

// MARK: - Environment Key

private struct AutoMobileThemeKey: EnvironmentKey {
    static let defaultValue = AutoMobileTheme(colorScheme: .light)
}

extension EnvironmentValues {
    var autoMobileTheme: AutoMobileTheme {
        get { self[AutoMobileThemeKey.self] }
        set { self[AutoMobileThemeKey.self] = newValue }
    }
}

// MARK: - Theme View Modifier

struct AutoMobileThemeModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .environment(\.autoMobileTheme, AutoMobileTheme(colorScheme: colorScheme))
            .tint(.autoMobileRed)
            .accentColor(.autoMobileRed)
    }
}

extension View {
    func autoMobileTheme() -> some View {
        modifier(AutoMobileThemeModifier())
    }
}

// MARK: - Themed View Helpers

extension View {
    func autoMobileSurface() -> some View {
        modifier(AutoMobileSurfaceModifier())
    }

    func autoMobileBackground() -> some View {
        modifier(AutoMobileBackgroundModifier())
    }
}

struct AutoMobileSurfaceModifier: ViewModifier {
    @Environment(\.autoMobileTheme) private var theme

    func body(content: Content) -> some View {
        content
            .background(theme.surface)
            .foregroundStyle(theme.onSurface)
    }
}

struct AutoMobileBackgroundModifier: ViewModifier {
    @Environment(\.autoMobileTheme) private var theme

    func body(content: Content) -> some View {
        content
            .background(theme.background)
            .foregroundStyle(theme.onBackground)
    }
}
