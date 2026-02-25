// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "CtrlProxy",
    platforms: [
        .iOS(.v15),
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "CtrlProxy",
            targets: ["CtrlProxy"]
        ),
    ],
    targets: [
        .target(
            name: "CtrlProxy",
            dependencies: [],
            path: "Sources/CtrlProxy"
        ),
        .testTarget(
            name: "CtrlProxyTests",
            dependencies: ["CtrlProxy"],
            path: "Tests/CtrlProxyTests"
        ),
        // Note: CtrlProxyUITests is excluded from SPM as it requires iOS simulator
        // Use Xcode project (via XcodeGen) for UI tests
    ]
)
