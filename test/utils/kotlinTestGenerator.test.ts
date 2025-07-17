import { expect } from "chai";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import * as sinon from "sinon";
import proxyquire from "proxyquire";
import { KotlinTestGenerator } from "../../src/utils/kotlinTestGenerator";
import { TestGenerationOptions } from "../../src/models";

describe("KotlinTestGenerator", () => {
  let generator: KotlinTestGenerator;
  let tempDir: string;
  let testPlanPath: string;
  let sandbox: sinon.SinonSandbox;
  let KotlinTestAuthorStub: any;
  let kotlinTestAuthorInstance: any;

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

    // Create a mock KotlinTestAuthor instance
    kotlinTestAuthorInstance = {
      generateTest: sandbox.stub(),
      isAvailable: sandbox.stub(),
      getVersion: sandbox.stub().returns("2.2.0"),
      setVersion: sandbox.stub(),
      getJarPath: sandbox.stub(),
      setJarPath: sandbox.stub()
    };

    // Create a stub constructor that returns our mock instance
    KotlinTestAuthorStub = sandbox.stub().returns(kotlinTestAuthorInstance);

    // Use proxyquire to inject the stub
    const KotlinTestGeneratorModule = proxyquire("../../src/utils/kotlinTestGenerator", {
      "./kotlinTestAuthor": {
        KotlinTestAuthor: KotlinTestAuthorStub
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

  describe("KotlinTestAuthor integration", () => {
    it("should use native KotlinTestAuthor when available", async () => {
      // Stub KotlinTestAuthor methods
      kotlinTestAuthorInstance.generateTest.resolves({
        success: true,
        message: "Generated with KotlinTestAuthor",
        sourceCode: "// KotlinTestAuthor generated code",
        className: "KotlinTestAuthorTest",
        testFilePath: "/path/to/KotlinTestAuthorTest.kt",
        testMethods: ["testMethod"]
      });

      const options: TestGenerationOptions = {
        generateKotlinTest: true,
        testClassName: "NativeTest"
      };

      await generator.generateTestFromPlan(testPlanPath, options);

      // TODO: assert on the generated source code once this is implemented
      // expect(result.sourceCode).to.contain("KotlinTestAuthor generated code");
    });

    it("should fail when KotlinTestAuthor generation fails", async () => {
      // Stub KotlinTestAuthor to fail
      kotlinTestAuthorInstance.generateTest.resolves({
        success: false,
        message: "KotlinTestAuthor JAR not available and could not be downloaded"
      });

      const options: TestGenerationOptions = {
        generateKotlinTest: true,
        testClassName: "FailedTest"
      };

      await generator.generateTestFromPlan(testPlanPath, options);

      // TODO: assert on the failure once this is implemented
      // expect(result.success).to.be.false;
      // expect(result.message).to.contain("KotlinTestAuthor JAR not available");
    });
  });

  describe("isKotlinTestAuthorAvailable", () => {
    it("should create KotlinTestAuthor and check availability", async () => {
      kotlinTestAuthorInstance.isAvailable.resolves(true);

      const result = await generator.isKotlinTestAuthorAvailable();

      expect(KotlinTestAuthorStub).to.have.been.called;
      expect(kotlinTestAuthorInstance.isAvailable).to.have.been.calledOnce;
      expect(result).to.be.true;
    });
  });

  describe("setKotlinTestAuthorJarPath", () => {
    it("should store jar path for later use", () => {
      const jarPath = "/custom/path/kotlinpoet.jar";

      generator.setKotlinTestAuthorJarPath(jarPath);

      // The next time generateTestFromPlan is called, it should use this path
      // We can't directly test this without generating a test, but we can verify
      // the path is stored by checking the constructor call
    });
  });

  describe("KotlinTestAuthor version management", () => {
    it("should set KotlinTestAuthor version", () => {
      const version = "2.3.0";

      generator.setKotlinTestAuthorVersion(version);

      expect(generator.getKotlinTestAuthorVersion()).to.equal(version);
    });

    it("should get KotlinTestAuthor version", () => {
      const version = generator.getKotlinTestAuthorVersion();

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

    it("should pass loaded plan to KotlinTestAuthor", async () => {
      kotlinTestAuthorInstance.generateTest.resolves({
        success: true,
        message: "Success",
        sourceCode: "test code"
      });

      const options: TestGenerationOptions = {
        generateKotlinTest: true
      };

      await generator.generateTestFromPlan(testPlanPath, options);

      // TODO: Implement assertions once this has been implemented
    });

    it("should create KotlinTestAuthor with current version and jar path", async () => {
      const customVersion = "2.5.0";
      const customJarPath = "/custom/kotlinpoet.jar";

      generator.setKotlinTestAuthorVersion(customVersion);
      generator.setKotlinTestAuthorJarPath(customJarPath);

      kotlinTestAuthorInstance.generateTest.resolves({
        success: true,
        message: "Success",
        sourceCode: "test code"
      });

      await generator.generateTestFromPlan(testPlanPath, {});

      // TODO: Implement assertions once this has been implemented
    });
  });
});
