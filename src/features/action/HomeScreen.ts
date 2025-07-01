import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { HomeScreenResult } from "../../models/HomeScreenResult";
import { ElementUtils } from "../utility/ElementUtils";
import { logger } from "../../utils/logger";

interface NavigationCache {
    method: "gesture" | "hardware" | "element";
    timestamp: number;
    deviceProps?: Record<string, string>;
}

export class HomeScreen extends BaseVisualChange {
  private static navigationCache = new Map<string, NavigationCache>();
  private static readonly CACHE_DURATION_MS = 300000; // 5 minutes
  private elementUtils: ElementUtils;

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
    this.elementUtils = new ElementUtils();
  }

  async execute(progress?: ProgressCallback): Promise<HomeScreenResult> {
    const deviceId = this.adb.deviceId || "default";

    // Check cache first
    const cachedMethod = this.getCachedNavigationMethod(deviceId);
    if (cachedMethod) {
      logger.info(`[HomeScreen] Using cached navigation method: ${cachedMethod}`);
      return this.executeNavigationMethod(cachedMethod, true, progress);
    }

    // Detect navigation style
    const detectedMethod = await this.detectNavigationStyle(progress);

    // Cache the detected method (without getting device props again)
    this.cacheNavigationMethodSimple(deviceId, detectedMethod);

    return this.executeNavigationMethod(detectedMethod, false, progress);
  }

  private getCachedNavigationMethod(deviceId: string): "gesture" | "hardware" | "element" | null {
    const cached = HomeScreen.navigationCache.get(deviceId);
    if (!cached) {return null;}

    const now = Date.now();
    if (now - cached.timestamp > HomeScreen.CACHE_DURATION_MS) {
      HomeScreen.navigationCache.delete(deviceId);
      return null;
    }

    return cached.method;
  }

  private cacheNavigationMethodSimple(deviceId: string, method: "gesture" | "hardware" | "element"): void {
    HomeScreen.navigationCache.set(deviceId, {
      method,
      timestamp: Date.now()
    });
    logger.info(`[HomeScreen] Cached navigation method: ${method} for device: ${deviceId}`);
  }

  private async cacheNavigationMethod(deviceId: string, method: "gesture" | "hardware" | "element"): Promise<void> {
    try {
      const deviceProps = await this.getDeviceProperties();
      HomeScreen.navigationCache.set(deviceId, {
        method,
        timestamp: Date.now(),
        deviceProps
      });
      logger.info(`[HomeScreen] Cached navigation method: ${method} for device: ${deviceId}`);
    } catch (error) {
      logger.warn(`[HomeScreen] Failed to cache navigation method: ${error}`);
    }
  }

  private async detectNavigationStyle(progress?: ProgressCallback): Promise<"gesture" | "hardware" | "element"> {
    if (progress) {
      await progress(10, 100, "Detecting navigation style...");
    }

    try {
      // First, check device properties for navigation hints
      const deviceProps = await this.getDeviceProperties();
      const sdkVersion = parseInt(deviceProps["ro.build.version.sdk"] || "0", 10);

      logger.info(`[HomeScreen] SDK version: ${sdkVersion}`);

      // Android 10+ (API 29+) typically uses gesture navigation by default
      if (sdkVersion >= 29) {
        const hasGestureNav = await this.checkGestureNavigationEnabled();
        if (hasGestureNav) {
          logger.info("[HomeScreen] Detected gesture navigation (Android 10+)");
          return "gesture";
        }
      }

      // Check view hierarchy for navigation elements
      if (progress) {
        await progress(30, 100, "Analyzing view hierarchy for navigation elements...");
      }

      const observation = await this.observeScreen.execute();
      if (observation.viewHierarchy) {
        logger.info("[HomeScreen] Got view hierarchy, checking for home button");
        const hasHomeButton = this.findHomeButton(observation.viewHierarchy);
        if (hasHomeButton) {
          logger.info("[HomeScreen] Detected navigation bar with home button");
          return "element";
        } else {
          logger.info("[HomeScreen] No home button found in view hierarchy");
        }
      } else {
        logger.info("[HomeScreen] No view hierarchy available");
      }

      // Fallback to hardware button
      logger.info("[HomeScreen] Falling back to hardware home button");
      return "hardware";

    } catch (error) {
      logger.warn(`[HomeScreen] Navigation detection failed, using hardware fallback: ${error}`);
      return "hardware";
    }
  }

  private async getDeviceProperties(): Promise<Record<string, string>> {
    try {
      const result = await this.adb.executeCommand("shell getprop");
      const props: Record<string, string> = {};

      result.stdout.split("\n").forEach(line => {
        const match = line.match(/\[([^\]]+)\]: \[([^\]]*)\]/);
        if (match) {
          props[match[1]] = match[2];
        }
      });

      return props;
    } catch (error) {
      logger.warn(`[HomeScreen] Failed to get device properties: ${error}`);
      return {};
    }
  }

  private async checkGestureNavigationEnabled(): Promise<boolean> {
    try {
      // Check if gesture navigation is enabled
      const result = await this.adb.executeCommand("shell settings get secure navigation_mode");
      const navigationMode = result.stdout.trim();

      // Mode 2 typically indicates gesture navigation
      return navigationMode === "2";
    } catch (error) {
      logger.debug(`[HomeScreen] Could not check gesture navigation setting: ${error}`);
      return false;
    }
  }

  private findHomeButton(viewHierarchy: any): boolean {
    try {
      // Handle both .hierarchy and direct structures
      const hierarchyRoot = viewHierarchy.hierarchy || viewHierarchy;

      const rootNodes = this.elementUtils.extractRootNodes(hierarchyRoot);

      for (const rootNode of rootNodes) {
        let found = false;
        this.elementUtils.traverseNode(rootNode, (node: any) => {
          const props = this.elementUtils.extractNodeProperties(node);
          const resourceId = props["resource-id"] || "";
          const contentDesc = props["content-desc"] || "";
          const className = props["class"] || "";

          // Common home button resource IDs and content descriptions
          const homePatterns = [
            "home", "launcher", "com.android.systemui:id/home",
            "android:id/home", "navigation_bar_home"
          ];

          const isHomeButton = homePatterns.some(pattern =>
            resourceId.toLowerCase().includes(pattern) ||
                contentDesc.toLowerCase().includes(pattern)
          ) && (className.includes("Button") || className.includes("ImageView"));

          if (isHomeButton) {
            found = true;
          }
        });

        if (found) {return true;}
      }

      return false;
    } catch (error) {
      logger.warn(`[HomeScreen] Error finding home button in view hierarchy: ${error}`);
      return false;
    }
  }

  private async executeNavigationMethod(
    method: "gesture" | "hardware" | "element",
    cached: boolean,
    progress?: ProgressCallback
  ): Promise<HomeScreenResult> {
    return this.observedChange(
      async () => {
        try {
          let result: HomeScreenResult;
          switch (method) {
            case "gesture":
              result = await this.executeGestureNavigation(progress);
              break;
            case "element":
              result = await this.executeElementNavigation(progress);
              break;
            case "hardware":
              result = await this.executeHardwareNavigation(progress);
              break;
            default:
              throw new Error(`Unknown navigation method: ${method}`);
          }

          // Set the cached property
          result.cached = cached;
          return result;
        } catch (error) {
          // Try fallback methods
          logger.warn(`[HomeScreen] Primary method ${method} failed: ${error}`);
          return await this.executeFallbackNavigation(method, progress);
        }
      },
      {
        changeExpected: true,
        timeoutMs: 5000,
        progress
      }
    );
  }

  private async executeGestureNavigation(progress?: ProgressCallback): Promise<HomeScreenResult> {
    if (progress) {
      await progress(60, 100, "Executing gesture navigation...");
    }

    // Get screen dimensions for gesture calculation
    const observation = await this.observeScreen.execute();
    if (!observation.screenSize) {
      throw new Error("Could not get screen size for gesture navigation");
    }

    const { width, height } = observation.screenSize;

    // Calculate swipe coordinates from bottom center
    const startX = width / 2;
    const startY = height - 50; // Start near bottom edge
    const endX = startX;
    const endY = height / 2; // Swipe to middle of screen

    // Execute gesture swipe
    await this.adb.executeCommand(
      `shell input swipe ${startX} ${startY} ${endX} ${endY} 300`
    );

    return {
      success: true,
      navigationMethod: "gesture"
    };
  }

  private async executeElementNavigation(progress?: ProgressCallback): Promise<HomeScreenResult> {
    if (progress) {
      await progress(60, 100, "Executing element navigation...");
    }

    const observation = await this.observeScreen.execute();
    if (!observation.viewHierarchy) {
      throw new Error("Could not get view hierarchy for element navigation");
    }

    // Handle both .hierarchy and direct structures
    const hierarchyRoot = observation.viewHierarchy.hierarchy || observation.viewHierarchy;
    const rootNodes = this.elementUtils.extractRootNodes(hierarchyRoot);

    for (const rootNode of rootNodes) {
      let homeButton: any = null;

      this.elementUtils.traverseNode(rootNode, (node: any) => {
        const props = this.elementUtils.extractNodeProperties(node);
        const resourceId = props["resource-id"] || "";
        const contentDesc = props["content-desc"] || "";
        const className = props["class"] || "";

        const homePatterns = [
          "home", "launcher", "com.android.systemui:id/home",
          "android:id/home", "navigation_bar_home"
        ];

        const isHomeButton = homePatterns.some(pattern =>
          resourceId.toLowerCase().includes(pattern) ||
              contentDesc.toLowerCase().includes(pattern)
        ) && (className.includes("Button") || className.includes("ImageView"));

        if (isHomeButton && !homeButton) {
          homeButton = node;
        }
      });

      if (homeButton) {
        // Parse the node to get proper Element structure with bounds
        const parsedElement = this.elementUtils.parseNodeBounds(homeButton);
        if (!parsedElement) {
          throw new Error("Failed to parse home button bounds");
        }

        const center = this.elementUtils.getElementCenter(parsedElement);
        await this.adb.executeCommand(`shell input tap ${center.x} ${center.y}`);

        return {
          success: true,
          navigationMethod: "element"
        };
      }
    }

    throw new Error("Home button element not found");
  }

  private async executeHardwareNavigation(progress?: ProgressCallback): Promise<HomeScreenResult> {
    if (progress) {
      await progress(60, 100, "Executing hardware navigation...");
    }

    // Press hardware home button (keycode 3)
    await this.adb.executeCommand("shell input keyevent 3");

    return {
      success: true,
      navigationMethod: "hardware"
    };
  }

  private async executeFallbackNavigation(
    failedMethod: "gesture" | "hardware" | "element",
    progress?: ProgressCallback
  ): Promise<HomeScreenResult> {
    if (progress) {
      await progress(80, 100, "Trying fallback navigation methods...");
    }

    // Try methods in order of reliability
    const fallbackOrder: Array<"gesture" | "hardware" | "element"> =
            failedMethod === "hardware" ? ["element", "gesture"] :
              failedMethod === "element" ? ["hardware", "gesture"] :
                ["hardware", "element"];

    for (const method of fallbackOrder) {
      try {
        logger.info(`[HomeScreen] Trying fallback method: ${method}`);

        let result: HomeScreenResult;
        switch (method) {
          case "gesture":
            result = await this.executeGestureNavigation(progress);
            break;
          case "element":
            result = await this.executeElementNavigation(progress);
            break;
          case "hardware":
            result = await this.executeHardwareNavigation(progress);
            break;
        }

        // Mark as not cached since this is a fallback
        result.cached = false;
        return result;
      } catch (error) {
        logger.warn(`[HomeScreen] Fallback method ${method} failed: ${error}`);
        continue;
      }
    }

    return {
      success: false,
      navigationMethod: failedMethod,
      cached: false,
      error: `All navigation methods failed. Primary: ${failedMethod}`
    };
  }
}
