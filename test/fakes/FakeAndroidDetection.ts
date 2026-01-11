/**
 * Fake Android Detection implementation for testing
 * Allows full control over detection results and behavior
 */

import {
  AndroidDetection,
  AndroidToolsLocation,
  AndroidToolInfo,
  AndroidToolsSource
} from "../../src/utils/interfaces/AndroidDetection";

export class FakeAndroidDetection implements AndroidDetection {
  private typicalSdkPaths: string[] = [
    "/home/testuser/Android/Sdk",
    "/opt/android-sdk",
    "/usr/local/android-sdk"
  ];
  private homebrewPath: string | null = null;
  private envSdkPath: string | null = null;
  private toolsInPath: Map<string, boolean> = new Map();
  private toolPaths: Map<string, string> = new Map();
  private toolsInDirectories: Map<string, string[]> = new Map();
  private toolVersions: Map<string, string | undefined> = new Map();
  private homebrewDetectionResult: AndroidToolsLocation | null = null;
  private sdkToolsResults: AndroidToolsLocation[] = [];
  private pathToolsResult: AndroidToolsLocation | null = null;
  private allDetectionResults: AndroidToolsLocation[] = [];
  private androidTools: Record<string, AndroidToolInfo> = {
    apkanalyzer: { name: "apkanalyzer", description: "APK analysis and inspection" },
    avdmanager: { name: "avdmanager", description: "Android Virtual Device management" },
    sdkmanager: { name: "sdkmanager", description: "SDK package management" },
    lint: { name: "lint", description: "Static code analysis" },
    screenshot2: { name: "screenshot2", description: "Device screenshot capture" },
    d8: { name: "d8", description: "DEX compiler" },
    r8: { name: "r8", description: "Code shrinking and obfuscation" },
    resourceshrinker: { name: "resourceshrinker", description: "Resource optimization" },
    retrace: { name: "retrace", description: "Stack trace de-obfuscation" },
    profgen: { name: "profgen", description: "ART profile generation" }
  };
  private cacheCleared = false;

  /**
   * Set typical Android SDK paths
   */
  setTypicalSdkPaths(paths: string[]): void {
    this.typicalSdkPaths = paths;
  }

  /**
   * Set the homebrew Android tools path
   */
  setHomebrewPath(path: string | null): void {
    this.homebrewPath = path;
  }

  /**
   * Set the environment variable SDK path
   */
  setEnvSdkPath(path: string | null): void {
    this.envSdkPath = path;
  }

  /**
   * Set whether a tool is available in PATH
   */
  setToolInPath(toolName: string, available: boolean): void {
    this.toolsInPath.set(toolName, available);
  }

  /**
   * Set the path to a tool in PATH
   */
  setToolPath(toolName: string, path: string): void {
    this.toolPaths.set(toolName, path);
  }

  /**
   * Set available tools in a directory
   */
  setToolsInDirectory(directory: string, tools: string[]): void {
    this.toolsInDirectories.set(directory, tools);
  }

  /**
   * Set version for Android tools at a specific path
   */
  setToolVersion(path: string, version: string | undefined): void {
    this.toolVersions.set(path, version);
  }

  /**
   * Set the result of homebrew detection
   */
  setHomebrewDetectionResult(result: AndroidToolsLocation | null): void {
    this.homebrewDetectionResult = result;
  }

  /**
   * Set the results of SDK detection
   */
  setSdkToolsResults(results: AndroidToolsLocation[]): void {
    this.sdkToolsResults = results;
  }

  /**
   * Set the result of PATH detection
   */
  setPathToolsResult(result: AndroidToolsLocation | null): void {
    this.pathToolsResult = result;
  }

  /**
   * Set the results of comprehensive detection
   */
  setAllDetectionResults(results: AndroidToolsLocation[]): void {
    this.allDetectionResults = results;
  }

  /**
   * Set the Android tools registry
   */
  setAndroidTools(tools: Record<string, AndroidToolInfo>): void {
    this.androidTools = tools;
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.typicalSdkPaths = [
      "/home/testuser/Android/Sdk",
      "/opt/android-sdk",
      "/usr/local/android-sdk"
    ];
    this.homebrewPath = null;
    this.envSdkPath = null;
    this.toolsInPath.clear();
    this.toolPaths.clear();
    this.toolsInDirectories.clear();
    this.toolVersions.clear();
    this.homebrewDetectionResult = null;
    this.sdkToolsResults = [];
    this.pathToolsResult = null;
    this.allDetectionResults = [];
    this.cacheCleared = false;
    this.androidTools = {
      apkanalyzer: { name: "apkanalyzer", description: "APK analysis and inspection" },
      avdmanager: { name: "avdmanager", description: "Android Virtual Device management" },
      sdkmanager: { name: "sdkmanager", description: "SDK package management" },
      lint: { name: "lint", description: "Static code analysis" },
      screenshot2: { name: "screenshot2", description: "Device screenshot capture" },
      d8: { name: "d8", description: "DEX compiler" },
      r8: { name: "r8", description: "Code shrinking and obfuscation" },
      resourceshrinker: { name: "resourceshrinker", description: "Resource optimization" },
      retrace: { name: "retrace", description: "Stack trace de-obfuscation" },
      profgen: { name: "profgen", description: "ART profile generation" }
    };
  }

  /**
   * Check if cache was cleared
   */
  wasCacheCleared(): boolean {
    return this.cacheCleared;
  }

  // AndroidDetection implementation

  getTypicalAndroidSdkPaths(): string[] {
    return this.typicalSdkPaths;
  }

  getHomebrewAndroidToolsPath(): string | null {
    return this.homebrewPath;
  }

  getAndroidSdkFromEnvironment(): string | null {
    return this.envSdkPath;
  }

  async isToolInPath(toolName: string): Promise<boolean> {
    return this.toolsInPath.get(toolName) ?? false;
  }

  async getToolPathFromPath(toolName: string): Promise<string | null> {
    return this.toolPaths.get(toolName) ?? null;
  }

  getAvailableToolsInDirectory(toolsDir: string): string[] {
    return this.toolsInDirectories.get(toolsDir) ?? [];
  }

  async getAndroidToolsVersion(toolsPath: string): Promise<string | undefined> {
    return this.toolVersions.get(toolsPath);
  }

  async detectHomebrewAndroidTools(): Promise<AndroidToolsLocation | null> {
    return this.homebrewDetectionResult;
  }

  async detectAndroidSdkTools(): Promise<AndroidToolsLocation[]> {
    return this.sdkToolsResults;
  }

  async detectAndroidToolsInPath(): Promise<AndroidToolsLocation | null> {
    return this.pathToolsResult;
  }

  async detectAndroidCommandLineTools(): Promise<AndroidToolsLocation[]> {
    return this.allDetectionResults;
  }

  getBestAndroidToolsLocation(locations: AndroidToolsLocation[]): AndroidToolsLocation | null {
    if (locations.length === 0) {
      return null;
    }

    const sourcePriority: Record<AndroidToolsSource, number> = {
      android_home: 1,
      android_sdk_root: 2,
      typical: 3,
      homebrew: 4,
      path: 5,
      manual: 6
    };

    const scored = locations.map(location => {
      const sourcePriorityScore = sourcePriority[location.source] || 10;
      const totalTools = location.available_tools.length;
      const score = sourcePriorityScore * 100 - totalTools;
      return { location, score };
    });

    scored.sort((a, b) => a.score - b.score);
    return scored[0]?.location || null;
  }

  validateRequiredTools(
    location: AndroidToolsLocation,
    requiredTools: string[]
  ): {
    valid: boolean;
    missing: string[];
  } {
    const missing = requiredTools.filter(tool => !location.available_tools.includes(tool));
    return {
      valid: missing.length === 0,
      missing
    };
  }

  clearDetectionCache(): void {
    this.cacheCleared = true;
  }

  getAndroidTools(): Record<string, AndroidToolInfo> {
    return this.androidTools;
  }
}
