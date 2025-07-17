import { expect } from "chai";
import * as sinon from "sinon";
import proxyquire from "proxyquire";
import { EventEmitter } from "events";
import { TestGenerationOptions } from "../../src/models/TestAuthoring";
import * as fs from "fs";
import * as path from "path";
import { KotlinTestAuthor } from "../../src/utils/kotlinTestAuthor";

describe("KotlinTestAuthor", function() {
  // Increase timeout for async tests
  this.timeout(5000);

  let bridgeModule: any;
  let bridge: any;
  let sandbox: sinon.SinonSandbox;
  let fsAccessStub: sinon.SinonStub;
  let spawnStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    fsAccessStub = sandbox.stub();
    spawnStub = sandbox.stub();

    // Use proxyquire to inject stubs
    const module = proxyquire("../../src/utils/kotlinTestAuthor", {
      "fs/promises": {
        access: fsAccessStub
      },
      "child_process": {
        spawn: spawnStub
      }
    });

    bridgeModule = module.KotlinTestAuthor;
    bridge = new bridgeModule();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("constructor", () => {
    it("should create instance with default values", () => {
      const defaultBridge = new bridgeModule();
      expect(defaultBridge.getVersion()).to.equal("2.2.0");
      expect(defaultBridge.getJarPath()).to.contain("/tmp/auto-mobile/kotlinpoet");
    });

    it("should create instance with custom version", () => {
      const customBridge = new bridgeModule("2.3.0");
      expect(customBridge.getVersion()).to.equal("2.3.0");
      expect(customBridge.getJarPath()).to.contain("kotlinpoet-jvm-2.3.0.jar");
    });

    it("should create instance with custom jar path", () => {
      const customBridge = new bridgeModule(undefined, "/custom/path/kotlinpoet.jar");
      expect(customBridge.getJarPath()).to.equal("/custom/path/kotlinpoet.jar");
    });
  });

  describe("isAvailable", () => {
    it("should return true when JAR file exists", async () => {
      fsAccessStub.resolves();

      const result = await bridge.isAvailable();

      expect(result).to.be.true;
      expect(fsAccessStub).to.have.been.calledOnce;
    });

    it("should return false when JAR file does not exist", async () => {
      fsAccessStub.rejects(new Error("File not found"));

      const result = await bridge.isAvailable();

      expect(result).to.be.false;
      expect(fsAccessStub).to.have.been.calledOnce;
    });

    it("should return false when JAR path is not set", async () => {
      bridge.setJarPath("");

      const result = await bridge.isAvailable();

      expect(result).to.be.false;
      expect(fsAccessStub).not.to.have.been.called;
    });
  });

  describe("generateTest", () => {
    let mockProcess: any;

    beforeEach(() => {
      mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawnStub.returns(mockProcess);
      fsAccessStub.resolves(); // JAR is available
    });

    it("should generate test successfully with KotlinPoet", async () => {
      const planPath = "/path/to/test.yaml";
      const options: TestGenerationOptions = {
        testClassName: "TestClass",
        testPackage: "com.example.tests",
        kotlinTestOutputPath: "/output/path"
      };

      const expectedResponse = {
        success: true,
        sourceCode: "package com.example.tests\n\nclass TestClass { }",
        className: "TestClass",
        testFilePath: "/output/path/TestClass.kt",
        testMethods: ["testMethod"]
      };

      // Start the async operation
      const resultPromise = bridge.generateTest(planPath, options);

      // Wait a tick to ensure the promise has started
      await new Promise(resolve => setImmediate(resolve));

      // Simulate successful process execution
      mockProcess.stdout.emit("data", JSON.stringify(expectedResponse));
      mockProcess.emit("close", 0);

      const result = await resultPromise;

      expect(result.success).to.be.true;
      expect(result.sourceCode).to.equal(expectedResponse.sourceCode);
      expect(result.className).to.equal(expectedResponse.className);
      expect(result.testFilePath).to.equal(expectedResponse.testFilePath);
      expect(result.testMethods).to.deep.equal(expectedResponse.testMethods);
    });

    it("should handle KotlinPoet process failure", async () => {
      const planPath = "/path/to/test.yaml";
      const options: TestGenerationOptions = {};

      const resultPromise = bridge.generateTest(planPath, options);

      // Wait a tick
      await new Promise(resolve => setImmediate(resolve));

      // Simulate process failure
      mockProcess.stderr.emit("data", "Error: Failed to generate test");
      mockProcess.emit("close", 1);

      const result = await resultPromise;

      expect(result.success).to.be.false;
      expect(result.message).to.contain("KotlinPoet process failed");
    });

    it("should handle JSON parsing errors", async () => {
      const planPath = "/path/to/test.yaml";
      const options: TestGenerationOptions = {};

      const resultPromise = bridge.generateTest(planPath, options);

      // Wait a tick
      await new Promise(resolve => setImmediate(resolve));

      // Simulate invalid JSON response
      mockProcess.stdout.emit("data", "Invalid JSON");
      mockProcess.emit("close", 0);

      const result = await resultPromise;

      expect(result.success).to.be.false;
      expect(result.message).to.contain("Failed to parse KotlinPoet response");
    });

    it("should handle spawn errors", async () => {
      spawnStub.throws(new Error("Failed to spawn process"));

      const planPath = "/path/to/test.yaml";
      const options: TestGenerationOptions = {};

      const result = await bridge.generateTest(planPath, options);

      expect(result.success).to.be.false;
      expect(result.message).to.contain("KotlinPoet generation failed");
    });

    it("should pass all options to KotlinPoet process", async () => {
      const planPath = "/path/to/test.yaml";
      const options: TestGenerationOptions = {
        testClassName: "MyTest",
        testPackage: "com.example",
        kotlinTestOutputPath: "/output",
        useParameterizedTests: true,
        assertionStyle: "junit5"
      };

      const resultPromise = bridge.generateTest(planPath, options);

      // Simulate successful response
      await new Promise(resolve => setImmediate(resolve));

      mockProcess.stdout.emit("data", JSON.stringify({ success: true }));
      mockProcess.emit("close", 0);

      await resultPromise;

      expect(spawnStub).to.have.been.calledOnce;
      const [command, args] = spawnStub.firstCall.args;
      expect(command).to.equal("java");
      expect(args).to.include("--plan");
      expect(args).to.include(planPath);
      expect(args).to.include("--class");
      expect(args).to.include("MyTest");
      expect(args).to.include("--package");
      expect(args).to.include("com.example");
      expect(args).to.include("--output");
      expect(args).to.include("/output");
      expect(args).to.include("--parameterized");
      expect(args).to.include("true");
      expect(args).to.include("--assertion-style");
      expect(args).to.include("junit5");
    });
  });

  describe("setJarPath / getJarPath", () => {
    it("should set and get custom JAR path", () => {
      const customPath = "/custom/path/kotlinpoet.jar";

      bridge.setJarPath(customPath);

      expect(bridge.getJarPath()).to.equal(customPath);
    });
  });

  describe("version management", () => {
    it("should set and get version", () => {
      bridge.setVersion("2.3.0");
      expect(bridge.getVersion()).to.equal("2.3.0");
    });

    it("should update JAR path when version changes", () => {
      bridge.setVersion("2.3.0");
      const jarPath = bridge.getJarPath();
      expect(jarPath).to.equal("/tmp/auto-mobile/kotlinpoet/kotlinpoet-jvm-2.3.0.jar");
    });

    it("should not update JAR path when using custom path", () => {
      process.env.KOTLINPOET_JAR_PATH = "/custom/kotlinpoet.jar";

      // Create new instance with env var set
      const module = proxyquire("../../src/utils/kotlinTestAuthor", {
        "fs/promises": { access: fsAccessStub },
        "child_process": { spawn: spawnStub }
      });
      const customBridge = new module.KotlinTestAuthor();

      customBridge.setVersion("2.3.0");
      expect(customBridge.getJarPath()).to.equal("/custom/kotlinpoet.jar");

      delete process.env.KOTLINPOET_JAR_PATH;
    });
  });

  describe("environment variables", () => {
    it("should use KOTLINPOET_VERSION environment variable", () => {
      process.env.KOTLINPOET_VERSION = "2.1.0";

      const module = proxyquire("../../src/utils/kotlinTestAuthor", {
        "fs/promises": { access: fsAccessStub },
        "child_process": { spawn: spawnStub }
      });
      const envBridge = new module.KotlinTestAuthor();

      expect(envBridge.getVersion()).to.equal("2.1.0");
      expect(envBridge.getJarPath()).to.equal("/tmp/auto-mobile/kotlinpoet/kotlinpoet-jvm-2.1.0.jar");

      delete process.env.KOTLINPOET_VERSION;
    });

    it("should use KOTLINPOET_JAR_PATH environment variable", () => {
      process.env.KOTLINPOET_JAR_PATH = "/env/path/kotlinpoet.jar";

      const module = proxyquire("../../src/utils/kotlinTestAuthor", {
        "fs/promises": { access: fsAccessStub },
        "child_process": { spawn: spawnStub }
      });
      const envBridge = new module.KotlinTestAuthor();

      expect(envBridge.getJarPath()).to.equal("/env/path/kotlinpoet.jar");

      delete process.env.KOTLINPOET_JAR_PATH;
    });
  });

  describe("ensureAvailable", () => {
    const testJarPath = "/tmp/auto-mobile/kotlinpoet/kotlinpoet-jvm-2.2.0.jar";

    beforeEach(async () => {
      // Clean up any existing test JAR before each test
      try {
        if (fs.existsSync(testJarPath)) {
          fs.unlinkSync(testJarPath);
        }
        // Also clean up the directory if empty
        const jarDir = path.dirname(testJarPath);
        if (fs.existsSync(jarDir)) {
          const files = fs.readdirSync(jarDir);
          if (files.length === 0) {
            fs.rmdirSync(jarDir);
          }
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    afterEach(async () => {
      // Clean up after tests
      try {
        if (fs.existsSync(testJarPath)) {
          fs.unlinkSync(testJarPath);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it("should return true if JAR already exists", async () => {
      // Create the directory and a dummy JAR file
      const jarDir = path.dirname(testJarPath);
      fs.mkdirSync(jarDir, { recursive: true });
      fs.writeFileSync(testJarPath, "dummy jar content");

      const bridge = new KotlinTestAuthor();
      const result = await bridge.ensureAvailable();

      expect(result).to.be.true;
      expect(fs.existsSync(testJarPath)).to.be.true;
    });
  });

  describe("process communication", () => {
    let mockProcess: any;

    beforeEach(() => {
      mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      spawnStub.returns(mockProcess);
      fsAccessStub.resolves();
    });

    it("should handle multi-chunk stdout data", async () => {
      const planPath = "/path/to/test.yaml";
      const options: TestGenerationOptions = {};

      const expectedResponse = {
        success: true,
        sourceCode: "test code"
      };

      const resultPromise = bridge.generateTest(planPath, options);

      // Wait a tick
      await new Promise(resolve => setImmediate(resolve));

      // Simulate response in multiple chunks
      mockProcess.stdout.emit("data", JSON.stringify(expectedResponse).substring(0, 10));
      mockProcess.stdout.emit("data", JSON.stringify(expectedResponse).substring(10));
      mockProcess.emit("close", 0);

      const result = await resultPromise;

      expect(result.success).to.be.true;
      expect(result.sourceCode).to.equal("test code");
    });

    it("should capture stderr output", async () => {
      const planPath = "/path/to/test.yaml";
      const options: TestGenerationOptions = {};

      const resultPromise = bridge.generateTest(planPath, options);

      // Wait a tick
      await new Promise(resolve => setImmediate(resolve));

      // Simulate stderr output
      mockProcess.stderr.emit("data", "Warning: ");
      mockProcess.stderr.emit("data", "Something went wrong");
      mockProcess.emit("close", 1);

      const result = await resultPromise;

      expect(result.success).to.be.false;
      expect(result.message).to.contain("Warning: Something went wrong");
    });

    it("should set UTF-8 encoding for Java process", async () => {
      const planPath = "/path/to/test.yaml";
      const options: TestGenerationOptions = {};

      const resultPromise = bridge.generateTest(planPath, options);

      await new Promise(resolve => setImmediate(resolve));

      mockProcess.stdout.emit("data", JSON.stringify({ success: true }));
      mockProcess.emit("close", 0);

      await resultPromise;

      const spawnOptions = spawnStub.firstCall.args[2];
      expect(spawnOptions.env.JAVA_TOOL_OPTIONS).to.equal("-Dfile.encoding=UTF-8");
    });
  });
});
