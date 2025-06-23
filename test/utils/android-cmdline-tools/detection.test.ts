import { expect } from "chai";
import * as sinon from "sinon";
import { join } from "path";
import * as proxyquire from "proxyquire";

describe("Android Command Line Tools - Detection", () => {

  let platformStub: sinon.SinonStub;
  let homedirStub: sinon.SinonStub;
  let existsSyncStub: sinon.SinonStub;
  let processEnvStub: sinon.SinonStub;
  let execStub: sinon.SinonStub;
  let detectionModule: any;

  beforeEach(() => {
    platformStub = sinon.stub(require("os"), "platform");
    homedirStub = sinon.stub(require("os"), "homedir");
    existsSyncStub = sinon.stub(require("fs"), "existsSync");
    processEnvStub = sinon.stub(process, "env");
    execStub = sinon.stub();

    // Mock child_process.exec using proxyquire
    detectionModule = proxyquire.load("../../../src/utils/android-cmdline-tools/detection", {
      "child_process": {
        exec: execStub
      }
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("ANDROID_TOOLS registry", () => {
    it("should contain all expected tools", () => {
      expect(detectionModule.ANDROID_TOOLS).to.have.property("apkanalyzer");
      expect(detectionModule.ANDROID_TOOLS).to.have.property("avdmanager");
      expect(detectionModule.ANDROID_TOOLS).to.have.property("sdkmanager");
      expect(detectionModule.ANDROID_TOOLS).to.have.property("lint");
      expect(detectionModule.ANDROID_TOOLS).to.have.property("screenshot2");
      expect(detectionModule.ANDROID_TOOLS).to.have.property("d8");
      expect(detectionModule.ANDROID_TOOLS).to.have.property("r8");
      expect(detectionModule.ANDROID_TOOLS).to.have.property("resourceshrinker");
      expect(detectionModule.ANDROID_TOOLS).to.have.property("retrace");
      expect(detectionModule.ANDROID_TOOLS).to.have.property("profgen");
    });

    it("should have valid tool descriptions", () => {
      Object.values(detectionModule.ANDROID_TOOLS).forEach((tool: any) => {
        expect(tool.name).to.be.a("string").that.is.not.empty;
        expect(tool.description).to.be.a("string").that.is.not.empty;
      });
    });
  });

  describe("getTypicalAndroidSdkPaths", () => {
    it("should return macOS paths when platform is darwin", () => {
      platformStub.returns("darwin");
      homedirStub.returns("/Users/testuser");

      const paths = detectionModule.getTypicalAndroidSdkPaths();

      expect(paths).to.include("/Users/testuser/Library/Android/sdk");
      expect(paths).to.include("/opt/android-sdk");
      expect(paths).to.include("/usr/local/android-sdk");
    });

    it("should return Linux paths when platform is linux", () => {
      platformStub.returns("linux");
      homedirStub.returns("/home/testuser");

      const paths = detectionModule.getTypicalAndroidSdkPaths();

      expect(paths).to.include("/home/testuser/Android/Sdk");
      expect(paths).to.include("/opt/android-sdk");
      expect(paths).to.include("/usr/local/android-sdk");
    });

    it("should return Windows paths when platform is win32", () => {
      platformStub.returns("win32");
      homedirStub.returns("C:\\Users\\testuser");

      const paths = detectionModule.getTypicalAndroidSdkPaths();

      expect(paths).to.include("C:\\Users\\testuser/AppData/Local/Android/Sdk");
      expect(paths).to.include("C:/Android/Sdk");
      expect(paths).to.include("C:/android-sdk");
    });

    it("should return empty array for unknown platforms", () => {
      platformStub.returns("unknown");

      const paths = detectionModule.getTypicalAndroidSdkPaths();

      expect(paths).to.be.an("array").that.is.empty;
    });
  });

  describe("getHomebrewAndroidToolsPath", () => {
    it("should return null for non-macOS platforms", () => {
      platformStub.returns("linux");

      const path = detectionModule.getHomebrewAndroidToolsPath();

      expect(path).to.be.null;
    });

    it("should return path when homebrew installation exists on macOS", () => {
      platformStub.returns("darwin");
      existsSyncStub.returns(true);

      const path = detectionModule.getHomebrewAndroidToolsPath();

      expect(path).to.equal("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");
      expect(existsSyncStub.calledWith("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest")).to.be.true;
    });

    it("should return null when homebrew installation does not exist on macOS", () => {
      platformStub.returns("darwin");
      existsSyncStub.returns(false);

      const path = detectionModule.getHomebrewAndroidToolsPath();

      expect(path).to.be.null;
    });
  });

  describe("getAndroidSdkFromEnvironment", () => {
    it("should return ANDROID_HOME path when it exists", () => {
      processEnvStub.value({ ANDROID_HOME: "/path/to/android-home" });
      existsSyncStub.withArgs("/path/to/android-home").returns(true);

      const path = detectionModule.getAndroidSdkFromEnvironment();

      expect(path).to.equal("/path/to/android-home");
    });

    it("should return ANDROID_SDK_ROOT path when ANDROID_HOME does not exist", () => {
      processEnvStub.value({
        ANDROID_HOME: "/nonexistent/path",
        ANDROID_SDK_ROOT: "/path/to/android-sdk-root"
      });
      existsSyncStub.withArgs("/nonexistent/path").returns(false);
      existsSyncStub.withArgs("/path/to/android-sdk-root").returns(true);

      const path = detectionModule.getAndroidSdkFromEnvironment();

      expect(path).to.equal("/path/to/android-sdk-root");
    });

    it("should return null when neither environment variable points to existing path", () => {
      processEnvStub.value({
        ANDROID_HOME: "/nonexistent/path1",
        ANDROID_SDK_ROOT: "/nonexistent/path2"
      });
      existsSyncStub.returns(false);

      const path = detectionModule.getAndroidSdkFromEnvironment();

      expect(path).to.be.null;
    });

    it("should return null when no environment variables are set", () => {
      processEnvStub.value({});

      const path = detectionModule.getAndroidSdkFromEnvironment();

      expect(path).to.be.null;
    });
  });

  // describe("isToolInPath", () => {
  //   it("should return true when tool is found in PATH on Unix", async () => {
  //     platformStub.returns("linux");
  //     execStub.resolves({ stdout: "/usr/bin/tool", stderr: "" });
  //
  //     const result = await detectionModule.isToolInPath("test-tool");
  //
  //     expect(result).to.be.true;
  //     expect(execStub.calledWith("which test-tool")).to.be.true;
  //   });
  //
  //   it("should return true when tool is found in PATH on Windows", async () => {
  //     platformStub.returns("win32");
  //     execStub.resolves({ stdout: "C:\\tools\\tool.exe", stderr: "" });
  //
  //     const result = await detectionModule.isToolInPath("test-tool");
  //
  //     expect(result).to.be.true;
  //     expect(execStub.calledWith("where test-tool")).to.be.true;
  //   });
  //
  //   it("should return false when tool is not found in PATH", async () => {
  //     platformStub.returns("linux");
  //     execStub.rejects(new Error("Command not found"));
  //
  //     const result = await detectionModule.isToolInPath("nonexistent-tool");
  //
  //     expect(result).to.be.false;
  //   });
  // });
  //
  // describe("getToolPathFromPath", () => {
  //   it("should return tool path when found on Unix", async () => {
  //     platformStub.returns("linux");
  //     execStub.resolves({ stdout: "/usr/bin/tool\n", stderr: "" });
  //
  //     const result = await detectionModule.getToolPathFromPath("test-tool");
  //
  //     expect(result).to.equal("/usr/bin/tool");
  //     expect(execStub.calledWith("which test-tool")).to.be.true;
  //   });
  //
  //   it("should return tool path when found on Windows", async () => {
  //     platformStub.returns("win32");
  //     execStub.resolves({ stdout: "C:\\tools\\tool.exe\n", stderr: "" });
  //
  //     const result = await detectionModule.getToolPathFromPath("test-tool");
  //
  //     expect(result).to.equal("C:\\tools\\tool.exe");
  //     expect(execStub.calledWith("where test-tool")).to.be.true;
  //   });
  //
  //   it("should return first path when multiple results are returned", async () => {
  //     platformStub.returns("linux");
  //     execStub.resolves({ stdout: "/usr/bin/tool\n/usr/local/bin/tool\n", stderr: "" });
  //
  //     const result = await detectionModule.getToolPathFromPath("test-tool");
  //
  //     expect(result).to.equal("/usr/bin/tool");
  //   });
  //
  //   it("should return null when tool is not found", async () => {
  //     platformStub.returns("linux");
  //     execStub.rejects(new Error("Command not found"));
  //
  //     const result = await detectionModule.getToolPathFromPath("nonexistent-tool");
  //
  //     expect(result).to.be.null;
  //   });
  //
  //   it("should return null when stdout is empty", async () => {
  //     platformStub.returns("linux");
  //     execStub.resolves({ stdout: "", stderr: "" });
  //
  //     const result = await detectionModule.getToolPathFromPath("test-tool");
  //
  //     expect(result).to.be.null;
  //   });
  // });
  //
  // describe("getAndroidToolsVersion", () => {
  //   it("should return version when sdkmanager is available", async () => {
  //     existsSyncStub.withArgs(join("/test/tools", "bin", "sdkmanager")).returns(true);
  //     execStub.resolves({ stdout: "26.1.1\n", stderr: "" });
  //
  //     const result = await detectionModule.getAndroidToolsVersion("/test/tools");
  //
  //     expect(result).to.equal("26.1.1");
  //     expect(execStub.calledWith(join("/test/tools", "bin", "sdkmanager") + " --version")).to.be.true;
  //   });
  //
  //   it("should return version when sdkmanager.bat is available on Windows", async () => {
  //     existsSyncStub.withArgs(join("/test/tools", "bin", "sdkmanager")).returns(false);
  //     existsSyncStub.withArgs(join("/test/tools", "bin", "sdkmanager.bat")).returns(true);
  //     execStub.resolves({ stdout: "", stderr: "26.1.1\n" });
  //
  //     const result = await detectionModule.getAndroidToolsVersion("/test/tools");
  //
  //     expect(result).to.equal("26.1.1");
  //     expect(execStub.calledWith(join("/test/tools", "bin", "sdkmanager.bat") + " --version")).to.be.true;
  //   });
  //
  //   it("should return undefined when no sdkmanager is found", async () => {
  //     existsSyncStub.returns(false);
  //
  //     const result = await detectionModule.getAndroidToolsVersion("/test/tools");
  //
  //     expect(result).to.be.undefined;
  //   });
  //
  //   it("should return undefined and log warning when command fails", async () => {
  //     existsSyncStub.withArgs(join("/test/tools", "bin", "sdkmanager")).returns(true);
  //     execStub.rejects(new Error("Command failed"));
  //
  //     const result = await detectionModule.getAndroidToolsVersion("/test/tools");
  //
  //     expect(result).to.be.undefined;
  //   });
  // });

  describe("getAvailableToolsInDirectory", () => {
    it("should return empty array when directory does not exist", () => {
      existsSyncStub.returns(false);

      const tools = detectionModule.getAvailableToolsInDirectory("/nonexistent");

      expect(tools).to.be.an("array").that.is.empty;
    });

    it("should return empty array when bin directory does not exist", () => {
      existsSyncStub.withArgs("/test/tools").returns(true);
      existsSyncStub.withArgs("/test/tools/bin").returns(false);

      const tools = detectionModule.getAvailableToolsInDirectory("/test/tools");

      expect(tools).to.be.an("array").that.is.empty;
    });

    it("should return available tools when they exist in bin directory", () => {
      existsSyncStub.withArgs("/test/tools").returns(true);
      existsSyncStub.withArgs("/test/tools/bin").returns(true);
      existsSyncStub.withArgs(join("/test/tools/bin", "apkanalyzer")).returns(true);
      existsSyncStub.withArgs(join("/test/tools/bin", "sdkmanager")).returns(true);
      existsSyncStub.withArgs(join("/test/tools/bin", "avdmanager")).returns(false);

      const tools = detectionModule.getAvailableToolsInDirectory("/test/tools");

      expect(tools).to.include("apkanalyzer");
      expect(tools).to.include("sdkmanager");
      expect(tools).to.not.include("avdmanager");
    });

    it("should detect Windows .bat files", () => {
      platformStub.returns("win32");
      existsSyncStub.withArgs("/test/tools").returns(true);
      existsSyncStub.withArgs("/test/tools/bin").returns(true);
      existsSyncStub.withArgs(join("/test/tools/bin", "apkanalyzer")).returns(false);
      existsSyncStub.withArgs(join("/test/tools/bin", "apkanalyzer.bat")).returns(true);

      const tools = detectionModule.getAvailableToolsInDirectory("/test/tools");

      expect(tools).to.include("apkanalyzer");
    });
  });

  describe("getBestAndroidToolsLocation", () => {
    it("should return null for empty locations array", () => {
      const best = detectionModule.getBestAndroidToolsLocation([]);
      expect(best).to.be.null;
    });

    it("should prioritize homebrew over other sources", () => {
      const locations = [
        {
          path: "/typical/path",
          source: "typical",
          available_tools: ["apkanalyzer", "sdkmanager"]
        },
        {
          path: "/homebrew/path",
          source: "homebrew",
          available_tools: ["apkanalyzer"]
        }
      ];

      const best = detectionModule.getBestAndroidToolsLocation(locations);
      expect(best?.source).to.equal("homebrew");
    });

    it("should prioritize locations with more available tools when source is the same", () => {
      const locations = [
        {
          path: "/path1",
          source: "typical",
          available_tools: ["d8", "r8"]
        },
        {
          path: "/path2",
          source: "typical",
          available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
        }
      ];

      const best = detectionModule.getBestAndroidToolsLocation(locations);
      expect(best?.path).to.equal("/path2");
    });

    it("should handle source priority correctly", () => {
      const locations = [
        {
          path: "/path-typical",
          source: "typical",
          available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
        },
        {
          path: "/path-android-home",
          source: "android_home",
          available_tools: ["apkanalyzer", "sdkmanager"]
        }
      ];

      const best = detectionModule.getBestAndroidToolsLocation(locations);
      expect(best?.source).to.equal("android_home");
    });

    it("should handle all source types with correct priority", () => {
      const locations = [
        {
          path: "/manual",
          source: "manual",
          available_tools: ["apkanalyzer", "sdkmanager", "avdmanager", "lint"]
        },
        {
          path: "/path",
          source: "path",
          available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
        },
        {
          path: "/android-sdk-root",
          source: "android_sdk_root",
          available_tools: ["apkanalyzer", "sdkmanager"]
        },
        {
          path: "/homebrew",
          source: "homebrew",
          available_tools: ["apkanalyzer"]
        }
      ];

      const best = detectionModule.getBestAndroidToolsLocation(locations);
      expect(best?.source).to.equal("homebrew");
    });
  });

  describe("validateRequiredTools", () => {
    it("should return valid when all required tools are available", () => {
      const location = {
        path: "/test/path",
        source: "typical",
        available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
      };

      const result = detectionModule.validateRequiredTools(location, ["apkanalyzer", "sdkmanager"]);

      expect(result.valid).to.be.true;
      expect(result.missing).to.be.empty;
    });

    it("should return invalid when some required tools are missing", () => {
      const location = {
        path: "/test/path",
        source: "typical",
        available_tools: ["apkanalyzer"]
      };

      const result = detectionModule.validateRequiredTools(location, ["apkanalyzer", "sdkmanager", "avdmanager"]);

      expect(result.valid).to.be.false;
      expect(result.missing).to.include("sdkmanager");
      expect(result.missing).to.include("avdmanager");
      expect(result.missing).to.not.include("apkanalyzer");
    });

    it("should handle empty required tools array", () => {
      const location = {
        path: "/test/path",
        source: "typical",
        available_tools: []
      };

      const result = detectionModule.validateRequiredTools(location, []);

      expect(result.valid).to.be.true;
      expect(result.missing).to.be.empty;
    });
  });

  describe("getAndroidSdkFromEnvironment", () => {
    it("should return ANDROID_HOME path when it exists", () => {
      processEnvStub.value({ ANDROID_HOME: "/path/to/android-home" });
      existsSyncStub.withArgs("/path/to/android-home").returns(true);

      const path = detectionModule.getAndroidSdkFromEnvironment();

      expect(path).to.equal("/path/to/android-home");
    });

    it("should return ANDROID_SDK_ROOT path when ANDROID_HOME does not exist", () => {
      processEnvStub.value({
        ANDROID_HOME: "/nonexistent/path",
        ANDROID_SDK_ROOT: "/path/to/android-sdk-root"
      });
      existsSyncStub.withArgs("/nonexistent/path").returns(false);
      existsSyncStub.withArgs("/path/to/android-sdk-root").returns(true);

      const path = detectionModule.getAndroidSdkFromEnvironment();

      expect(path).to.equal("/path/to/android-sdk-root");
    });

    it("should return null when neither environment variable points to existing path", () => {
      processEnvStub.value({
        ANDROID_HOME: "/nonexistent/path1",
        ANDROID_SDK_ROOT: "/nonexistent/path2"
      });
      existsSyncStub.returns(false);

      const path = detectionModule.getAndroidSdkFromEnvironment();

      expect(path).to.be.null;
    });

    it("should return null when no environment variables are set", () => {
      processEnvStub.value({});

      const path = detectionModule.getAndroidSdkFromEnvironment();

      expect(path).to.be.null;
    });
  });

  describe("detectHomebrewAndroidTools", () => {
    it("should return null when homebrew path is not available", async () => {
      platformStub.returns("linux");

      const result = await detectionModule.detectHomebrewAndroidTools();

      expect(result).to.be.null;
    });

    it("should return null when no tools are available in homebrew path", async () => {
      platformStub.returns("darwin");
      existsSyncStub.withArgs("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest").returns(true);
      existsSyncStub.withArgs("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin").returns(false);

      const result = await detectionModule.detectHomebrewAndroidTools();

      expect(result).to.be.null;
    });

    // it("should return location when homebrew tools are available", async () => {
    //   platformStub.returns("darwin");
    //   existsSyncStub.withArgs("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest").returns(true);
    //   existsSyncStub.withArgs("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin").returns(true);
    //   existsSyncStub.withArgs(join("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin", "apkanalyzer")).returns(true);
    //   existsSyncStub.withArgs(join("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin", "sdkmanager")).returns(true);
    //   execStub.resolves({ stdout: "26.1.1\n", stderr: "" });
    //
    //   const result = await detectionModule.detectHomebrewAndroidTools();
    //
    //   expect(result).to.not.be.null;
    //   expect(result?.source).to.equal("homebrew");
    //   expect(result?.path).to.equal("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");
    //   expect(result?.available_tools).to.include("apkanalyzer");
    //   expect(result?.available_tools).to.include("sdkmanager");
    //   expect(result?.version).to.equal("26.1.1");
    // });
  });

  describe("detectAndroidSdkTools", () => {
    it("should return empty array when no SDK paths are found", async () => {
      processEnvStub.value({});
      platformStub.returns("unknown");

      const result = await detectionModule.detectAndroidSdkTools();

      expect(result).to.be.an("array").that.is.empty;
    });

    // it("should detect tools from ANDROID_HOME environment variable", async () => {
    //   processEnvStub.value({ ANDROID_HOME: "/android/sdk" });
    //   existsSyncStub.withArgs("/android/sdk").returns(true);
    //   existsSyncStub.withArgs("/android/sdk/cmdline-tools/latest").returns(true);
    //   existsSyncStub.withArgs("/android/sdk/cmdline-tools/latest/bin").returns(true);
    //   existsSyncStub.withArgs(join("/android/sdk/cmdline-tools/latest/bin", "apkanalyzer")).returns(true);
    //   existsSyncStub.withArgs(join("/android/sdk/cmdline-tools/latest/bin", "sdkmanager")).returns(true);
    //   execStub.resolves({ stdout: "26.1.1\n", stderr: "" });
    //
    //   const result = await detectionModule.detectAndroidSdkTools();
    //
    //   expect(result).to.have.length(1);
    //   expect(result[0].source).to.equal("android_home");
    //   expect(result[0].path).to.equal("/android/sdk/cmdline-tools/latest");
    //   expect(result[0].available_tools).to.include("apkanalyzer");
    //   expect(result[0].available_tools).to.include("sdkmanager");
    // });

    it("should detect tools from ANDROID_SDK_ROOT environment variable", async () => {
      processEnvStub.value({ ANDROID_SDK_ROOT: "/android/sdk" });
      existsSyncStub.withArgs("/android/sdk").returns(true);
      existsSyncStub.withArgs("/android/sdk/cmdline-tools/latest").returns(true);
      existsSyncStub.withArgs("/android/sdk/cmdline-tools/latest/bin").returns(true);
      existsSyncStub.withArgs(join("/android/sdk/cmdline-tools/latest/bin", "apkanalyzer")).returns(true);
      execStub.resolves({ stdout: "26.1.1\n", stderr: "" });

      const result = await detectionModule.detectAndroidSdkTools();

      expect(result).to.have.length(1);
      expect(result[0].source).to.equal("android_sdk_root");
      expect(result[0].path).to.equal("/android/sdk/cmdline-tools/latest");
    });

    // it("should detect tools from typical paths and skip duplicates", async () => {
    //   processEnvStub.value({ ANDROID_HOME: "/Users/test/Library/Android/sdk" });
    //   platformStub.returns("darwin");
    //   homedirStub.returns("/Users/test");
    //
    //   // Environment path
    //   existsSyncStub.withArgs("/Users/test/Library/Android/sdk").returns(true);
    //   existsSyncStub.withArgs("/Users/test/Library/Android/sdk/cmdline-tools/latest").returns(true);
    //   existsSyncStub.withArgs("/Users/test/Library/Android/sdk/cmdline-tools/latest/bin").returns(true);
    //   existsSyncStub.withArgs(join("/Users/test/Library/Android/sdk/cmdline-tools/latest/bin", "apkanalyzer")).returns(true);
    //
    //   // Another typical path
    //   existsSyncStub.withArgs("/opt/android-sdk").returns(true);
    //   existsSyncStub.withArgs("/opt/android-sdk/cmdline-tools/latest").returns(true);
    //   existsSyncStub.withArgs("/opt/android-sdk/cmdline-tools/latest/bin").returns(true);
    //   existsSyncStub.withArgs(join("/opt/android-sdk/cmdline-tools/latest/bin", "sdkmanager")).returns(true);
    //
    //   execStub.resolves({ stdout: "26.1.1\n", stderr: "" });
    //
    //   const result = await detectionModule.detectAndroidSdkTools();
    //
    //   expect(result).to.have.length(2);
    //   expect(result[0].source).to.equal("android_home");
    //   expect(result[1].source).to.equal("typical");
    //   expect(result[1].path).to.equal("/opt/android-sdk/cmdline-tools/latest");
    // });
  });

  // describe("detectAndroidToolsInPath", () => {
  //   it("should return null when no tools are found in PATH", async () => {
  //     execStub.rejects(new Error("Command not found"));
  //
  //     const result = await detectionModule.detectAndroidToolsInPath();
  //
  //     expect(result).to.be.null;
  //   });
  //
  //   it("should detect tools available in PATH", async () => {
  //     platformStub.returns("linux");
  //
  //     // Mock which commands for different tools - need to handle both callback and promisified versions
  //     execStub.withArgs("which apkanalyzer").resolves({ stdout: "/usr/bin/apkanalyzer\n", stderr: "" });
  //     execStub.withArgs("which sdkmanager").resolves({ stdout: "/usr/bin/sdkmanager\n", stderr: "" });
  //     execStub.withArgs("which avdmanager").rejects(new Error("not found"));
  //     execStub.withArgs("which lint").rejects(new Error("not found"));
  //     execStub.withArgs("which screenshot2").rejects(new Error("not found"));
  //     execStub.withArgs("which d8").rejects(new Error("not found"));
  //     execStub.withArgs("which r8").rejects(new Error("not found"));
  //     execStub.withArgs("which resourceshrinker").rejects(new Error("not found"));
  //     execStub.withArgs("which retrace").rejects(new Error("not found"));
  //     execStub.withArgs("which profgen").rejects(new Error("not found"));
  //
  //     const result = await detectionModule.detectAndroidToolsInPath();
  //
  //     expect(result).to.not.be.null;
  //     expect(result?.source).to.equal("path");
  //     expect(result?.available_tools).to.include("apkanalyzer");
  //     expect(result?.available_tools).to.include("sdkmanager");
  //     expect(result?.available_tools).to.not.include("avdmanager");
  //     expect(result?.path).to.equal("/usr"); // common parent directory
  //     expect(result?.version).to.be.undefined;
  //   });
  //
  //   it("should handle tools in different directories", async () => {
  //     platformStub.returns("linux");
  //
  //     execStub.withArgs("which apkanalyzer").resolves({ stdout: "/usr/bin/apkanalyzer\n", stderr: "" });
  //     execStub.withArgs("which sdkmanager").resolves({ stdout: "/usr/local/bin/sdkmanager\n", stderr: "" });
  //     execStub.withArgs("which avdmanager").rejects(new Error("not found"));
  //     execStub.withArgs("which lint").rejects(new Error("not found"));
  //     execStub.withArgs("which screenshot2").rejects(new Error("not found"));
  //     execStub.withArgs("which d8").rejects(new Error("not found"));
  //     execStub.withArgs("which r8").rejects(new Error("not found"));
  //     execStub.withArgs("which resourceshrinker").rejects(new Error("not found"));
  //     execStub.withArgs("which retrace").rejects(new Error("not found"));
  //     execStub.withArgs("which profgen").rejects(new Error("not found"));
  //
  //     const result = await detectionModule.detectAndroidToolsInPath();
  //
  //     expect(result?.available_tools).to.include("apkanalyzer");
  //     expect(result?.available_tools).to.include("sdkmanager");
  //     // Should pick the directory with the most tools (/usr has more weight)
  //     expect(result?.path).to.equal("/usr");
  //   });
  // });
  //
  // describe("detectAndroidCommandLineTools", () => {
  //   it("should handle errors gracefully and continue detection", async () => {
  //     platformStub.returns("darwin");
  //     homedirStub.returns("/Users/test");
  //     processEnvStub.value({});
  //
  //     // Mock homebrew detection to fail
  //     existsSyncStub.withArgs("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest").returns(false);
  //
  //     // Mock typical path detection to succeed
  //     existsSyncStub.withArgs("/Users/test/Library/Android/sdk").returns(true);
  //     existsSyncStub.withArgs("/Users/test/Library/Android/sdk/cmdline-tools/latest").returns(true);
  //     existsSyncStub.withArgs("/Users/test/Library/Android/sdk/cmdline-tools/latest/bin").returns(true);
  //     existsSyncStub.withArgs(join("/Users/test/Library/Android/sdk/cmdline-tools/latest/bin", "apkanalyzer")).returns(true);
  //
  //     // Mock PATH detection to fail
  //     execStub.rejects(new Error("Command not found"));
  //
  //     const result = await detectionModule.detectAndroidCommandLineTools();
  //
  //     expect(result).to.have.length(1);
  //     expect(result[0].source).to.equal("typical");
  //   });
  //
  //   it("should remove duplicate locations based on path", async () => {
  //     platformStub.returns("linux");
  //     homedirStub.returns("/home/test");
  //     processEnvStub.value({ ANDROID_HOME: "/home/test/Android/Sdk" });
  //
  //     // Environment detection
  //     existsSyncStub.withArgs("/home/test/Android/Sdk").returns(true);
  //     existsSyncStub.withArgs("/home/test/Android/Sdk/cmdline-tools/latest").returns(true);
  //     existsSyncStub.withArgs("/home/test/Android/Sdk/cmdline-tools/latest/bin").returns(true);
  //     existsSyncStub.withArgs(join("/home/test/Android/Sdk/cmdline-tools/latest/bin", "apkanalyzer")).returns(true);
  //
  //     // PATH detection should fail
  //     execStub.rejects(new Error("Command not found"));
  //
  //     const result = await detectionModule.detectAndroidCommandLineTools();
  //
  //     // Should only find one location (environment), typical path should be skipped as duplicate
  //     expect(result).to.have.length(1);
  //     expect(result[0].source).to.equal("android_home");
  //   });
  // });

  describe("Integration tests", () => {
    // it("should detect multiple installations and pick the best one", async () => {
    //   platformStub.returns("darwin");
    //   homedirStub.returns("/Users/testuser");
    //
    //   // Mock homebrew installation exists
    //   existsSyncStub.withArgs("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest").returns(true);
    //   existsSyncStub.withArgs("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin").returns(true);
    //   existsSyncStub.withArgs(join("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin", "apkanalyzer")).returns(true);
    //   existsSyncStub.withArgs(join("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin", "sdkmanager")).returns(true);
    //
    //   // Mock typical installation exists
    //   existsSyncStub.withArgs("/Users/testuser/Library/Android/sdk").returns(true);
    //   existsSyncStub.withArgs("/Users/testuser/Library/Android/sdk/cmdline-tools/latest").returns(true);
    //   existsSyncStub.withArgs("/Users/testuser/Library/Android/sdk/cmdline-tools/latest/bin").returns(true);
    //   existsSyncStub.withArgs(join("/Users/testuser/Library/Android/sdk/cmdline-tools/latest/bin", "apkanalyzer")).returns(true);
    //
    //   // Mock no environment variables
    //   processEnvStub.value({});
    //
    //   // Mock PATH detection fails
    //   execStub.rejects(new Error("Command not found"));
    //
    //   // Mock version detection
    //   execStub.withArgs(sinon.match(/sdkmanager.*--version/)).resolves({ stdout: "26.1.1\n", stderr: "" });
    //
    //   const locations = await detectionModule.detectAndroidCommandLineTools();
    //   const best = detectionModule.getBestAndroidToolsLocation(locations);
    //
    //   expect(locations.length).to.be.greaterThan(0);
    //   expect(best?.source).to.equal("homebrew"); // Should prefer homebrew over typical
    // });

    it("should validate required tools correctly", () => {
      const location = {
        path: "/test/path",
        source: "homebrew",
        available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
      };

      const validationResult = detectionModule.validateRequiredTools(location, ["sdkmanager", "avdmanager"]);
      expect(validationResult.valid).to.be.true;

      const invalidResult = detectionModule.validateRequiredTools(location, ["sdkmanager", "lint", "missing-tool"]);
      expect(invalidResult.valid).to.be.false;
      expect(invalidResult.missing).to.include("lint");
      expect(invalidResult.missing).to.include("missing-tool");
    });
  });
});
