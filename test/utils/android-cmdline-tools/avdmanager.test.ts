import { expect } from "chai";
import sinon from "sinon";
import sinonChai from "sinon-chai";
import { use } from "chai";
import { AvdManagerDependencies } from "../../../src/utils/android-cmdline-tools/avdmanager";

use(sinonChai);

describe("AVDManager", function() {
  this.timeout(15000);
  let sandbox: sinon.SinonSandbox;
  let mockLocation: any;
  let avdmanager: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Clear module cache first
    delete require.cache[require.resolve("../../../src/utils/android-cmdline-tools/avdmanager")];
    delete require.cache[require.resolve("../../../src/utils/android-cmdline-tools/detection")];
    delete require.cache[require.resolve("../../../src/utils/android-cmdline-tools/install")];

    // Now require the modules
    avdmanager = require("../../../src/utils/android-cmdline-tools/avdmanager");

    // Mock location
    mockLocation = {
      path: "/mock/sdk/cmdline-tools/latest",
      source: "manual" as const,
      version: "test",
      available_tools: ["avdmanager", "sdkmanager"]
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  // Helper function to create mock dependencies
  function createMockDependencies(overrides: Partial<AvdManagerDependencies> = {}): AvdManagerDependencies {
    return {
      spawn: sandbox.stub(),
      existsSync: sandbox.stub(),
      logger: {
        info: sandbox.stub(),
        warn: sandbox.stub(),
        error: sandbox.stub(),
        debug: sandbox.stub(),
        setLogLevel: sandbox.stub(),
        getLogLevel: sandbox.stub(),
        enableStdoutLogging: sandbox.stub(),
        disableStdoutLogging: sandbox.stub(),
        close: sandbox.stub()
      },
      detectAndroidCommandLineTools: sandbox.stub().resolves([mockLocation]),
      getBestAndroidToolsLocation: sandbox.stub().returns(mockLocation),
      validateRequiredTools: sandbox.stub().returns({ valid: true, missing: [] }),
      installAndroidTools: sandbox.stub().resolves({
        success: true,
        installed_tools: ["avdmanager", "sdkmanager"],
        failed_tools: [],
        installation_path: "/mock/path",
        installation_method: "manual",
        message: "Success"
      }),
      ...overrides
    };
  }

  describe("acceptLicenses", () => {
    it("should accept licenses successfully", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/sdkmanager").returns(true);
      mockChild.on.withArgs("close").callsArgWith(1, 0);

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.true;
      expect(result.message).to.equal("Android SDK licenses accepted");
      expect(mockDeps.spawn).to.have.been.calledWith(
        "/mock/sdk/cmdline-tools/latest/bin/sdkmanager",
        ["--licenses"]
      );
    });

    it("should handle license acceptance failure", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/sdkmanager").returns(true);

      let stderrCallback: (data: Buffer) => void;
      mockChild.stderr.on.withArgs("data").callsFake((event, callback) => {
        stderrCallback = callback;
      });
      mockChild.on.withArgs("close").callsFake((event, callback) => {
        if (stderrCallback) {
          stderrCallback(Buffer.from("License error"));
        }
        callback(1);
      });

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("License acceptance failed");
    });

    it("should install tools if not available", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/sdkmanager").returns(true);

      // First call - no tools found
      mockDeps.detectAndroidCommandLineTools.onFirstCall().resolves([]);
      mockDeps.getBestAndroidToolsLocation.onFirstCall().returns(null);

      // Second call - tools found after installation
      mockDeps.detectAndroidCommandLineTools.onSecondCall().resolves([mockLocation]);
      mockDeps.getBestAndroidToolsLocation.onSecondCall().returns(mockLocation);

      mockChild.on.withArgs("close").callsArgWith(1, 0);

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(mockDeps.installAndroidTools).to.have.been.calledWith({
        tools: ["avdmanager", "sdkmanager"],
        force: false
      });
      expect(result.success).to.be.true;
    });
  });

  describe("listSystemImages", () => {
    it("should list system images successfully", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/sdkmanager").returns(true);

      let stdoutCallback: (data: Buffer) => void;
      mockChild.stdout.on.withArgs("data").callsFake((event, callback) => {
        stdoutCallback = callback;
      });

      mockChild.on.withArgs("close").callsFake((event, callback) => {
        if (stdoutCallback) {
          const mockOutput = `
Available Packages:
  system-images;android-33;google_apis;arm64-v8a | 9
  system-images;android-34;google_apis;x86_64    | 5
          `;
          stdoutCallback(Buffer.from(mockOutput));
        }
        callback(0);
      });

      const result = await avdmanager.listSystemImages(undefined, mockDeps);

      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.deep.include({
        packageName: "system-images;android-33;google_apis;arm64-v8a",
        apiLevel: 33,
        tag: "google_apis",
        abi: "arm64-v8a"
      });
      expect(result[1]).to.deep.include({
        packageName: "system-images;android-34;google_apis;x86_64",
        apiLevel: 34,
        tag: "google_apis",
        abi: "x86_64"
      });
    });

    it("should filter system images by criteria", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/sdkmanager").returns(true);

      let stdoutCallback: (data: Buffer) => void;
      mockChild.stdout.on.withArgs("data").callsFake((event, callback) => {
        stdoutCallback = callback;
      });

      mockChild.on.withArgs("close").callsFake((event, callback) => {
        if (stdoutCallback) {
          const mockOutput = `
Available Packages:
  system-images;android-33;google_apis;arm64-v8a | 9
  system-images;android-34;google_apis;x86_64    | 5
  system-images;android-33;default;arm64-v8a     | 3
          `;
          stdoutCallback(Buffer.from(mockOutput));
        }
        callback(0);
      });

      const result = await avdmanager.listSystemImages({
        apiLevel: 33,
        tag: "google_apis"
      }, mockDeps);

      expect(result).to.have.lengthOf(1);
      expect(result[0].apiLevel).to.equal(33);
      expect(result[0].tag).to.equal("google_apis");
    });
  });

  describe("createAvd", () => {
    it("should create AVD successfully", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/avdmanager").returns(true);
      mockChild.on.withArgs("close").callsArgWith(1, 0);

      const params = {
        name: "test_avd",
        package: "system-images;android-33;google_apis;arm64-v8a",
        device: "pixel_4",
        force: true
      };

      const result = await avdmanager.createAvd(params, mockDeps);

      expect(result.success).to.be.true;
      expect(result.avdName).to.equal("test_avd");
      expect(mockDeps.spawn).to.have.been.calledWith(
        "/mock/sdk/cmdline-tools/latest/bin/avdmanager",
        [
          "create", "avd",
          "-n", "test_avd",
          "-k", "system-images;android-33;google_apis;arm64-v8a",
          "-d", "pixel_4",
          "--force"
        ]
      );
    });

    it("should include all optional parameters", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/avdmanager").returns(true);
      mockChild.on.withArgs("close").callsArgWith(1, 0);

      const params = {
        name: "test_avd",
        package: "system-images;android-33;google_apis;arm64-v8a",
        device: "pixel_4",
        force: true,
        path: "/custom/path",
        tag: "google_apis",
        abi: "arm64-v8a"
      };

      const result = await avdmanager.createAvd(params, mockDeps);

      expect(result.success).to.be.true;
      expect(mockDeps.spawn).to.have.been.calledWith(
        "/mock/sdk/cmdline-tools/latest/bin/avdmanager",
        [
          "create", "avd",
          "-n", "test_avd",
          "-k", "system-images;android-33;google_apis;arm64-v8a",
          "-d", "pixel_4",
          "--force",
          "-p", "/custom/path",
          "-t", "google_apis",
          "--abi", "arm64-v8a"
        ]
      );
    });

    it("should handle AVD creation failure", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/avdmanager").returns(true);

      let stderrCallback: (data: Buffer) => void;
      mockChild.stderr.on.withArgs("data").callsFake((event, callback) => {
        stderrCallback = callback;
      });

      mockChild.on.withArgs("close").callsFake((event, callback) => {
        if (stderrCallback) {
          stderrCallback(Buffer.from("AVD creation failed"));
        }
        callback(1);
      });

      const params = {
        name: "test_avd",
        package: "system-images;android-33;google_apis;arm64-v8a"
      };

      const result = await avdmanager.createAvd(params, mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("AVD creation failed");
    });
  });

  describe("deleteAvd", () => {
    it("should delete AVD successfully", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/avdmanager").returns(true);
      mockChild.on.withArgs("close").callsArgWith(1, 0);

      const result = await avdmanager.deleteAvd("test_avd", mockDeps);

      expect(result.success).to.be.true;
      expect(result.message).to.include("deleted successfully");
      expect(mockDeps.spawn).to.have.been.calledWith(
        "/mock/sdk/cmdline-tools/latest/bin/avdmanager",
        ["delete", "avd", "-n", "test_avd"]
      );
    });
  });

  describe("listDeviceImages", () => {
    it("should parse AVD list correctly", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/avdmanager").returns(true);

      let stdoutCallback: (data: Buffer) => void;
      mockChild.stdout.on.withArgs("data").callsFake((event, callback) => {
        stdoutCallback = callback;
      });

      mockChild.on.withArgs("close").callsFake((event, callback) => {
        if (stdoutCallback) {
          const mockOutput = `
Available Android Virtual Devices:
    Name: test_avd_1
  Device: pixel_4 (Google)
    Path: /Users/test/.android/avd/test_avd_1.avd
  Target: Google APIs (Google Inc.)
          Based on: Android 13.0 (Tiramisu) Tag/ABI: google_apis/arm64-v8a
---------
    Name: test_avd_2
  Device: pixel_6 (Google)
    Path: /Users/test/.android/avd/test_avd_2.avd
  Target: Google APIs (Google Inc.)
          Based on: Android 14.0 (UpsideDownCake) Tag/ABI: google_apis_playstore/x86_64
---------
    Name: broken_avd
  Device: Unknown device
    Path: /Users/test/.android/avd/broken_avd.avd
   Error: Missing system image for Google Play arm64-v8a Medium Phone API 35.
          `;
          stdoutCallback(Buffer.from(mockOutput));
        }
        callback(0);
      });

      const result = await avdmanager.listDeviceImages(mockDeps);

      expect(result).to.have.lengthOf(3);

      expect(result[0]).to.deep.include({
        name: "test_avd_1",
        path: "/Users/test/.android/avd/test_avd_1.avd",
        target: "Google APIs (Google Inc.)",
        basedOn: "Android 13.0 (Tiramisu) Tag/ABI: google_apis/arm64-v8a"
      });

      expect(result[1]).to.deep.include({
        name: "test_avd_2",
        path: "/Users/test/.android/avd/test_avd_2.avd",
        target: "Google APIs (Google Inc.)",
        basedOn: "Android 14.0 (UpsideDownCake) Tag/ABI: google_apis_playstore/x86_64"
      });

      expect(result[2]).to.deep.include({
        name: "broken_avd",
        path: "/Users/test/.android/avd/broken_avd.avd",
        error: "Missing system image for Google Play arm64-v8a Medium Phone API 35."
      });
    });
  });

  describe("listDevices", () => {
    it("should parse device list correctly", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/avdmanager").returns(true);

      let stdoutCallback: (data: Buffer) => void;
      mockChild.stdout.on.withArgs("data").callsFake((event, callback) => {
        stdoutCallback = callback;
      });

      mockChild.on.withArgs("close").callsFake((event, callback) => {
        if (stdoutCallback) {
          const mockOutput = `
Available devices:
id: 0
    Name: TV (1080p)
    OEM: Generic
---------
id: 1
    Name: Nexus 5X
    OEM: LGE
---------
id: pixel_4
    Name: Pixel 4
    OEM: Google
          `;
          stdoutCallback(Buffer.from(mockOutput));
        }
        callback(0);
      });

      const result = await avdmanager.listDevices(mockDeps);

      expect(result).to.have.lengthOf(3);

      expect(result[0]).to.deep.include({
        id: "0",
        name: "TV (1080p)",
        oem: "Generic"
      });

      expect(result[1]).to.deep.include({
        id: "1",
        name: "Nexus 5X",
        oem: "LGE"
      });

      expect(result[2]).to.deep.include({
        id: "pixel_4",
        name: "Pixel 4",
        oem: "Google"
      });
    });
  });

  describe("installSystemImage", () => {
    it("should install system image successfully", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/sdkmanager").returns(true);
      mockChild.on.withArgs("close").callsArgWith(1, 0);

      const packageName = "system-images;android-33;google_apis;arm64-v8a";
      const result = await avdmanager.installSystemImage(packageName, true, mockDeps);

      expect(result.success).to.be.true;
      expect(result.message).to.include("installed successfully");
      expect(mockDeps.spawn).to.have.been.calledWith(
        "/mock/sdk/cmdline-tools/latest/bin/sdkmanager",
        [packageName]
      );
    });

    it("should install without accepting license when specified", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/sdkmanager").returns(true);
      mockChild.on.withArgs("close").callsArgWith(1, 0);

      const packageName = "system-images;android-33;google_apis;arm64-v8a";
      const result = await avdmanager.installSystemImage(packageName, false, mockDeps);

      expect(result.success).to.be.true;
      expect(mockChild.stdin.write).to.not.have.been.called;
    });
  });

  describe("Constants", () => {
    it("should provide common system images", () => {
      expect(avdmanager.COMMON_SYSTEM_IMAGES.API_35.GOOGLE_APIS_ARM64)
        .to.equal("system-images;android-35;google_apis;arm64-v8a");
      expect(avdmanager.COMMON_SYSTEM_IMAGES.API_34.PLAYSTORE_X86_64)
        .to.equal("system-images;android-34;google_apis_playstore;x86_64");
    });

    it("should provide common device profiles", () => {
      expect(avdmanager.COMMON_DEVICES.PIXEL_4).to.equal("pixel_4");
      expect(avdmanager.COMMON_DEVICES.NEXUS_5X).to.equal("Nexus 5X");
    });
  });

  describe("Error Handling", () => {
    it("should handle tools installation failure", async () => {
      const mockDeps = createMockDependencies();

      mockDeps.detectAndroidCommandLineTools.resolves([]);
      mockDeps.getBestAndroidToolsLocation.returns(null);
      mockDeps.installAndroidTools.resolves({
        success: false,
        installed_tools: [],
        failed_tools: ["avdmanager", "sdkmanager"],
        installation_path: "",
        installation_method: "manual",
        message: "Installation failed"
      });

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("Failed to install required tools");
    });

    it("should handle missing tools after installation", async () => {
      const mockDeps = createMockDependencies();

      mockDeps.detectAndroidCommandLineTools.resolves([]);
      mockDeps.getBestAndroidToolsLocation.returns(null);
      mockDeps.installAndroidTools.resolves({
        success: true,
        installed_tools: ["avdmanager", "sdkmanager"],
        failed_tools: [],
        installation_path: "/mock/path",
        installation_method: "manual",
        message: "Success"
      });

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("Tools installation completed but tools not detected");
    });

    it("should handle missing executable files", async () => {
      const mockDeps = createMockDependencies();

      mockDeps.existsSync.returns(false); // No executable files exist

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("SDK manager not found");
    });

    it("should handle command spawn errors", async () => {
      const mockChild = {
        stdout: { on: sandbox.stub() },
        stderr: { on: sandbox.stub() },
        stdin: { write: sandbox.stub(), end: sandbox.stub() },
        on: sandbox.stub()
      };

      const mockDeps = createMockDependencies();
      mockDeps.spawn.returns(mockChild);
      mockDeps.existsSync.withArgs("/mock/sdk/cmdline-tools/latest/bin/sdkmanager").returns(true);

      // Simulate spawn error
      mockChild.on.withArgs("error").callsArgWith(1, new Error("Spawn failed"));

      const result = await avdmanager.acceptLicenses(mockDeps);

      expect(result.success).to.be.false;
      expect(result.message).to.include("Failed to spawn command");
    });
  });
});
