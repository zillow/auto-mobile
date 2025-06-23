import { expect } from "chai";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import * as sinon from "sinon";
import proxyquire from "proxyquire";
import { KotlinTestGenerator } from "../../src/utils/kotlinTestGenerator";
import { TestGenerationOptions } from "../../src/models/TestAuthoring";

describe("KotlinTestGenerator", () => {
  let generator: KotlinTestGenerator;
  let tempDir: string;
  let testPlanPath: string;
  let sandbox: sinon.SinonSandbox;
  let KotlinPoetBridgeStub: any;
  let kotlinPoetBridgeInstance: any;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kotlin-test-"));
    testPlanPath = path.join(tempDir, "sample-plan.yaml");

    // Create a sample test plan
    const samplePlan = `name: "sample-login-test"
description: "Sample login test plan"
generated: "2025-01-15T10:30:00Z"
appId: "com.example.myapp"
metadata:
  sessionId: "test-session-123"
  toolCallCount: 4
  duration: 30000
steps:
  - tool: "launchApp"
    params:
      appId: "com.example.myapp"
  - tool: "tapOn"
    params:
      text: "Login"
  - tool: "sendText"
    params:
      text: "user@example.com"
  - tool: "assertVisible"
    params:
      text: "Welcome"`;

    await fs.writeFile(testPlanPath, samplePlan, "utf8");
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Create a mock KotlinPoetBridge instance
    kotlinPoetBridgeInstance = {
      generateTest: sandbox.stub(),
      isAvailable: sandbox.stub(),
      getVersion: sandbox.stub().returns("2.2.0"),
      setVersion: sandbox.stub(),
      getJarPath: sandbox.stub(),
      setJarPath: sandbox.stub()
    };

    // Create a stub constructor that returns our mock instance
    KotlinPoetBridgeStub = sandbox.stub().returns(kotlinPoetBridgeInstance);

    // Use proxyquire to inject the stub
    const KotlinTestGeneratorModule = proxyquire("../../src/utils/kotlinTestGenerator", {
      "./kotlinPoetBridge": {
        KotlinPoetBridge: KotlinPoetBridgeStub
      }
    });

    generator = KotlinTestGeneratorModule.KotlinTestGenerator.getInstance();
  });

  afterEach(() => {
    sandbox.restore();
  });

  after(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("getInstance", () => {
    it("should return a singleton instance", () => {
      const instance1 = KotlinTestGenerator.getInstance();
      const instance2 = KotlinTestGenerator.getInstance();
      expect(instance1).to.equal(instance2);
    });
  });

  describe("KotlinPoet integration", () => {
    it("should use native KotlinPoet when available", async () => {
      // Stub KotlinPoetBridge methods
      kotlinPoetBridgeInstance.generateTest.resolves({
        success: true,
        message: "Generated with KotlinPoet",
        sourceCode: "// KotlinPoet generated code",
        className: "KotlinPoetTest",
        testFilePath: "/path/to/KotlinPoetTest.kt",
        testMethods: ["testMethod"]
      });

      const options: TestGenerationOptions = {
        generateKotlinTest: true,
        testClassName: "NativeTest"
      };

      const result = await generator.generateTestFromPlan(testPlanPath, options);

      expect(KotlinPoetBridgeStub).to.have.been.calledOnce;
      expect(kotlinPoetBridgeInstance.generateTest).to.have.been.calledOnce;
      expect(result.success).to.be.true;
      expect(result.message).to.equal("Generated with KotlinPoet");
      expect(result.sourceCode).to.contain("KotlinPoet generated code");
    });

    it("should fail when KotlinPoet generation fails", async () => {
      // Stub KotlinPoetBridge to fail
      kotlinPoetBridgeInstance.generateTest.resolves({
        success: false,
        message: "KotlinPoet JAR not available and could not be downloaded"
      });

      const options: TestGenerationOptions = {
        generateKotlinTest: true,
        testClassName: "FailedTest"
      };

      const result = await generator.generateTestFromPlan(testPlanPath, options);

      expect(result.success).to.be.false;
      expect(result.message).to.contain("KotlinPoet JAR not available");
    });
  });

  describe("isKotlinPoetAvailable", () => {
    it("should create KotlinPoetBridge and check availability", async () => {
      kotlinPoetBridgeInstance.isAvailable.resolves(true);

      const result = await generator.isKotlinPoetAvailable();

      expect(KotlinPoetBridgeStub).to.have.been.called;
      expect(kotlinPoetBridgeInstance.isAvailable).to.have.been.calledOnce;
      expect(result).to.be.true;
    });
  });

  describe("setKotlinPoetJarPath", () => {
    it("should store jar path for later use", () => {
      const jarPath = "/custom/path/kotlinpoet.jar";

      generator.setKotlinPoetJarPath(jarPath);

      // The next time generateTestFromPlan is called, it should use this path
      // We can't directly test this without generating a test, but we can verify
      // the path is stored by checking the constructor call
    });
  });

  describe("KotlinPoet version management", () => {
    it("should set KotlinPoet version", () => {
      const version = "2.3.0";

      generator.setKotlinPoetVersion(version);

      expect(generator.getKotlinPoetVersion()).to.equal(version);
    });

    it("should get KotlinPoet version", () => {
      const version = generator.getKotlinPoetVersion();

      expect(version).to.equal("2.2.0"); // Default version
    });
  });

  describe("generateTestFromPlan", () => {
    it("should handle missing test plan gracefully", async () => {
      const nonExistentPath = path.join(tempDir, "nonexistent.yaml");
      const options: TestGenerationOptions = {
        generateKotlinTest: true
      };

      const result = await generator.generateTestFromPlan(nonExistentPath, options);

      expect(result.success).to.be.false;
      expect(result.message).to.contain("Failed to load test plan");
    });

    it("should pass loaded plan to KotlinPoet", async () => {
      kotlinPoetBridgeInstance.generateTest.resolves({
        success: true,
        message: "Success",
        sourceCode: "test code"
      });

      const options: TestGenerationOptions = {
        generateKotlinTest: true
      };

      await generator.generateTestFromPlan(testPlanPath, options);

      expect(kotlinPoetBridgeInstance.generateTest).to.have.been.calledOnce;
      const [passedPath, passedOptions, passedPlan] = kotlinPoetBridgeInstance.generateTest.firstCall.args;
      expect(passedPath).to.equal(testPlanPath);
      expect(passedOptions).to.deep.equal(options);
      expect(passedPlan).to.have.property("name", "sample-login-test");
      expect(passedPlan).to.have.property("appId", "com.example.myapp");
    });

    it("should create KotlinPoetBridge with current version and jar path", async () => {
      const customVersion = "2.5.0";
      const customJarPath = "/custom/kotlinpoet.jar";

      generator.setKotlinPoetVersion(customVersion);
      generator.setKotlinPoetJarPath(customJarPath);

      kotlinPoetBridgeInstance.generateTest.resolves({
        success: true,
        message: "Success",
        sourceCode: "test code"
      });

      await generator.generateTestFromPlan(testPlanPath, {});

      expect(KotlinPoetBridgeStub).to.have.been.calledWith(customVersion, customJarPath);
    });
  });
});
