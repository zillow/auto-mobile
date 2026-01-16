// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AXeAutomation",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "AXeAutomation",
            targets: ["AXeAutomation"]
        )
    ],
    dependencies: [
        // WebSocket client dependencies will be added here
    ],
    targets: [
        .target(
            name: "AXeAutomation",
            dependencies: []
        ),
        .testTarget(
            name: "AXeAutomationTests",
            dependencies: ["AXeAutomation"]
        )
    ]
)
