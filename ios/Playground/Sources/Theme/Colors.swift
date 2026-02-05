import SwiftUI

// MARK: - Design System Color Palette

extension Color {
    // Core AutoMobile colors
    static let autoMobileBlack = Color(hex: 0x000000)
    static let autoMobileRed = Color(hex: 0xFF0000) // Only for standalone "AutoMobile" word/wordmark
    static let autoMobileEggshell = Color(hex: 0xF8F8FF)
    static let autoMobileLalala = Color(hex: 0x1A1A1A)
    static let autoMobileWhite = Color(hex: 0xFFFFFF)

    // Promo video colors
    static let promoOrange = Color(hex: 0xFF3300)
    static let promoBlue = Color(hex: 0x525FE1)

    // Greys
    static let autoMobileLightGrey = Color(hex: 0xBDBDBD)
    static let autoMobileDarkGrey = Color(hex: 0x424242)

    // Semantic colors for states
    static let autoMobileSuccess = Color(hex: 0x4CAF50)
    static let autoMobileWarning = Color(hex: 0xFF9800)
    static let autoMobileError = Color(hex: 0xF44336)
    static let autoMobileInfo = Color.promoBlue
}

// MARK: - Color Hex Initializer

extension Color {
    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: alpha
        )
    }
}
