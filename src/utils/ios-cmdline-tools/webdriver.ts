import { ChildProcess, exec, spawn } from "child_process";
import { promisify } from "util";
import * as http from "http";
import * as path from "path";
import { logger } from "../logger";
import { ActionableError, BootedDevice, DeviceInfo, ExecResult, ViewHierarchyResult } from "../../models";

// Enhance the standard execAsync result to implement the ExecResult interface
const execAsync = async (command: string, maxBuffer?: number): Promise<ExecResult> => {
  const options = maxBuffer ? { maxBuffer } : undefined;
  const result = await promisify(exec)(command, options);

  // Add the required string methods
  const enhancedResult: ExecResult = {
    stdout: typeof result.stdout === "string" ? result.stdout : result.stdout.toString(),
    stderr: typeof result.stderr === "string" ? result.stderr : result.stderr.toString(),
    toString() {
      return this.stdout;
    },
    trim() {
      return this.stdout.trim();
    },
    includes(searchString: string) {
      return this.stdout.includes(searchString);
    }
  };

  return enhancedResult;
};

interface WebDriverAgentOptions {
    wdaHost?: string;
    wdaPort?: number;
    mjpegPort?: number;
    bundleId?: string;
    derivedDataPath?: string;
    launchTimeout?: number;
    connectionTimeout?: number;
}

export class WebDriverAgent {
  device: BootedDevice | null;
  execAsync: (command: string, maxBuffer?: number) => Promise<ExecResult>;
  private xcodebuildProcess: ChildProcess | null = null;
  private wdaOptions: WebDriverAgentOptions;

  // Static cache for device list
  private static deviceListCache: { devices: DeviceInfo[], timestamp: number } | null = null;
  private static readonly DEVICE_LIST_CACHE_TTL = 5000; // 5 seconds

  /**
   * Create a WebDriverAgent instance
   * @param device - Optional device
   * @param wdaOptions - WebDriverAgent options
   * @param execAsyncFn - promisified exec function (for testing)
   */
  constructor(
    device: BootedDevice | null = null,
    wdaOptions: WebDriverAgentOptions = {},
    execAsyncFn: ((command: string, maxBuffer?: number) => Promise<ExecResult>) | null = null
  ) {
    this.device = device;
    this.execAsync = execAsyncFn || execAsync;
    this.wdaOptions = {
      wdaHost: "http://localhost",
      wdaPort: 8100,
      connectionTimeout: 10000,
      launchTimeout: 60000,
      ...wdaOptions
    };
  }

  /**
   * Set the target device ID
   * @param device - Device identifier
   */
  setDevice(device: BootedDevice): void {
    this.device = device;
  }

  /**
   * Start WebDriverAgent on the device using xcodebuild
   * @param timeoutMs - Timeout in milliseconds
   * @returns Promise that resolves when WDA is ready
   */
  async start(timeoutMs: number = 120000): Promise<WebDriverAgentOptions> {
    if (!this.device) {
      throw new ActionableError("Device must be set before starting WebDriverAgent");
    }

    if (!(await this.isAvailable())) {
      throw new ActionableError("Xcode command line tools are not available. Please install Xcode to continue.");
    }

    const timeout = timeoutMs;

    try {
      logger.info("[WebDriverAgent] Starting WebDriverAgent...");

      // Start the xcodebuild process and get the detected options
      // Update our configuration with detected options
      this.wdaOptions = await this.startXcodebuild(this.wdaOptions);

      // Wait for WDA to be ready
      await this.waitForReady(timeout);

      logger.info("[WebDriverAgent] WebDriverAgent started successfully");
      return this.wdaOptions;
    } catch (error) {
      logger.error(`[WebDriverAgent] Error during start: ${error instanceof Error ? error.message : String(error)}`);
      try {
        await this.stop();
      } catch (stopError) {
        logger.error(`[WebDriverAgent] Error during cleanup stop: ${stopError instanceof Error ? stopError.message : String(stopError)}`);
      }
      throw error;
    }
  }

  /**
     * Stop WebDriverAgent
     */
  async stop(): Promise<void> {
    if (this.xcodebuildProcess) {
      logger.debug("[WebDriverAgent] Stopping xcodebuild process");
      this.xcodebuildProcess.kill("SIGTERM");

      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (this.xcodebuildProcess && !this.xcodebuildProcess.killed) {
        logger.debug("[WebDriverAgent] Force killing xcodebuild process");
        this.xcodebuildProcess.kill("SIGKILL");
      }

      this.xcodebuildProcess = null;
    }
  }

  /**
   * Start the xcodebuild process and detect server URL/port
     */
  private async startXcodebuild(options: WebDriverAgentOptions): Promise<WebDriverAgentOptions> {
    if (!this.device) {
      throw new ActionableError("Device must be set before starting xcodebuild");
    }

    // Resolve WebDriverAgent project path relative to this module
    // When running from dist, this will be dist/src/utils/ios-cmdline-tools/webdriver.js
    // So we need to go up to dist/ then to ios/WebDriverAgent/
    const moduleDir = path.dirname(__filename);
    const distDir = path.resolve(moduleDir, "../../../"); // Go up from dist/src/utils/ios-cmdline-tools to dist/
    const wdaProjectPath = path.join(distDir, "ios", "WebDriverAgent", "WebDriverAgent.xcodeproj");

    logger.info(`[WebDriverAgent] Using WebDriverAgent project path: ${wdaProjectPath}`);

    const args = [
      "build-for-testing",
      "test-without-building",
      "-project", wdaProjectPath,
      "-scheme", "WebDriverAgentRunner",
      "-destination", `id=${this.device.deviceId}`,
      "GCC_TREAT_WARNINGS_AS_ERRORS=0",
      "COMPILER_INDEX_STORE_ENABLE=NO"
    ];

    // Set environment variables for custom ports if needed
    const env = { ...process.env };
    logger.info(`[WebDriverAgent] Starting xcodebuild with args: xcodebuild ${args.join(" ")}`);

    // Track server detection
    let serverUrlDetected = false;
    const detectedOptions: WebDriverAgentOptions = { ...options };

    return new Promise((resolve, reject) => {
      // Use stdio: 'pipe' and redirect to /dev/null to avoid console spam but keep process running
      this.xcodebuildProcess = spawn("xcodebuild", args, {
        env,
        stdio: ["ignore", "pipe", "pipe"], // redirect stdout/stderr to pipes we can monitor
        detached: false // Keep attached so we can manage it properly
      });

      // Timeout for server detection
      const detectionTimeout = setTimeout(() => {
        if (!serverUrlDetected) {
          reject(new ActionableError("Failed to detect WebDriverAgent server URL within timeout"));
        }
      }, options.launchTimeout || 60000);

      // Monitor stdout for the server URL to know when it's ready
      if (this.xcodebuildProcess?.stdout) {
        this.xcodebuildProcess.stdout.on("data", (data: Buffer) => {
          const output = data.toString();

          // Look for the actual server URL between markers
          const urlStartMarker = "ServerURLHere->";
          const urlEndMarker = "<-ServerURLHere";
          const startIndex = output.indexOf(urlStartMarker);
          const endIndex = output.indexOf(urlEndMarker);

          if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const url = output.substring(startIndex + urlStartMarker.length, endIndex).trim();
            if (url && !serverUrlDetected) {
              try {
                const parsedUrl = new URL(url);
                detectedOptions.wdaHost = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
                detectedOptions.wdaPort = parseInt(parsedUrl.port, 10) || 8100;

                logger.info(`[WebDriverAgent] Detected WebDriverAgent server at: ${url}`);
                logger.info(`[WebDriverAgent] Parsed - Host: ${detectedOptions.wdaHost}, Port: ${detectedOptions.wdaPort}`);

                serverUrlDetected = true;
                clearTimeout(detectionTimeout);
                resolve(detectedOptions);
              } catch (urlParseError) {
                logger.error(`[WebDriverAgent] Failed to parse server URL: ${url} - ${urlParseError}`);
              }
            }
          } else if (output.includes("ServerURLHere->") && !serverUrlDetected) {
            // Fallback detection without URL parsing
            logger.info("[WebDriverAgent] WebDriverAgent server started (using default URL)");
            serverUrlDetected = true;
            clearTimeout(detectionTimeout);
            resolve(detectedOptions);
          }

          // Log important messages, filter out verbose build output
          if (output.includes("TEST BUILD SUCCEEDED") ||
            output.includes("ServerURLHere") ||
            output.includes("Testing started") ||
            output.includes("Built at")) {
            logger.debug(`[WebDriverAgent] ${output.trim()}`);
          }
        });
      }

      if (this.xcodebuildProcess?.stderr) {
        this.xcodebuildProcess.stderr.on("data", (data: Buffer) => {
          const output = data.toString();
          // Log all stderr for debugging
          logger.warn(`[WebDriverAgent] stderr: ${output.trim()}`);
        });
      }

      this.xcodebuildProcess?.on("exit", (code, signal) => {
        logger.info(`[WebDriverAgent] xcodebuild exited with code ${code} and signal ${signal}`);
        this.xcodebuildProcess = null;
        if (!serverUrlDetected) {
          clearTimeout(detectionTimeout);
          reject(new ActionableError(`xcodebuild exited with code ${code} before server URL was detected`));
        }
      });

      this.xcodebuildProcess?.on("error", error => {
        logger.error(`[WebDriverAgent] xcodebuild error: ${error.message}`);
        this.xcodebuildProcess = null;
        clearTimeout(detectionTimeout);
        reject(new ActionableError(`xcodebuild error: ${error.message}`));
      });

      // Check if process started successfully
      if (!this.xcodebuildProcess) {
        clearTimeout(detectionTimeout);
        reject(new ActionableError("Failed to start xcodebuild process"));
      }
    });
  }

  /**
     * Wait for WebDriverAgent to be ready
     * @param timeoutMs - Timeout in milliseconds
     */
  private async waitForReady(timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every second
    let lastError: any = null;

    logger.info(`[WebDriverAgent] Waiting for WebDriverAgent to be ready (timeout: ${timeoutMs}ms)`);

    while (Date.now() - startTime < timeoutMs) {
      try {
        // First check if the process is still running
        if (!this.xcodebuildProcess) {
          throw new Error("xcodebuild process is null");
        }

        if (this.xcodebuildProcess.killed) {
          throw new Error("xcodebuild process was killed");
        }

        // Try to get status from WebDriverAgent
        logger.debug(`[WebDriverAgent] Attempting to connect to: ${this.wdaOptions.wdaHost}:${this.wdaOptions.wdaPort}`);
        const status = await this.getStatus();
        // Check status.value.ready instead of status.ready since the response is nested
        if (status && status.value && status.value.ready) {
          logger.info("[WebDriverAgent] WebDriverAgent is ready and responding");
          return;
        }
      } catch (error) {
        lastError = error;

        // Log connection attempts every 5 seconds to avoid spam
        if ((Date.now() - startTime) % 5000 < checkInterval) {
          logger.debug(`[WebDriverAgent] Still waiting for WebDriverAgent... (${Date.now() - startTime}ms elapsed) - Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // If we get here, we timed out
    const errorMessage = `WebDriverAgent failed to start within ${timeoutMs}ms`;
    if (lastError) {
      logger.error(`[WebDriverAgent] Last error: ${lastError.message}`);
      throw new ActionableError(`${errorMessage}. Last error: ${lastError.message}`);
    } else {
      throw new ActionableError(errorMessage);
    }
  }

  /**
     * Check if WebDriverAgent is running
     * @returns Promise with boolean indicating if WDA is running
     */
  async isRunning(): Promise<boolean> {
    try {
      const status = await this.getStatus();
      return status && status.value && status.value.ready === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get WebDriverAgent status
   * @returns Promise with status object
   */
  async getStatus(): Promise<any> {
    return this.makeRequest("GET", "/status", undefined, true);
  }

  /**
     * Create a new session
     * @param capabilities - Session capabilities
     * @returns Promise with session response
     */
  async createSession(capabilities: any = {}): Promise<any> {
    const payload = {
      capabilities: {
        alwaysMatch: capabilities,
        firstMatch: [{}]
      }
    };

    return this.makeRequest("POST", "/session", payload);
  }

  /**
     * Delete a session
     * @param sessionId - Session ID to delete
     * @returns Promise with delete response
     */
  async deleteSession(sessionId: string): Promise<any> {
    return this.makeRequest("DELETE", `/session/${sessionId}`);
  }

  /**
     * Get view hierarchy (page source)
     * @param device - Booted device
     * @returns Promise with view hierarchy result
     */
  async getViewHierarchy(device: BootedDevice): Promise<ViewHierarchyResult> {
    try {
      logger.info("[WebDriverAgent] Getting view hierarchy");

      // Ensure WebDriverAgent is running
      try {
        await this.ensureRunning();
        logger.debug("[WebDriverAgent] WebDriverAgent confirmed running");
      } catch (error) {
        logger.error(`[WebDriverAgent] Failed to ensure WebDriverAgent is running: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }

      // First ensure we have an active session
      let sessionId: string;

      try {
        // Try to get existing sessions
        logger.debug("[WebDriverAgent] Attempting to get existing sessions");
        const sessions = await this.makeRequest("GET", "/sessions");
        logger.info(`[WebDriverAgent] Sessions response: ${JSON.stringify(sessions)}`);
        if (sessions && sessions.value && sessions.value.length > 0) {
          sessionId = sessions.value[0].id;
          logger.info(`[WebDriverAgent] Using existing session: ${sessionId}`);
        } else {
          // Create a new session
          logger.info("[WebDriverAgent] Creating new session - no existing sessions found");
          const sessionResponse = await this.createSession({
            platformName: "iOS",
            udid: device.deviceId
          });
          logger.info(`[WebDriverAgent] Session creation response: ${JSON.stringify(sessionResponse)}`);
          sessionId = sessionResponse.sessionId || sessionResponse.value?.sessionId;
        }
      } catch (sessionError) {
        logger.warn(`[WebDriverAgent] Error getting existing sessions: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`);
        // Create a new session if we can't get existing ones
        try {
          logger.info("[WebDriverAgent] Creating new session due to error getting existing sessions");
          const sessionResponse = await this.createSession({
            platformName: "iOS",
            udid: device.deviceId
          });
          logger.info(`[WebDriverAgent] Session creation response (fallback): ${JSON.stringify(sessionResponse)}`);
          sessionId = sessionResponse.sessionId || sessionResponse.value?.sessionId;
        } catch (createError) {
          logger.error(`[WebDriverAgent] Failed to create new session: ${createError instanceof Error ? createError.message : String(createError)}`);
          throw createError;
        }
      }

      if (!sessionId) {
        const errorMsg = "Failed to create or retrieve WebDriverAgent session";
        logger.error(`[WebDriverAgent] ${errorMsg}`);
        throw new ActionableError(errorMsg);
      }

      logger.info(`[WebDriverAgent] Getting page source for session: ${sessionId}`);

      // Get page source (view hierarchy)
      let sourceResponse;
      try {
        sourceResponse = await this.makeRequest("GET", `/session/${sessionId}/source`);
        logger.debug(`[WebDriverAgent] Successfully received source response from WebDriverAgent`);
      } catch (sourceError) {
        logger.error(`[WebDriverAgent] Failed to get page source from session ${sessionId}: ${sourceError instanceof Error ? sourceError.message : String(sourceError)}`);
        throw sourceError;
      }

      logger.info(`[WebDriverAgent] Raw source response type: ${typeof sourceResponse}`);
      logger.info(`[WebDriverAgent] Raw source response keys: ${Object.keys(sourceResponse || {})}`);
      logger.info(`[WebDriverAgent] Full source response: ${JSON.stringify(sourceResponse).substring(0, 500)}...`);

      const sourceXml = sourceResponse.value || sourceResponse;
      logger.info(`[WebDriverAgent] Extracted XML type: ${typeof sourceXml}`);
      logger.info(`[WebDriverAgent] Extracted XML length: ${sourceXml ? String(sourceXml).length : "null/undefined"}`);

      if (sourceXml && typeof sourceXml === "string") {
        logger.info(`[WebDriverAgent] XML preview (first 200 chars): ${sourceXml.substring(0, 200)}`);
      }

      if (!sourceXml || typeof sourceXml !== "string") {
        const errorMsg = "Invalid view hierarchy response from WebDriverAgent";
        logger.error(`[WebDriverAgent] ${errorMsg} - sourceXml type: ${typeof sourceXml}, value: ${sourceXml}`);
        throw new ActionableError(errorMsg);
      }

      logger.info(`[WebDriverAgent] Successfully retrieved view hierarchy XML (${sourceXml.length} characters)`);

      // Parse the iOS XML using iOS-specific parser
      logger.info("[WebDriverAgent] Parsing iOS XML using iOS-specific parser");
      let parsedHierarchy;
      try {
        parsedHierarchy = await this.parseIOSXmlToViewHierarchy(sourceXml);
        logger.debug("[WebDriverAgent] Successfully parsed iOS XML to view hierarchy");
      } catch (parseError) {
        logger.error(`[WebDriverAgent] Failed to parse iOS XML: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        throw parseError;
      }

      logger.info(`[WebDriverAgent] Parsed hierarchy keys: ${Object.keys(parsedHierarchy || {})}`);
      logger.info(`[WebDriverAgent] Parsed hierarchy.hierarchy type: ${typeof parsedHierarchy?.hierarchy}`);
      if (parsedHierarchy?.hierarchy) {
        logger.info(`[WebDriverAgent] Parsed hierarchy.hierarchy keys: ${Object.keys(parsedHierarchy.hierarchy)}`);
      }

      return {
        hierarchy: parsedHierarchy.hierarchy
      };

    } catch (error) {
      logger.error(`[WebDriverAgent] Failed to get view hierarchy: ${error instanceof Error ? error.message : String(error)}`);
      logger.error(`[WebDriverAgent] Error stack trace: ${error instanceof Error ? error.stack : "No stack trace available"}`);

      // Return an error hierarchy instead of throwing
      return {
        hierarchy: {
          error: `Failed to retrieve view hierarchy: ${error instanceof Error ? error.message : String(error)}`
        }
      } as unknown as ViewHierarchyResult;
    }
  }

  /**
   * Parse iOS XML to Android-compatible view hierarchy format
   * @param xmlData - iOS XML string to parse
   * @returns Promise with parsed and filtered view hierarchy in Android format
   */
  async parseIOSXmlToViewHierarchy(xmlData: string): Promise<ViewHierarchyResult> {
    try {
      const xml2js = await import("xml2js");
      // Use simpler parser configuration for iOS XML
      const parser = new xml2js.Parser({
        explicitArray: false,
        attrkey: "$",
        charkey: "_"
      });

      const result = await parser.parseStringPromise(xmlData);
      logger.info(`[WebDriverAgent] Raw parsed result keys: ${Object.keys(result || {})}`);

      // Convert iOS format to Android-compatible format
      const convertedHierarchy = this.convertIOSToAndroidFormat(result);

      return {
        hierarchy: convertedHierarchy
      };
    } catch (error) {
      logger.error(`[WebDriverAgent] Error parsing iOS XML: ${error}`);
      return {
        hierarchy: {
          error: `Failed to parse iOS XML: ${error instanceof Error ? error.message : String(error)}`
        }
      } as unknown as ViewHierarchyResult;
    }
  }

  /**
   * Convert iOS element structure to Android-compatible format
   * @param iosNode - iOS element node
   * @returns Converted node in Android format
   */
  private convertIOSToAndroidFormat(iosNode: any): any {
    if (!iosNode) {
      return null;
    }

    logger.info(`[WebDriverAgent] Converting iOS node with keys: ${Object.keys(iosNode)}`);

    // Handle the root XCUIElementTypeApplication
    const rootElement = iosNode.XCUIElementTypeApplication;
    if (!rootElement) {
      logger.warn("[WebDriverAgent] No XCUIElementTypeApplication found in root");
      return null;
    }

    return this.convertIOSElement(rootElement, "XCUIElementTypeApplication");
  }

  /**
   * Convert individual iOS element to Android format
   * @param element - iOS element to convert
   * @param elementType - Element type name
   * @returns Converted element in Android format
   */
  private convertIOSElement(element: any, elementType: string): any {
    if (!element) {
      return null;
    }

    const converted: any = {};

    // Get attributes from the $ property (xml2js format)
    const attrs = element.$ || {};
    logger.debug(`[WebDriverAgent] Converting element ${elementType} with attrs: ${JSON.stringify(attrs)}`);

    // Convert iOS attributes to Android attribute names
    if (attrs.name) {
      converted.text = attrs.name;
    }
    if (attrs.label && attrs.label !== attrs.name) {
      converted["content-desc"] = attrs.label;
    }
    if (attrs.value) {
      converted.text = attrs.value; // iOS value often contains the actual text
    }

    // Map iOS accessibility to Android resourceId if it looks like an ID
    if (attrs.name && attrs.name.includes(".")) {
      converted["resource-id"] = attrs.name;
    }

    // Convert bounds from iOS format (x, y, width, height) to Android format
    if (attrs.x && attrs.y && attrs.width && attrs.height) {
      const x = parseInt(attrs.x, 10);
      const y = parseInt(attrs.y, 10);
      const width = parseInt(attrs.width, 10);
      const height = parseInt(attrs.height, 10);
      converted.bounds = `[${x},${y}][${x + width},${y + height}]`;
    }

    // Map iOS boolean attributes to Android format
    if (attrs.enabled === "true") {
      converted.enabled = "true";
    }
    if (attrs.accessible === "true") {
      converted.clickable = "true"; // iOS accessible often means clickable
    }

    // Add iOS element type as class for debugging
    converted.class = elementType;

    // Handle children - look for other XCUIElementType* properties
    const children = this.getIOSElementChildren(element);
    if (children && children.length > 0) {
      const convertedChildren = children
        .map(({ child, type }) => this.convertIOSElement(child, type))
        .filter(child => child !== null);

      if (convertedChildren.length > 0) {
        converted.node = convertedChildren.length === 1 ? convertedChildren[0] : convertedChildren;
      }
    }

    // Only return nodes that have meaningful content
    if (this.hasIOSMeaningfulContent(converted)) {
      return converted;
    }

    // If this node has no meaningful content but has children, return the children
    if (converted.node) {
      return converted.node;
    }

    return null;
  }

  /**
   * Get children elements from iOS element
   * @param element - iOS element
   * @returns Array of child elements with their types
   */
  private getIOSElementChildren(element: any): Array<{ child: any; type: string }> {
    const children: Array<{ child: any; type: string }> = [];

    // Look for properties that start with "XCUIElementType"
    for (const key in element) {
      if (key.startsWith("XCUIElementType") && key !== "$" && key !== "_") {
        const childElements = Array.isArray(element[key]) ? element[key] : [element[key]];
        for (const child of childElements) {
          children.push({ child, type: key });
        }
      }
    }

    return children;
  }

  /**
   * Check if iOS element has meaningful content worth including
   * @param element - Converted element to check
   * @returns True if element has meaningful content
   */
  private hasIOSMeaningfulContent(element: any): boolean {
    return Boolean(
      element.text ||
      element["content-desc"] ||
      element["resource-id"] ||
      element.clickable === "true" ||
      element.enabled === "true"
    );
  }

  /**
   * Ensure WebDriverAgent is running, start it if necessary
   * @returns Promise that resolves when WDA is confirmed running
   */
  private async ensureRunning(): Promise<WebDriverAgentOptions> {
    if (!this.device) {
      throw new ActionableError("Device must be set before ensuring WebDriverAgent is running");
    }

    try {
      if (await this.isRunning()) {
        logger.debug("[WebDriverAgent] WebDriverAgent is already running");
        return this.wdaOptions;
      }

      logger.debug("[WebDriverAgent] WebDriverAgent not running, starting it...");
      return await this.start();

    } catch (error) {
      logger.warn(`[WebDriverAgent] Failed to ensure WebDriverAgent is running: ${error}`);
      throw new ActionableError(`Failed to start WebDriverAgent: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Make HTTP request to WebDriverAgent
   * @param method - HTTP method
   * @param path - Request path
   * @param data - Request body data
   * @param extendedTimeout - Use extended timeout for startup operations
   * @returns Promise with response data
   */
  private async makeRequest(method: string, path: string, data?: any, extendedTimeout = false): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, `${this.wdaOptions.wdaHost}:${this.wdaOptions.wdaPort}`);
      const timeout = extendedTimeout ? 15000 : this.wdaOptions.connectionTimeout; // 15s for startup, 10s for normal ops

      logger.debug(`[WebDriverAgent] Making ${method} request to ${url.toString()} with timeout ${timeout}ms`);

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        timeout: timeout
      };

      const req = http.request(options, res => {
        let responseData = "";

        res.on("data", chunk => {
          responseData += chunk;
        });

        res.on("end", () => {
          logger.debug(`[WebDriverAgent] Received response with status ${res.statusCode}, data length: ${responseData.length}`);

          try {
            let parsedData;
            if (responseData) {
              parsedData = JSON.parse(responseData);
            } else {
              parsedData = {};
            }

            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              logger.debug(`[WebDriverAgent] Request successful: ${method} ${path}`);
              resolve(parsedData);
            } else {
              const errorMsg = parsedData.value?.message || parsedData.error?.message || responseData || `HTTP ${res.statusCode}`;
              logger.error(`[WebDriverAgent] HTTP error ${res.statusCode} for ${method} ${path}: ${errorMsg}`);
              reject(new Error(`HTTP ${res.statusCode}: ${errorMsg}`));
            }
          } catch (parseError) {
            logger.error(`[WebDriverAgent] Failed to parse response JSON for ${method} ${path}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(responseData);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${responseData || "Unknown error"}`));
            }
          }
        });
      });

      req.on("timeout", () => {
        logger.error(`[WebDriverAgent] Request timeout after ${timeout}ms for ${method} ${path}. WebDriverAgent may not be running or responding slowly.`);
        req.destroy();
        reject(new Error(`Request timeout after ${timeout}ms. WebDriverAgent may not be running.`));
      });

      req.on("error", error => {
        // Provide more helpful error messages for common connection issues
        if (error.message.includes("ECONNREFUSED")) {
          const errorMsg = `Connection refused to WebDriverAgent at ${this.wdaOptions.wdaHost}:${this.wdaOptions.wdaPort}. Make sure WebDriverAgent is running.`;
          logger.error(`[WebDriverAgent] ${errorMsg}`);
          reject(new Error(errorMsg));
        } else if (error.message.includes("ENOTFOUND")) {
          const errorMsg = `Cannot resolve host ${url.hostname}. Check WebDriverAgent configuration.`;
          logger.error(`[WebDriverAgent] ${errorMsg}`);
          reject(new Error(errorMsg));
        } else {
          logger.error(`[WebDriverAgent] Connection error for ${method} ${path}: ${error.message}`);
          reject(new Error(`Connection error: ${error.message}`));
        }
      });

      if (data) {
        logger.debug(`[WebDriverAgent] Sending request data: ${JSON.stringify(data).substring(0, 200)}...`);
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
     * Execute a WebDriverAgent command
     * @param command - The command to execute
     * @param timeoutMs - Optional timeout in milliseconds
     * @returns Promise with command output
     */
  async executeCommand(command: string, timeoutMs?: number): Promise<ExecResult> {
    // This method is kept for compatibility but delegates to makeRequest for HTTP commands
    // For actual shell commands, we still use execAsync
    if (command.startsWith("http") || command.startsWith("/")) {
      // Handle HTTP commands
      const result = await this.makeRequest("GET", command);
      const resultString = JSON.stringify(result);
      return {
        stdout: resultString,
        stderr: "",
        toString() {
          return resultString;
        },
        trim() {
          return resultString.trim();
        },
        includes(searchString: string) {
          return resultString.includes(searchString);
        }
      };
    } else {
      // Handle shell commands
      const fullCommand = `xcrun ${command}`;
      return this.execAsync(fullCommand);
    }
  }

  /**
     * Check if Xcode command line tools are available
   * @returns Promise with boolean indicating availability
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.execAsync("xcrun --version");
      return true;
    } catch (error) {
      logger.warn("Xcode command line tools are not available - iOS functionality requires Xcode to be installed.");
      return false;
    }
  }
}
