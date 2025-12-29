import { expect } from "chai";
import { join } from "path";
import {
  getTypicalAndroidSdkPaths,
  getHomebrewAndroidToolsPath,
  getAndroidSdkFromEnvironment,
  getAvailableToolsInDirectory,
  getBestAndroidToolsLocation,
  validateRequiredTools,
  detectHomebrewAndroidTools,
  detectAndroidSdkTools,
  detectAndroidCommandLineTools,
  ANDROID_TOOLS,
  clearDetectionCache
} from "../../../src/utils/android-cmdline-tools/detection";
import { FakeSystemDetection } from "../../fakes/FakeSystemDetection";

describe("Android Command Line Tools - Detection", () => {
  let systemDetection: FakeSystemDetection;

  beforeEach(() => {
    systemDetection = new FakeSystemDetection();
    clearDetectionCache();
  });

  describe("ANDROID_TOOLS registry", () => {
    it("should contain all expected tools", () => {
      expect(ANDROID_TOOLS).to.have.property("apkanalyzer");
      expect(ANDROID_TOOLS).to.have.property("avdmanager");
      expect(ANDROID_TOOLS).to.have.property("sdkmanager");
      expect(ANDROID_TOOLS).to.have.property("lint");
      expect(ANDROID_TOOLS).to.have.property("screenshot2");
      expect(ANDROID_TOOLS).to.have.property("d8");
      expect(ANDROID_TOOLS).to.have.property("r8");
      expect(ANDROID_TOOLS).to.have.property("resourceshrinker");
      expect(ANDROID_TOOLS).to.have.property("retrace");
      expect(ANDROID_TOOLS).to.have.property("profgen");
    });

    it("should have valid tool descriptions", () => {
      Object.values(ANDROID_TOOLS).forEach((tool: any) => {
        expect(tool.name).to.be.a("string").that.is.not.empty;
        expect(tool.description).to.be.a("string").that.is.not.empty;
      });
    });
  });

  describe("getTypicalAndroidSdkPaths", () => {
    it("should return macOS paths when platform is darwin", () => {
      systemDetection.setPlatform("darwin");
      systemDetection.setHomeDir("/Users/testuser");

      const paths = getTypicalAndroidSdkPaths(systemDetection);

      expect(paths).to.include("/Users/testuser/Library/Android/sdk");
      expect(paths).to.include("/opt/android-sdk");
      expect(paths).to.include("/usr/local/android-sdk");
    });

    it("should return Linux paths when platform is linux", () => {
      systemDetection.setPlatform("linux");
      systemDetection.setHomeDir("/home/testuser");

      const paths = getTypicalAndroidSdkPaths(systemDetection);

      expect(paths).to.include("/home/testuser/Android/Sdk");
      expect(paths).to.include("/opt/android-sdk");
      expect(paths).to.include("/usr/local/android-sdk");
    });

    it("should return Windows paths when platform is win32", () => {
      systemDetection.setPlatform("win32");
      systemDetection.setHomeDir("C:\\Users\\testuser");

      const paths = getTypicalAndroidSdkPaths(systemDetection);

      expect(paths).to.include("C:\\Users\\testuser/AppData/Local/Android/Sdk");
      expect(paths).to.include("C:/Android/Sdk");
      expect(paths).to.include("C:/android-sdk");
    });

    it("should return empty array for unknown platforms", () => {
      systemDetection.setPlatform("unknown");

      const paths = getTypicalAndroidSdkPaths(systemDetection);

      expect(paths).to.be.an("array").that.is.empty;
    });
  });

  describe("getHomebrewAndroidToolsPath", () => {
    it("should return null for non-macOS platforms", () => {
      systemDetection.setPlatform("linux");

      const path = getHomebrewAndroidToolsPath(systemDetection);

      expect(path).to.be.null;
    });

    it("should return path when homebrew installation exists on macOS", () => {
      systemDetection.setPlatform("darwin");
      systemDetection.addExistingFile("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");

      const path = getHomebrewAndroidToolsPath(systemDetection);

      expect(path).to.equal("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");
    });

    it("should return null when homebrew installation does not exist on macOS", () => {
      systemDetection.setPlatform("darwin");

      const path = getHomebrewAndroidToolsPath(systemDetection);

      expect(path).to.be.null;
    });
  });

  describe("getAndroidSdkFromEnvironment", () => {
    it("should return ANDROID_HOME path when it exists", () => {
      systemDetection.setEnvVar("ANDROID_HOME", "/path/to/android-home");
      systemDetection.addExistingFile("/path/to/android-home");

      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).to.equal("/path/to/android-home");
    });

    it("should return ANDROID_SDK_ROOT path when ANDROID_HOME does not exist", () => {
      systemDetection.setEnvVar("ANDROID_HOME", "/nonexistent/path");
      systemDetection.setEnvVar("ANDROID_SDK_ROOT", "/path/to/android-sdk-root");
      systemDetection.addExistingFile("/path/to/android-sdk-root");

      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).to.equal("/path/to/android-sdk-root");
    });

    it("should return null when neither environment variable points to existing path", () => {
      systemDetection.setEnvVar("ANDROID_HOME", "/nonexistent/path1");
      systemDetection.setEnvVar("ANDROID_SDK_ROOT", "/nonexistent/path2");

      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).to.be.null;
    });

    it("should return null when no environment variables are set", () => {
      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).to.be.null;
    });
  });

  describe("getAvailableToolsInDirectory", () => {
    it("should return empty array when directory does not exist", () => {
      const tools = getAvailableToolsInDirectory("/nonexistent", systemDetection);

      expect(tools).to.be.an("array").that.is.empty;
    });

    it("should return empty array when bin directory does not exist", () => {
      systemDetection.addExistingFile("/test/tools");

      const tools = getAvailableToolsInDirectory("/test/tools", systemDetection);

      expect(tools).to.be.an("array").that.is.empty;
    });

    it("should return available tools when they exist in bin directory", () => {
      systemDetection.addExistingFile("/test/tools");
      systemDetection.addExistingFile("/test/tools/bin");
      systemDetection.addExistingFile(join("/test/tools/bin", "apkanalyzer"));
      systemDetection.addExistingFile(join("/test/tools/bin", "sdkmanager"));

      const tools = getAvailableToolsInDirectory("/test/tools", systemDetection);

      expect(tools).to.include("apkanalyzer");
      expect(tools).to.include("sdkmanager");
      expect(tools).to.not.include("avdmanager");
    });

    it("should detect Windows .bat files", () => {
      systemDetection.setPlatform("win32");
      systemDetection.addExistingFile("/test/tools");
      systemDetection.addExistingFile("/test/tools/bin");
      systemDetection.addExistingFile(join("/test/tools/bin", "apkanalyzer.bat"));

      const tools = getAvailableToolsInDirectory("/test/tools", systemDetection);

      expect(tools).to.include("apkanalyzer");
    });
  });

  describe("getBestAndroidToolsLocation", () => {
    it("should return null for empty locations array", () => {
      const best = getBestAndroidToolsLocation([]);
      expect(best).to.be.null;
    });

    it("should prioritize homebrew over other sources", () => {
      const locations = [
        {
          path: "/typical/path",
          source: "typical" as const,
          available_tools: ["apkanalyzer", "sdkmanager"]
        },
        {
          path: "/homebrew/path",
          source: "homebrew" as const,
          available_tools: ["apkanalyzer"]
        }
      ];

      const best = getBestAndroidToolsLocation(locations);
      expect(best?.source).to.equal("homebrew");
    });

    it("should prioritize locations with more available tools when source is the same", () => {
      const locations = [
        {
          path: "/path1",
          source: "typical" as const,
          available_tools: ["d8", "r8"]
        },
        {
          path: "/path2",
          source: "typical" as const,
          available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
        }
      ];

      const best = getBestAndroidToolsLocation(locations);
      expect(best?.path).to.equal("/path2");
    });

    it("should handle source priority correctly", () => {
      const locations = [
        {
          path: "/path-typical",
          source: "typical" as const,
          available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
        },
        {
          path: "/path-android-home",
          source: "android_home" as const,
          available_tools: ["apkanalyzer", "sdkmanager"]
        }
      ];

      const best = getBestAndroidToolsLocation(locations);
      expect(best?.source).to.equal("android_home");
    });

    it("should handle all source types with correct priority", () => {
      const locations = [
        {
          path: "/manual",
          source: "manual" as const,
          available_tools: ["apkanalyzer", "sdkmanager", "avdmanager", "lint"]
        },
        {
          path: "/path",
          source: "path" as const,
          available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
        },
        {
          path: "/android-sdk-root",
          source: "android_sdk_root" as const,
          available_tools: ["apkanalyzer", "sdkmanager"]
        },
        {
          path: "/homebrew",
          source: "homebrew" as const,
          available_tools: ["apkanalyzer"]
        }
      ];

      const best = getBestAndroidToolsLocation(locations);
      expect(best?.source).to.equal("homebrew");
    });
  });

  describe("validateRequiredTools", () => {
    it("should return valid when all required tools are available", () => {
      const location = {
        path: "/test/path",
        source: "typical" as const,
        available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
      };

      const result = validateRequiredTools(location, ["apkanalyzer", "sdkmanager"]);

      expect(result.valid).to.be.true;
      expect(result.missing).to.be.empty;
    });

    it("should return invalid when some required tools are missing", () => {
      const location = {
        path: "/test/path",
        source: "typical" as const,
        available_tools: ["apkanalyzer"]
      };

      const result = validateRequiredTools(location, ["apkanalyzer", "sdkmanager", "avdmanager"]);

      expect(result.valid).to.be.false;
      expect(result.missing).to.include("sdkmanager");
      expect(result.missing).to.include("avdmanager");
      expect(result.missing).to.not.include("apkanalyzer");
    });

    it("should handle empty required tools array", () => {
      const location = {
        path: "/test/path",
        source: "typical" as const,
        available_tools: []
      };

      const result = validateRequiredTools(location, []);

      expect(result.valid).to.be.true;
      expect(result.missing).to.be.empty;
    });
  });

  describe("detectHomebrewAndroidTools", () => {
    it("should return null when homebrew path is not available", async () => {
      systemDetection.setPlatform("linux");

      const result = await detectHomebrewAndroidTools(systemDetection);

      expect(result).to.be.null;
    });

    it("should return null when no tools are available in homebrew path", async () => {
      systemDetection.setPlatform("darwin");
      systemDetection.addExistingFile("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");

      const result = await detectHomebrewAndroidTools(systemDetection);

      expect(result).to.be.null;
    });
  });

  describe("detectAndroidSdkTools", () => {
    it("should return empty array when no SDK paths are found", async () => {
      systemDetection.setPlatform("unknown");

      const result = await detectAndroidSdkTools(systemDetection);

      expect(result).to.be.an("array").that.is.empty;
    });

    it("should detect tools from ANDROID_SDK_ROOT environment variable", async () => {
      systemDetection.setEnvVar("ANDROID_SDK_ROOT", "/android/sdk");
      systemDetection.addExistingFile("/android/sdk");
      systemDetection.addExistingFile("/android/sdk/cmdline-tools/latest");
      systemDetection.addExistingFile("/android/sdk/cmdline-tools/latest/bin");
      systemDetection.addExistingFile(join("/android/sdk/cmdline-tools/latest/bin", "apkanalyzer"));
      systemDetection.setExecResponse("sdkmanager --version", "26.1.1\n");

      const result = await detectAndroidSdkTools(systemDetection);

      expect(result).to.have.length(1);
      expect(result[0].source).to.equal("android_sdk_root");
      expect(result[0].path).to.equal("/android/sdk/cmdline-tools/latest");
    });
  });

  describe("detectAndroidCommandLineTools", () => {
    it("should handle errors gracefully and continue detection", async () => {
      systemDetection.setPlatform("darwin");
      systemDetection.setHomeDir("/Users/test");

      const result = await detectAndroidCommandLineTools(systemDetection);

      expect(result).to.be.an("array");
    });
  });

  describe("Integration tests", () => {
    it("should validate required tools correctly", () => {
      const location = {
        path: "/test/path",
        source: "homebrew" as const,
        available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
      };

      const validationResult = validateRequiredTools(location, ["sdkmanager", "avdmanager"]);
      expect(validationResult.valid).to.be.true;

      const invalidResult = validateRequiredTools(location, ["sdkmanager", "lint", "missing-tool"]);
      expect(invalidResult.valid).to.be.false;
      expect(invalidResult.missing).to.include("lint");
      expect(invalidResult.missing).to.include("missing-tool");
    });
  });
});
