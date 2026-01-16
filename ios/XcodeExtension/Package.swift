// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "XcodeExtension",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "XcodeExtension",
            targets: ["XcodeExtension"]
        )
    ],
    dependencies: [
        // XcodeKit is provided by Xcode
    ],
    targets: [
        .target(
            name: "XcodeExtension",
            dependencies: []
        ),
        .testTarget(
            name: "XcodeExtensionTests",
            dependencies: ["XcodeExtension"]
        )
    ]
)
