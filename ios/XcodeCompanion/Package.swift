// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "XcodeCompanion",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "AutoMobileCompanion",
            targets: ["AutoMobileCompanion"]
        )
    ],
    dependencies: [
        // SwiftUI and Combine are built-in
    ],
    targets: [
        .executableTarget(
            name: "AutoMobileCompanion",
            dependencies: [],
            resources: [
                .process("Resources")
            ]
        ),
        .testTarget(
            name: "AutoMobileCompanionTests",
            dependencies: ["AutoMobileCompanion"]
        )
    ]
)
