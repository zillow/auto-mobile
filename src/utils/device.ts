import fs from 'fs-extra';
import path from 'path';
import xml2js from 'xml2js';
import { AdbUtils } from './adb.ts';
import { ChildProcess } from 'child_process';
import { logger } from './logger.ts';
import crypto from 'crypto';

interface ScreenSize {
  width: number;
  height: number;
}

interface SystemInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface ActiveWindowInfo {
  packageName: string;
  activityName: string;
  windowId: string;
  isVisible: boolean;
}

interface ViewHierarchyCache {
  timestamp: number;
  activityHash: string;
  viewHierarchy: any;
}

export class DeviceUtils {
  private adb: AdbUtils;
  private static viewHierarchyCache: Map<string, ViewHierarchyCache> = new Map();
  private static cacheDir: string = path.join(process.cwd(), '.view_hierarchy_cache');
  private static readonly MAX_CACHE_SIZE_BYTES = 128 * 1024 * 1024; // 128MB
  private static readonly CACHE_TTL_MS = 60 * 1000; // 60 seconds

  /**
   * Create a DeviceUtils instance
   * @param deviceId - Optional device ID
   * @param adbUtils - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string | null = null, adbUtils: AdbUtils | null = null) {
    this.adb = adbUtils || new AdbUtils(deviceId);

    // Ensure cache directory exists
    if (!fs.existsSync(DeviceUtils.cacheDir)) {
      fs.mkdirSync(DeviceUtils.cacheDir, { recursive: true });
    }
  }

  /**
   * Get the screen size and resolution
   * @returns Promise with width and height
   */
  async getScreenSize(): Promise<ScreenSize> {
    try {
      // First get the physical screen size
      const { stdout } = await this.adb.executeCommand('shell wm size');
      const physicalMatch = stdout.match(/Physical size: (\d+)x(\d+)/);

      if (!physicalMatch) {
        throw new Error('Failed to get screen size');
      }

      const physicalWidth = parseInt(physicalMatch[1], 10);
      const physicalHeight = parseInt(physicalMatch[2], 10);

      // Then check the current rotation to determine actual dimensions
      const { stdout: rotationOutput } = await this.adb.executeCommand('shell dumpsys window | grep -i "mRotation\\|mCurrentRotation"');
      const rotationMatch = rotationOutput.match(/mRotation=(\d+)|mCurrentRotation=(\d+)/);

      let rotation = 0;
      if (rotationMatch) {
        // Get the rotation value from whichever group matched
        rotation = parseInt(rotationMatch[1] || rotationMatch[2], 10);
      }

      logger.debug(`Device rotation detected: ${rotation}`);

      // Adjust dimensions based on rotation
      // 0 = portrait, 1 = landscape (90° clockwise), 2 = portrait upside down, 3 = landscape (270° clockwise)
      if (rotation === 1 || rotation === 3) {
        // In landscape mode, swap width and height
        return {
          width: physicalHeight,
          height: physicalWidth
        };
      }

      // In portrait mode, use original dimensions
      return {
        width: physicalWidth,
        height: physicalHeight
      };
    } catch (err) {
      throw new Error(`Failed to get screen size: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get the system UI insets
   * @returns Promise with inset values
   */
  async getSystemInsets(): Promise<SystemInsets> {
    try {
      // Modern Android uses WindowInsets instead of overscan
      const { stdout } = await this.adb.executeCommand('shell dumpsys window | grep -i inset');

      // Parse status bar height
      const statusBarMatch = stdout.match(/statusBars.*?frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      const statusBarHeight = statusBarMatch ? parseInt(statusBarMatch[4], 10) - parseInt(statusBarMatch[2], 10) : 0;

      // Parse navigation bar height
      const navBarMatch = stdout.match(/navigationBars.*?frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      const navBarHeight = navBarMatch ? parseInt(navBarMatch[4], 10) - parseInt(navBarMatch[2], 10) : 0;

      // Parse left and right insets (usually for edge gestures or cutouts)
      const leftGestureMatch = stdout.match(/systemGestures.*?sideHint=LEFT.*?frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      const leftInset = leftGestureMatch ? parseInt(leftGestureMatch[3], 10) - parseInt(leftGestureMatch[1], 10) : 0;

      const rightGestureMatch = stdout.match(/systemGestures.*?sideHint=RIGHT.*?frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      const rightInset = rightGestureMatch ? parseInt(rightGestureMatch[3], 10) - parseInt(rightGestureMatch[1], 10) : 0;

      logger.debug('System insets detected: %o', {
        top: statusBarHeight,
        bottom: navBarHeight,
        left: leftInset,
        right: rightInset
      });

      return {
        top: statusBarHeight,
        right: rightInset,
        bottom: navBarHeight,
        left: leftInset
      };
    } catch (error) {
      // Fallback to dumpsys window without grep to get heights
      try {
        const { stdout } = await this.adb.executeCommand('shell dumpsys window');

        // Try to find status bar height
        const statusBarHeightMatch = stdout.match(/mStatusBarHeight=(\d+)/);
        const statusBarHeight = statusBarHeightMatch ? parseInt(statusBarHeightMatch[1], 10) : 0;

        // Try to find navigation bar height
        const navBarHeightMatch = stdout.match(/mNavigationBarHeight=(\d+)/);
        const navBarHeight = navBarHeightMatch ? parseInt(navBarHeightMatch[1], 10) : 0;

        logger.debug('Using fallback system insets: %o', {
          top: statusBarHeight,
          bottom: navBarHeight,
          left: 0,
          right: 0
        });

        return {
          top: statusBarHeight,
          right: 0,
          bottom: navBarHeight,
          left: 0
        };
      } catch (innerError) {
        logger.warn('Failed to get system insets:', innerError);
        return { top: 0, right: 0, bottom: 0, left: 0 };
      }
    }
  }

  /**
   * Retrieve the view hierarchy of the current screen
   * @returns Promise with parsed XML view hierarchy
   */
  async getViewHierarchy(cache: boolean = false): Promise<any> {
    try {
      // Check if we should use cache
      if (cache) {
        const activeWindow = await this.getActiveWindow();
        const screenshotPath = path.join(DeviceUtils.cacheDir, `temp_screenshot_${Date.now()}.png`);

        try {
          // Take a screenshot for hashing
          await this.takeScreenshot(screenshotPath, true);

          // Generate hash from screenshot and activity info
          const screenshotBuffer = await fs.readFile(screenshotPath);
          const activityHash = crypto.createHash('md5')
            .update(activeWindow.packageName + activeWindow.activityName)
            .update(screenshotBuffer)
            .digest('hex');

          // Check if we have a valid cache entry
          const cachedEntry = DeviceUtils.viewHierarchyCache.get(activityHash);

          if (cachedEntry && (Date.now() - cachedEntry.timestamp < DeviceUtils.CACHE_TTL_MS)) {
            logger.debug(`Using cached view hierarchy for ${activeWindow.packageName}/${activeWindow.activityName}`);

            // Clean up the temporary screenshot
            await fs.remove(screenshotPath);

            return cachedEntry.viewHierarchy;
          } else {
            logger.debug('cannot use cached view hierarchy')
          }

          // Get the view hierarchy (will be cached below)
          const viewHierarchy = await this._getViewHierarchyWithoutCache();

          // Cache the result
          DeviceUtils.viewHierarchyCache.set(activityHash, {
            timestamp: Date.now(),
            activityHash,
            viewHierarchy
          });

          // Clean up the temporary screenshot
          await fs.remove(screenshotPath);

          // Maintain cache size
          this.maintainCacheSize();

          return viewHierarchy;
        } catch (cacheErr) {
          logger.warn(`Error using view hierarchy cache: ${cacheErr}`);
          // Clean up the temporary screenshot if it exists
          if (fs.existsSync(screenshotPath)) {
            await fs.remove(screenshotPath);
          }
        }
      }

      // If cache is disabled or failed, get the view hierarchy directly
      return await this._getViewHierarchyWithoutCache();
    } catch (err) {
      throw new Error(`Failed to get view hierarchy: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Internal method to get view hierarchy without caching
   * @returns Promise with parsed XML view hierarchy
   */
  private async _getViewHierarchyWithoutCache(): Promise<any> {
    var uiautomatorDumpStart = Date.now();
    const tempFile = '/sdcard/window_dump.xml';

    try {
      // Optimized approach: use a single shell session to avoid ADB overhead
      const { stdout } = await this.adb.executeCommand(`shell "uiautomator dump && cat ${tempFile} && rm ${tempFile}"`);

      // Extract XML content (remove uiautomator output message)
      let xmlData = stdout;
      const uiHierarchyMessage = 'UI hierchary dumped to:';
      if (xmlData.includes(uiHierarchyMessage)) {
        const prefixEnd = xmlData.indexOf(uiHierarchyMessage) + uiHierarchyMessage.length + tempFile.length + 1;
        xmlData = xmlData.substring(prefixEnd);
      }

      logger.debug(`uiautomator dump && cat took ${Date.now() - uiautomatorDumpStart}ms`);

      var hierarchyAnalysisStart = Date.now();
      // Parse the XML data
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlData);

      logger.debug(`hierarchy analysis took ${Date.now() - hierarchyAnalysisStart}ms`);

      return result;
    } catch (err) {
      logger.debug('Optimized view hierarchy retrieval failed, falling back to original method:', err);

      // Capture the view hierarchy
      await this.adb.executeCommand('shell uiautomator dump');

      // Pull the file from the device
      await this.adb.executeCommand(`pull ${tempFile} .`);

      // Read and parse the XML file
      const xmlData = await fs.readFile('./window_dump.xml', 'utf8');
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlData);

      // Clean up temporary files
      await fs.remove('./window_dump.xml');
      await this.adb.executeCommand(`shell rm ${tempFile}`);

      return result;
    }
  }

  /**
   * Maintain the view hierarchy cache size
   * If cache exceeds MAX_CACHE_SIZE_BYTES, removes oldest entries
   */
  private async maintainCacheSize(): Promise<void> {
    try {
      // Get all files in the cache directory
      const files = await fs.readdir(DeviceUtils.cacheDir);
      let totalSize = 0;
      const fileStats: { path: string, size: number, mtime: Date }[] = [];

      // Collect file stats
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(DeviceUtils.cacheDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          fileStats.push({ path: filePath, size: stats.size, mtime: stats.mtime });
        }
      }

      // If cache is too large, remove oldest files
      if (totalSize > DeviceUtils.MAX_CACHE_SIZE_BYTES) {
        // Sort by modification time (oldest first)
        fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

        // Remove oldest files until we're under the limit
        let sizeToFree = totalSize - DeviceUtils.MAX_CACHE_SIZE_BYTES;
        for (const file of fileStats) {
          await fs.remove(file.path);
          sizeToFree -= file.size;
          if (sizeToFree <= 0) break;
        }

        logger.debug(`Cleared ${fileStats.length} old cache files to maintain cache size limit`);
      }
    } catch (err) {
      logger.warn(`Error maintaining cache size: ${err}`);
    }
  }

  /**
   * Get information about the active window
   * @returns Promise with active window information
   */
  async getActiveWindow(): Promise<ActiveWindowInfo> {
    try {
      const { stdout } = await this.adb.executeCommand('shell dumpsys window windows');

      // Parse focus information
      const focusedAppMatch = stdout.match(/mFocusedApp=.*ActivityRecord\{.*\s([^\/\s]+)\/([^\s\}]+)/);
      const currentFocusMatch = stdout.match(/mCurrentFocus=Window\{([^\s]+)\s([^\/\s]+)\/([^\s\}]+)/);

      // Default values
      let packageName = '';
      let activityName = '';
      let windowId = '';
      let isVisible = false;

      // Extract info from focused app
      if (focusedAppMatch) {
        packageName = focusedAppMatch[1];
        activityName = focusedAppMatch[2];
      }

      // Extract window ID from current focus
      if (currentFocusMatch) {
        windowId = currentFocusMatch[1];
        // If no package from focused app, use from current focus
        if (!packageName) {
          packageName = currentFocusMatch[2];
          activityName = currentFocusMatch[3];
        }
      }

      // Check if the window is visible
      const windowMatch = stdout.match(new RegExp(`Window\\{${windowId}[^}]*\\}.*isVisible=(true|false)`));
      if (windowMatch) {
        isVisible = windowMatch[1] === 'true';
      }

      return { packageName, activityName, windowId, isVisible };
    } catch (err) {
      throw new Error(`Failed to get active window: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get recent activity information
   * @returns Promise with recent activity data
   */
  async getActivityRecents(): Promise<any> {
    try {
      const { stdout } = await this.adb.executeCommand('shell dumpsys activity recents');

      // Extract recent tasks information
      const recentTasks: any[] = [];

      // Parse recent tasks
      const taskRegex = /Recent #(\d+):\s+TaskRecord\{([^\s]+)\s+#(\d+)\s+([^}]+)\}/g;
      let match;

      while ((match = taskRegex.exec(stdout)) !== null) {
        const taskId = match[3];
        const packageName = match[4].split('/')[0];

        // Extract activity name if available
        const activityMatch = match[4].match(/\/([^}\s]+)/);
        const activityName = activityMatch ? activityMatch[1] : '';

        recentTasks.push({
          id: taskId,
          packageName,
          activityName
        });
      }

      return {
        timestamp: Date.now(),
        recentTasks
      };
    } catch (err) {
      throw new Error(`Failed to get activity recents: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Take a screenshot of the device
   * @param outputPath - Path to save the screenshot
   * @param fastMode - Whether to use fast mode for screenshot
   * @returns Promise with path to the saved screenshot
   */
  async takeScreenshot(outputPath: string = '', fastMode: boolean = false): Promise<string> {
    try {
      const timestamp = new Date().getTime();
      const finalPath = outputPath || `./screenshot_${timestamp}.png`;

      // Attempt to use optimized method - capture directly to base64 and save locally
      const { stdout } = await this.adb.executeCommand('shell screencap -p | base64');
      if (stdout) {
        // Convert base64 string to buffer and save directly to file
        const imageBuffer = Buffer.from(stdout.replace(/\s/g, ''), 'base64');
        await fs.writeFile(finalPath, imageBuffer);
        return finalPath;
      }

      throw new Error('No output from base64 screenshot');
    } catch (err) {
      // If optimized method fails, fall back to the original method
      logger.debug('Optimized screenshot method failed, falling back to original method:', err);

      const tempFile = '/sdcard/screenshot.png';
      const timestamp = new Date().getTime();
      const finalPath = outputPath || `./screenshot_${timestamp}.png`;

      // Capture the screenshot
      await this.adb.executeCommand('shell screencap -p ' + tempFile);

      // Pull the file from the device
      await this.adb.executeCommand(`pull ${tempFile} ${finalPath}`);

      // Clean up the temporary file on the device
      await this.adb.executeCommand(`shell rm ${tempFile}`);

      return finalPath;
    }
  }

  /**
   * Start capturing touch events
   * @returns Process to receive events
   */
  startCaptureEvents(): ChildProcess {
    return this.adb.spawnCommand('shell getevent -l');
  }

  /**
   * Change the device orientation
   * @param orientation - Either 'portrait' or 'landscape'
   * @param packageName - Optional package name to monitor for UI stability
   */
  async setOrientation(orientation: string, packageName?: string): Promise<void> {
    if (orientation !== 'portrait' && orientation !== 'landscape') {
      throw new Error('Orientation must be either "portrait" or "landscape"');
    }

    const value = orientation === 'portrait' ? 0 : 1;
    await this.adb.executeCommand(`shell settings put system accelerometer_rotation 0`);
    await this.adb.executeCommand(`shell settings put system user_rotation ${value}`);

    // Wait for rotation to complete
    await this.waitForRotation(value);

    // If packageName is provided, also wait for UI stability
    if (packageName) {
      await this.waitForUiStability(packageName);
    }
  }

  /**
   * Wait for the device rotation to complete
   * @param targetRotation - The expected rotation value (0 for portrait, 1 for landscape)
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @param pollIntervalMs - How often to check rotation status
   * @returns Promise that resolves when rotation completes or rejects on timeout
   */
  async waitForRotation(targetRotation: number, timeoutMs: number = 500, pollIntervalMs: number = 17): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Check the current rotation through window manager service
        const { stdout } = await this.adb.executeCommand('shell dumpsys window | grep -i "mRotation="');
        const rotationMatch = stdout.match(/mRotation=(\d+)/);

        if (rotationMatch) {
          const currentRotation = parseInt(rotationMatch[1]);
          logger.debug(`Current rotation: ${currentRotation}, target: ${targetRotation}`);

          if (currentRotation === targetRotation) {
            logger.debug(`Rotation to ${targetRotation} complete, took ${Date.now() - startTime}ms`);
            return; // Rotation complete
          }
        }
      } catch (err) {
        // Just continue polling on error
      }

      // Wait a short interval before checking again
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // If we get here, we timed out waiting for rotation
    throw new Error(`Timeout waiting for rotation to ${targetRotation} after ${timeoutMs}ms`);
  }

  /**
   * Wait for UI to become stable by monitoring frame rendering
   * @param packageName - Package name of the app to monitor
   * @param stabilityThresholdMs - Time in ms with no janky frames to consider stable
   * @param timeoutMs - Maximum time to wait for stability
   * @param pollIntervalMs - How often to check frame stats
   * @returns Promise that resolves when UI is stable
   */
  async waitForUiStability(
    packageName: string,
    stabilityThresholdMs: number = 5010000,
    timeoutMs: number = 250,
    pollIntervalMs: number = 17
  ): Promise<void> {
    const startTime = Date.now();
    let lastJankyFrameTime = startTime;

    // Reset the gfxinfo stats for the package
    await this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName} reset`);

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Get the frame stats
        const { stdout } = await this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName}`);

        // Look for janky frames in the output
        const hasJankyFrames = stdout.includes('Janky frames');

        if (hasJankyFrames) {
          // Extract the janky frames count
          const jankyMatch = stdout.match(/Janky frames: (\d+) \((\d+\.\d+)%\)/);
          if (jankyMatch && parseInt(jankyMatch[1]) > 0) {
            logger.debug(`Detected ${jankyMatch[1]} janky frames (${jankyMatch[2]}%)`);
            lastJankyFrameTime = Date.now();
          }
        }

        // If no janky frames for the stability threshold, consider UI stable
        if (Date.now() - lastJankyFrameTime >= stabilityThresholdMs) {
          logger.debug(`UI stable after ${Date.now() - startTime}ms`);
          return;
        }
      } catch (err) {
        // Just continue polling on error
        logger.debug('Error checking frame stats:', err);
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // If we get here, we timed out waiting for stability
    logger.debug(`Timeout waiting for UI stability after ${timeoutMs}ms`);
    // Don't throw error, just return - UI might be usable even if not perfectly stable
  }
}