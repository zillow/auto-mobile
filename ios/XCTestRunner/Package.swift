// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "XCTestRunner",
    platforms: [
        .iOS(.v15),
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "XCTestRunner",
            targets: ["XCTestRunner"]
        ),
    ],
    dependencies: [
        // YAML parsing dependency will be added here
        // Example: .package(url: "https://github.com/jpsim/Yams.git", from: "5.0.0")
    ],
    targets: [
        .target(
            name: "XCTestRunner",
            dependencies: []
        ),
        .testTarget(
            name: "XCTestRunnerTests",
            dependencies: ["XCTestRunner"],
            resources: [
                .process("Resources"),
            ]
        ),
    ]
)
