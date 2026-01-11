import { expect, describe, test, beforeEach } from "bun:test";
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
    test("should contain all expected tools", () => {
      expect(ANDROID_TOOLS).toHaveProperty("apkanalyzer");
      expect(ANDROID_TOOLS).toHaveProperty("avdmanager");
      expect(ANDROID_TOOLS).toHaveProperty("sdkmanager");
      expect(ANDROID_TOOLS).toHaveProperty("lint");
      expect(ANDROID_TOOLS).toHaveProperty("screenshot2");
      expect(ANDROID_TOOLS).toHaveProperty("d8");
      expect(ANDROID_TOOLS).toHaveProperty("r8");
      expect(ANDROID_TOOLS).toHaveProperty("resourceshrinker");
      expect(ANDROID_TOOLS).toHaveProperty("retrace");
      expect(ANDROID_TOOLS).toHaveProperty("profgen");
    });

    test("should have valid tool descriptions", () => {
      Object.values(ANDROID_TOOLS).forEach((tool: any) => {
        expect(typeof tool.name).toBe("string");
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe("string");
        expect(tool.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe("getTypicalAndroidSdkPaths", () => {
    test("should return macOS paths when platform is darwin", () => {
      systemDetection.setPlatform("darwin");
      systemDetection.setHomeDir("/Users/testuser");

      const paths = getTypicalAndroidSdkPaths(systemDetection);

      expect(paths).toContain("/Users/testuser/Library/Android/sdk");
      expect(paths).toContain("/opt/android-sdk");
      expect(paths).toContain("/usr/local/android-sdk");
    });

    test("should return Linux paths when platform is linux", () => {
      systemDetection.setPlatform("linux");
      systemDetection.setHomeDir("/home/testuser");

      const paths = getTypicalAndroidSdkPaths(systemDetection);

      expect(paths).toContain("/home/testuser/Android/Sdk");
      expect(paths).toContain("/opt/android-sdk");
      expect(paths).toContain("/usr/local/android-sdk");
    });

    test("should return Windows paths when platform is win32", () => {
      systemDetection.setPlatform("win32");
      systemDetection.setHomeDir("C:\\Users\\testuser");

      const paths = getTypicalAndroidSdkPaths(systemDetection);

      expect(paths).toContain("C:\\Users\\testuser/AppData/Local/Android/Sdk");
      expect(paths).toContain("C:/Android/Sdk");
      expect(paths).toContain("C:/android-sdk");
    });

    test("should return empty array for unknown platforms", () => {
      systemDetection.setPlatform("unknown");

      const paths = getTypicalAndroidSdkPaths(systemDetection);

      expect(Array.isArray(paths)).toBe(true);
      expect(paths).toHaveLength(0);
    });
  });

  describe("getHomebrewAndroidToolsPath", () => {
    test("should return null for non-macOS platforms", () => {
      systemDetection.setPlatform("linux");

      const path = getHomebrewAndroidToolsPath(systemDetection);

      expect(path).toBeNull();
    });

    test("should return path when homebrew installation exists on macOS", () => {
      systemDetection.setPlatform("darwin");
      systemDetection.addExistingFile("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");

      const path = getHomebrewAndroidToolsPath(systemDetection);

      expect(path).toBe("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");
    });

    test("should return null when homebrew installation does not exist on macOS", () => {
      systemDetection.setPlatform("darwin");

      const path = getHomebrewAndroidToolsPath(systemDetection);

      expect(path).toBeNull();
    });
  });

  describe("getAndroidSdkFromEnvironment", () => {
    test("should return ANDROID_HOME path when it exists", () => {
      systemDetection.setEnvVar("ANDROID_HOME", "/path/to/android-home");
      systemDetection.addExistingFile("/path/to/android-home");

      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).toBe("/path/to/android-home");
    });

    test("should return ANDROID_SDK_ROOT path when ANDROID_HOME does not exist", () => {
      systemDetection.setEnvVar("ANDROID_HOME", "/nonexistent/path");
      systemDetection.setEnvVar("ANDROID_SDK_ROOT", "/path/to/android-sdk-root");
      systemDetection.addExistingFile("/path/to/android-sdk-root");

      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).toBe("/path/to/android-sdk-root");
    });

    test("should return null when neither environment variable points to existing path", () => {
      systemDetection.setEnvVar("ANDROID_HOME", "/nonexistent/path1");
      systemDetection.setEnvVar("ANDROID_SDK_ROOT", "/nonexistent/path2");

      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).toBeNull();
    });

    test("should return null when no environment variables are set", () => {
      const path = getAndroidSdkFromEnvironment(systemDetection);

      expect(path).toBeNull();
    });
  });

  describe("getAvailableToolsInDirectory", () => {
    test("should return empty array when directory does not exist", () => {
      const tools = getAvailableToolsInDirectory("/nonexistent", systemDetection);

      expect(Array.isArray(tools)).toBe(true);
      expect(tools).toHaveLength(0);
    });

    test("should return empty array when bin directory does not exist", () => {
      systemDetection.addExistingFile("/test/tools");

      const tools = getAvailableToolsInDirectory("/test/tools", systemDetection);

      expect(Array.isArray(tools)).toBe(true);
      expect(tools).toHaveLength(0);
    });

    test("should return available tools when they exist in bin directory", () => {
      systemDetection.addExistingFile("/test/tools");
      systemDetection.addExistingFile("/test/tools/bin");
      systemDetection.addExistingFile(join("/test/tools/bin", "apkanalyzer"));
      systemDetection.addExistingFile(join("/test/tools/bin", "sdkmanager"));

      const tools = getAvailableToolsInDirectory("/test/tools", systemDetection);

      expect(tools).toContain("apkanalyzer");
      expect(tools).toContain("sdkmanager");
      expect(tools).not.toContain("avdmanager");
    });

    test("should detect Windows .bat files", () => {
      systemDetection.setPlatform("win32");
      systemDetection.addExistingFile("/test/tools");
      systemDetection.addExistingFile("/test/tools/bin");
      systemDetection.addExistingFile(join("/test/tools/bin", "apkanalyzer.bat"));

      const tools = getAvailableToolsInDirectory("/test/tools", systemDetection);

      expect(tools).toContain("apkanalyzer");
    });
  });

  describe("getBestAndroidToolsLocation", () => {
    test("should return null for empty locations array", () => {
      const best = getBestAndroidToolsLocation([]);
      expect(best).toBeNull();
    });

    test("should prioritize Android SDK locations over Homebrew", () => {
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
      expect(best?.source).toBe("typical");
    });

    test("should prioritize locations with more available tools when source is the same", () => {
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
      expect(best?.path).toBe("/path2");
    });

    test("should handle source priority correctly", () => {
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
      expect(best?.source).toBe("android_home");
    });

    test("should handle all source types with correct priority", () => {
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
      expect(best?.source).toBe("android_sdk_root");
    });
  });

  describe("validateRequiredTools", () => {
    test("should return valid when all required tools are available", () => {
      const location = {
        path: "/test/path",
        source: "typical" as const,
        available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
      };

      const result = validateRequiredTools(location, ["apkanalyzer", "sdkmanager"]);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    test("should return invalid when some required tools are missing", () => {
      const location = {
        path: "/test/path",
        source: "typical" as const,
        available_tools: ["apkanalyzer"]
      };

      const result = validateRequiredTools(location, ["apkanalyzer", "sdkmanager", "avdmanager"]);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain("sdkmanager");
      expect(result.missing).toContain("avdmanager");
      expect(result.missing).not.toContain("apkanalyzer");
    });

    test("should handle empty required tools array", () => {
      const location = {
        path: "/test/path",
        source: "typical" as const,
        available_tools: []
      };

      const result = validateRequiredTools(location, []);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe("detectHomebrewAndroidTools", () => {
    test("should return null when homebrew path is not available", async () => {
      systemDetection.setPlatform("linux");

      const result = await detectHomebrewAndroidTools(systemDetection);

      expect(result).toBeNull();
    });

    test("should return null when no tools are available in homebrew path", async () => {
      systemDetection.setPlatform("darwin");
      systemDetection.addExistingFile("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest");

      const result = await detectHomebrewAndroidTools(systemDetection);

      expect(result).toBeNull();
    });
  });

  describe("detectAndroidSdkTools", () => {
    test("should return empty array when no SDK paths are found", async () => {
      systemDetection.setPlatform("unknown");

      const result = await detectAndroidSdkTools(systemDetection);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    test("should detect tools from ANDROID_SDK_ROOT environment variable", async () => {
      systemDetection.setEnvVar("ANDROID_SDK_ROOT", "/android/sdk");
      systemDetection.addExistingFile("/android/sdk");
      systemDetection.addExistingFile("/android/sdk/cmdline-tools/latest");
      systemDetection.addExistingFile("/android/sdk/cmdline-tools/latest/bin");
      systemDetection.addExistingFile(join("/android/sdk/cmdline-tools/latest/bin", "apkanalyzer"));
      systemDetection.setExecResponse("sdkmanager --version", "26.1.1\n");

      const result = await detectAndroidSdkTools(systemDetection);

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("android_sdk_root");
      expect(result[0].path).toBe("/android/sdk/cmdline-tools/latest");
    });
  });

  describe("detectAndroidCommandLineTools", () => {
    test("should handle errors gracefully and continue detection", async () => {
      systemDetection.setPlatform("darwin");
      systemDetection.setHomeDir("/Users/test");

      const result = await detectAndroidCommandLineTools(systemDetection);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Integration tests", () => {
    test("should validate required tools correctly", () => {
      const location = {
        path: "/test/path",
        source: "homebrew" as const,
        available_tools: ["apkanalyzer", "sdkmanager", "avdmanager"]
      };

      const validationResult = validateRequiredTools(location, ["sdkmanager", "avdmanager"]);
      expect(validationResult.valid).toBe(true);

      const invalidResult = validateRequiredTools(location, ["sdkmanager", "lint", "missing-tool"]);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.missing).toContain("lint");
      expect(invalidResult.missing).toContain("missing-tool");
    });
  });
});
