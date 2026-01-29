import XCTest
@testable import XCTestRunner

final class XCTestRunnerTests: XCTestCase {
    func testExecutePlanBuildsExpectedArguments() throws {
        let planContent = "name: Test Plan\nsteps:\n  - tool: observe"
        let planLoader = FakePlanLoader(content: planContent)
        let mcpClient = FakeMCPClient()
        let timer = FakeTimer()

        mcpClient.queueResponse(success: true, executedSteps: 1, totalSteps: 1)

        let config = AutoMobilePlanExecutor.Configuration(
            transport: .streamableHttp(url: URL(string: "http://localhost:9000/auto-mobile/streamable")!),
            planPath: "test-plan.yaml",
            retryCount: 0,
            timeoutSeconds: 5,
            retryDelaySeconds: 0,
            startStep: 0,
            parameters: [:],
            cleanup: AutoMobilePlanExecutor.CleanupOptions(appId: "com.example.app", clearAppData: true),
            planBundle: nil
        )

        let executor = AutoMobilePlanExecutor(
            configuration: config,
            planLoader: planLoader,
            mcpClient: mcpClient,
            timer: timer,
            logger: NullLogger()
        )

        let metadata = AutoMobilePlanExecutor.TestMetadata(
            testClass: "MyTests",
            testMethod: "testLogin",
            appVersion: "1.2.3",
            gitCommit: "abc123",
            isCi: true
        )

        _ = try executor.execute(testMetadata: metadata)

        XCTAssertEqual(mcpClient.calls.count, 1)
        let call = mcpClient.calls[0]
        XCTAssertEqual(call.name, "executePlan")
        XCTAssertEqual(call.arguments["platform"] as? String, "ios")
        XCTAssertEqual(call.arguments["startStep"] as? Int, 0)
        XCTAssertEqual(call.arguments["cleanupAppId"] as? String, "com.example.app")
        XCTAssertEqual(call.arguments["cleanupClearAppData"] as? Bool, true)

        let testMetadata = call.arguments["testMetadata"] as? [String: Any]
        XCTAssertEqual(testMetadata?["testClass"] as? String, "MyTests")
        XCTAssertEqual(testMetadata?["testMethod"] as? String, "testLogin")
        XCTAssertEqual(testMetadata?["appVersion"] as? String, "1.2.3")
        XCTAssertEqual(testMetadata?["gitCommit"] as? String, "abc123")
        XCTAssertEqual(testMetadata?["isCi"] as? Bool, true)

        let encoded = call.arguments["planContent"] as? String
        XCTAssertNotNil(encoded)
        let decoded = decodePlanContent(from: encoded)
        XCTAssertEqual(decoded, planContent)
        XCTAssertTrue(timer.sleeps.isEmpty)
    }

    func testExecutePlanRetriesOnFailure() throws {
        let planLoader = FakePlanLoader(content: "name: Retry Plan\nsteps:\n  - tool: observe")
        let mcpClient = FakeMCPClient()
        let timer = FakeTimer()

        mcpClient.queueError(NSError(domain: "MCP", code: 1, userInfo: [NSLocalizedDescriptionKey: "Timeout"]))
        mcpClient.queueResponse(success: true, executedSteps: 1, totalSteps: 1)

        let config = AutoMobilePlanExecutor.Configuration(
            transport: .streamableHttp(url: URL(string: "http://localhost:9000/auto-mobile/streamable")!),
            planPath: "retry-plan.yaml",
            retryCount: 1,
            timeoutSeconds: 5,
            retryDelaySeconds: 1,
            startStep: 0,
            parameters: [:],
            cleanup: nil,
            planBundle: nil
        )

        let executor = AutoMobilePlanExecutor(
            configuration: config,
            planLoader: planLoader,
            mcpClient: mcpClient,
            timer: timer,
            logger: NullLogger()
        )

        _ = try executor.execute(testMetadata: nil)

        XCTAssertEqual(mcpClient.calls.count, 2)
        XCTAssertEqual(timer.sleeps, [1])
    }

    func testExecutePlanStopsAfterRetries() {
        let planLoader = FakePlanLoader(content: "name: Fail Plan\nsteps:\n  - tool: observe")
        let mcpClient = FakeMCPClient()
        let timer = FakeTimer()

        mcpClient.queueError(NSError(domain: "MCP", code: 1, userInfo: [NSLocalizedDescriptionKey: "Timeout"]))
        mcpClient.queueError(NSError(domain: "MCP", code: 1, userInfo: [NSLocalizedDescriptionKey: "Timeout"]))

        let config = AutoMobilePlanExecutor.Configuration(
            transport: .streamableHttp(url: URL(string: "http://localhost:9000/auto-mobile/streamable")!),
            planPath: "fail-plan.yaml",
            retryCount: 1,
            timeoutSeconds: 5,
            retryDelaySeconds: 1,
            startStep: 0,
            parameters: [:],
            cleanup: nil,
            planBundle: nil
        )

        let executor = AutoMobilePlanExecutor(
            configuration: config,
            planLoader: planLoader,
            mcpClient: mcpClient,
            timer: timer,
            logger: NullLogger()
        )

        XCTAssertThrowsError(try executor.execute(testMetadata: nil))
        XCTAssertEqual(timer.sleeps, [1])
    }

    func testParameterSubstitution() throws {
        let planContent = "name: Substitution\nsteps:\n  - tool: launchApp\n    appId: ${appId}"
        let planLoader = FakePlanLoader(content: planContent)
        let mcpClient = FakeMCPClient()

        mcpClient.queueResponse(success: true, executedSteps: 1, totalSteps: 1)

        let config = AutoMobilePlanExecutor.Configuration(
            transport: .streamableHttp(url: URL(string: "http://localhost:9000/auto-mobile/streamable")!),
            planPath: "sub-plan.yaml",
            retryCount: 0,
            timeoutSeconds: 5,
            retryDelaySeconds: 0,
            startStep: 0,
            parameters: ["appId": "com.example.app"],
            cleanup: nil,
            planBundle: nil
        )

        let executor = AutoMobilePlanExecutor(
            configuration: config,
            planLoader: planLoader,
            mcpClient: mcpClient,
            timer: FakeTimer(),
            logger: NullLogger()
        )

        _ = try executor.execute(testMetadata: nil)

        guard let encoded = mcpClient.calls.first?.arguments["planContent"] as? String else {
            XCTFail("Missing plan content")
            return
        }
        guard let decoded = decodePlanContent(from: encoded) else {
            XCTFail("Plan content was not base64 encoded")
            return
        }
        XCTAssertTrue(decoded.contains("appId: com.example.app"))
    }

    func testPlanPlatformOverridesDefault() throws {
        let planContent = "name: Platform Plan\nplatform: android\nsteps:\n  - tool: observe"
        let planLoader = FakePlanLoader(content: planContent)
        let mcpClient = FakeMCPClient()

        mcpClient.queueResponse(success: true, executedSteps: 1, totalSteps: 1)

        let config = AutoMobilePlanExecutor.Configuration(
            transport: .streamableHttp(url: URL(string: "http://localhost:9000/auto-mobile/streamable")!),
            planPath: "platform-plan.yaml",
            retryCount: 0,
            timeoutSeconds: 5,
            retryDelaySeconds: 0,
            startStep: 0,
            parameters: [:],
            cleanup: nil,
            planBundle: nil,
            defaultPlatform: .ios
        )

        let executor = AutoMobilePlanExecutor(
            configuration: config,
            planLoader: planLoader,
            mcpClient: mcpClient,
            timer: FakeTimer(),
            logger: NullLogger()
        )

        _ = try executor.execute(testMetadata: nil)

        XCTAssertEqual(mcpClient.calls.first?.arguments["platform"] as? String, "android")
    }

    func testPlanDevicesPassedToExecutePlan() throws {
        let planContent = """
        name: Multi-device Plan
        devices:
          - label: ios-1
            platform: ios
        steps:
          - tool: observe
            device: ios-1
        """
        let planLoader = FakePlanLoader(content: planContent)
        let mcpClient = FakeMCPClient()

        mcpClient.queueResponse(success: true, executedSteps: 1, totalSteps: 1)

        let config = AutoMobilePlanExecutor.Configuration(
            transport: .streamableHttp(url: URL(string: "http://localhost:9000/auto-mobile/streamable")!),
            planPath: "multi-device.yaml",
            retryCount: 0,
            timeoutSeconds: 5,
            retryDelaySeconds: 0,
            startStep: 0,
            parameters: [:],
            cleanup: nil,
            planBundle: nil,
            defaultPlatform: .ios
        )

        let executor = AutoMobilePlanExecutor(
            configuration: config,
            planLoader: planLoader,
            mcpClient: mcpClient,
            timer: FakeTimer(),
            logger: NullLogger()
        )

        _ = try executor.execute(testMetadata: nil)

        let devices = mcpClient.calls.first?.arguments["devices"] as? [String]
        XCTAssertEqual(devices, ["ios-1"])
    }

    func testAutoMobileTestObserver() {
        let observer = AutoMobileTestObserver.register()
        XCTAssertNotNil(observer)
    }

    func testExecutePlanFailureIncludesFailedStepInfo() {
        let planContent = "name: Fail Plan\nsteps:\n  - tool: tapOn\n    element: Submit Button"
        let planLoader = FakePlanLoader(content: planContent)
        let mcpClient = FakeMCPClient()
        let timer = FakeTimer()

        mcpClient.queueResponse(
            success: false,
            executedSteps: 3,
            totalSteps: 10,
            failedStep: (
                stepIndex: 3,
                tool: "tapOn",
                error: "Element \"Submit Button\" not found on screen",
                device: "iPhone-15-Pro"
            ),
            error: "Plan execution failed"
        )

        let config = AutoMobilePlanExecutor.Configuration(
            transport: .streamableHttp(url: URL(string: "http://localhost:9000/auto-mobile/streamable")!),
            planPath: "fail-plan.yaml",
            retryCount: 0,
            timeoutSeconds: 5,
            retryDelaySeconds: 0,
            startStep: 0,
            parameters: [:],
            cleanup: nil,
            planBundle: nil
        )

        let executor = AutoMobilePlanExecutor(
            configuration: config,
            planLoader: planLoader,
            mcpClient: mcpClient,
            timer: timer,
            logger: NullLogger()
        )

        XCTAssertThrowsError(try executor.execute(testMetadata: nil)) { error in
            let errorDescription = String(describing: error)
            XCTAssertTrue(errorDescription.contains("step 3"), "Error should contain step index")
            XCTAssertTrue(errorDescription.contains("tapOn"), "Error should contain tool name")
            XCTAssertTrue(
                errorDescription.contains("Element \"Submit Button\" not found on screen"),
                "Error should contain error text"
            )
            XCTAssertTrue(errorDescription.contains("iPhone-15-Pro"), "Error should contain device")
            XCTAssertTrue(errorDescription.contains("3/10"), "Error should contain step counts")
        }
    }

    func testExecutePlanFailureFallsBackToErrorWhenNoFailedStep() {
        let planContent = "name: Fail Plan\nsteps:\n  - tool: observe"
        let planLoader = FakePlanLoader(content: planContent)
        let mcpClient = FakeMCPClient()
        let timer = FakeTimer()

        mcpClient.queueResponse(
            success: false,
            executedSteps: 5,
            totalSteps: 10,
            failedStep: nil,
            error: "Connection timeout"
        )

        let config = AutoMobilePlanExecutor.Configuration(
            transport: .streamableHttp(url: URL(string: "http://localhost:9000/auto-mobile/streamable")!),
            planPath: "fail-plan.yaml",
            retryCount: 0,
            timeoutSeconds: 5,
            retryDelaySeconds: 0,
            startStep: 0,
            parameters: [:],
            cleanup: nil,
            planBundle: nil
        )

        let executor = AutoMobilePlanExecutor(
            configuration: config,
            planLoader: planLoader,
            mcpClient: mcpClient,
            timer: timer,
            logger: NullLogger()
        )

        XCTAssertThrowsError(try executor.execute(testMetadata: nil)) { error in
            let errorDescription = String(describing: error)
            XCTAssertTrue(
                errorDescription.contains("Connection timeout"),
                "Error should contain fallback error message"
            )
        }
    }
}

private struct FakePlanLoader: AutoMobilePlanLoading {
    let content: String

    func loadPlan(at _: String, bundle _: Bundle?) throws -> String {
        return content
    }
}

private final class FakeMCPClient: AutoMobileMCPClient {
    struct Call {
        let name: String
        let arguments: [String: Any]
    }

    private var queuedResults: [Result<MCPToolResponse, Error>] = []
    private(set) var calls: [Call] = []
    private(set) var initializeCount = 0

    func queueResponse(success: Bool, executedSteps: Int, totalSteps: Int) {
        let payload: [String: Any] = [
            "success": success,
            "executedSteps": executedSteps,
            "totalSteps": totalSteps,
        ]
        let data = try? JSONSerialization.data(withJSONObject: payload, options: [])
        let text = String(data: data ?? Data(), encoding: .utf8) ?? "{}"
        queuedResults.append(.success(MCPToolResponse(text: text)))
    }

    func queueResponse(
        success: Bool,
        executedSteps: Int,
        totalSteps: Int,
        failedStep: (stepIndex: Int, tool: String, error: String, device: String?)?,
        error: String?
    ) {
        var payload: [String: Any] = [
            "success": success,
            "executedSteps": executedSteps,
            "totalSteps": totalSteps,
        ]
        if let failedStep = failedStep {
            var failedStepDict: [String: Any] = [
                "stepIndex": failedStep.stepIndex,
                "tool": failedStep.tool,
                "error": failedStep.error,
            ]
            if let device = failedStep.device {
                failedStepDict["device"] = device
            }
            payload["failedStep"] = failedStepDict
        }
        if let error = error {
            payload["error"] = error
        }
        let data = try? JSONSerialization.data(withJSONObject: payload, options: [])
        let text = String(data: data ?? Data(), encoding: .utf8) ?? "{}"
        queuedResults.append(.success(MCPToolResponse(text: text)))
    }

    func queueError(_ error: Error) {
        queuedResults.append(.failure(error))
    }

    func initialize(timeout _: TimeInterval) throws {
        initializeCount += 1
    }

    func callTool(name: String, arguments: [String: Any], timeout _: TimeInterval) throws -> MCPToolResponse {
        calls.append(Call(name: name, arguments: arguments))
        guard !queuedResults.isEmpty else {
            return MCPToolResponse(text: "{\"success\":true,\"executedSteps\":0,\"totalSteps\":0}")
        }
        return try queuedResults.removeFirst().get()
    }

    func readResource(uri _: String, timeout _: TimeInterval) throws -> MCPResourceResponse {
        return MCPResourceResponse(text: "{}")
    }

    func resetSession() {}
}

private struct NullLogger: AutoMobileLogger {
    func info(_: String) {}
    func warn(_: String) {}
    func error(_: String) {}
}

private func decodePlanContent(from encoded: String?) -> String? {
    guard let encoded = encoded else {
        return nil
    }
    guard encoded.hasPrefix("base64:") else {
        return nil
    }
    let base64 = String(encoded.dropFirst("base64:".count))
    guard let data = Data(base64Encoded: base64) else {
        return nil
    }
    return String(data: data, encoding: .utf8)
}
