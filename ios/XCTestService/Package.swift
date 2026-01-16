// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "XCTestService",
    platforms: [
        .iOS(.v15),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "XCTestService",
            targets: ["XCTestService"]
        )
    ],
    targets: [
        .target(
            name: "XCTestService",
            dependencies: [],
            path: "Sources/XCTestService"
        ),
        .testTarget(
            name: "XCTestServiceUITests",
            dependencies: ["XCTestService"],
            path: "Tests/XCTestServiceUITests"
        )
    ]
)
