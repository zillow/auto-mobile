// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AccessibilityService",
    platforms: [
        .iOS(.v15)
    ],
    products: [
        .library(
            name: "AccessibilityService",
            targets: ["AccessibilityService"]
        ),
        .executable(
            name: "AccessibilityServiceApp",
            targets: ["AccessibilityServiceApp"]
        )
    ],
    dependencies: [
        // WebSocket server dependencies will be added here
        // Example: .package(url: "https://github.com/vapor/websocket-kit.git", from: "2.0.0")
    ],
    targets: [
        .target(
            name: "AccessibilityService",
            dependencies: []
        ),
        .executableTarget(
            name: "AccessibilityServiceApp",
            dependencies: ["AccessibilityService"]
        ),
        .testTarget(
            name: "AccessibilityServiceTests",
            dependencies: ["AccessibilityService"]
        )
    ]
)
