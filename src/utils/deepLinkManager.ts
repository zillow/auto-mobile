import { logger } from "./logger";
import { AdbUtils } from "./adb";
import { DeepLinkResult, IntentFilter, DeepLinkInfo, IntentChooserResult, ViewHierarchyResult } from "../models";
import { ElementUtils } from "../features/utility/ElementUtils";

export class DeepLinkManager {
  private adbUtils: AdbUtils;
  private elementUtils: ElementUtils;

  constructor(deviceId: string | null = null) {
    this.adbUtils = new AdbUtils(deviceId);
    this.elementUtils = new ElementUtils();
  }

  /**
     * Set the target device ID
     * @param deviceId - Device identifier
     */
  setDeviceId(deviceId: string): void {
    this.adbUtils.setDeviceId(deviceId);
  }

  /**
     * Get deep links for an application by querying the package manager
     * @param appId - The application package ID
     * @returns Promise with deep link information
     */
  async getDeepLinks(appId: string): Promise<DeepLinkResult> {
    try {
      logger.info(`[DeepLinkManager] Querying deep links for app: ${appId}`);

      // Use dumpsys package to get detailed package information including intent filters
      const packageInfoResult = await this.adbUtils.executeCommand(
        `shell dumpsys package ${appId}`
      );

      // Parse the results
      const deepLinks = this.parsePackageDumpsysOutput(appId, packageInfoResult.stdout);

      return {
        success: true,
        appId,
        deepLinks,
        rawOutput: packageInfoResult.stdout
      };
    } catch (error) {
      logger.error(`[DeepLinkManager] Failed to get deep links for ${appId}: ${error}`);
      return {
        success: false,
        appId,
        deepLinks: {
          schemes: [],
          hosts: [],
          intentFilters: [],
          supportedMimeTypes: []
        },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Parse deep link results from dumpsys package output
     * @param appId - The application package ID
   * @param dumpsysOutput - Output from dumpsys package command
     * @returns Parsed deep link information
     */
  private parsePackageDumpsysOutput(appId: string, dumpsysOutput: string): DeepLinkInfo {
    const schemes = new Set<string>();
    const hosts = new Set<string>();
    const intentFilters: IntentFilter[] = [];
    const supportedMimeTypes = new Set<string>();

    const lines = dumpsysOutput.split("\n");
    let inSchemesSection = false;
    let inIntentFilterSection = false;
    let currentFilter: Partial<IntentFilter> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect start of Schemes section
      if (line === "Schemes:") {
        inSchemesSection = true;
        continue;
      }

      // Process schemes section
      if (inSchemesSection) {
        if (line === "" || line.startsWith("Non-Data Actions:") || line.startsWith("Receiver Resolver Table:")) {
          inSchemesSection = false;
          continue;
        }

        // Parse scheme entries (format: "scheme:")
        const schemeMatch = line.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):$/);
        if (schemeMatch) {
          const scheme = schemeMatch[1];
          schemes.add(scheme);

          // Look ahead for authority information
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            const authorityMatch = nextLine.match(/^([a-fA-F0-9]+)\s+.*filter\s+([a-fA-F0-9]+)$/);
            if (authorityMatch) {
              // Look for Authority line in the following lines
              for (let j = i + 2; j < Math.min(i + 10, lines.length); j++) {
                const authLine = lines[j].trim();
                const hostMatch = authLine.match(/^Authority:\s+"([^"]+)":\s*-?\d+$/);
                if (hostMatch) {
                  hosts.add(hostMatch[1]);
                  break;
                }
              }
            }
          }
        }
      }

      // Process intent filter details
      if (line.includes("Action:") && line.includes("android.intent.action.VIEW")) {
        inIntentFilterSection = true;
        currentFilter = {
          action: "android.intent.action.VIEW",
          category: [],
          data: []
        };
      }

      if (inIntentFilterSection) {
        if (line.startsWith("Category:")) {
          const category = line.replace("Category:", "").trim().replace(/"/g, "");
          if (currentFilter.category) {
            currentFilter.category.push(category);
          }
        }

        if (line.startsWith("Scheme:")) {
          const scheme = line.replace("Scheme:", "").trim().replace(/"/g, "");
          schemes.add(scheme);
          if (!currentFilter.data) {currentFilter.data = [];}
          currentFilter.data.push({ scheme });
        }

        if (line.startsWith("Authority:")) {
          const authorityMatch = line.match(/^Authority:\s+"([^"]+)":\s*-?\d+$/);
          if (authorityMatch) {
            const host = authorityMatch[1];
            hosts.add(host);
            if (!currentFilter.data) {currentFilter.data = [];}
            // Find existing data entry with scheme or create new one
            const lastDataEntry = currentFilter.data[currentFilter.data.length - 1];
            if (lastDataEntry && !lastDataEntry.host) {
              lastDataEntry.host = host;
            } else {
              currentFilter.data.push({ host });
            }
          }
        }

        if (line.startsWith("Type:")) {
          const mimeType = line.replace("Type:", "").trim().replace(/"/g, "");
          supportedMimeTypes.add(mimeType);
          if (!currentFilter.data) {currentFilter.data = [];}
          currentFilter.data.push({ mimeType });
        }

        // End of current intent filter
        if (line === "" || (line.includes("filter") && line.includes("Action:"))) {
          if (currentFilter.action) {
            intentFilters.push(currentFilter as IntentFilter);
            currentFilter = {};
            inIntentFilterSection = false;
          }
        }
      }
    }

    // Add the last filter if we were still processing one
    if (inIntentFilterSection && currentFilter.action) {
      intentFilters.push(currentFilter as IntentFilter);
    }

    return {
      schemes: Array.from(schemes),
      hosts: Array.from(hosts),
      intentFilters,
      supportedMimeTypes: Array.from(supportedMimeTypes)
    };
  }

  /**
     * Detect system intent chooser dialog in view hierarchy
   * @param viewHierarchy - Current view hierarchy result
     * @returns True if intent chooser is detected
     */
  detectIntentChooser(viewHierarchy: ViewHierarchyResult): boolean {
    try {
      // If the hierarchy is empty, return false
      if (!viewHierarchy || !viewHierarchy.hierarchy || !viewHierarchy.hierarchy.node) {
        return false;
      }

      // Look for common intent chooser indicators
      const textIndicators = [
        "Choose an app",
        "Open with",
        "Complete action using",
        "Always",
        "Just once"
      ];

      const classIndicators = [
        "com.android.internal.app.ChooserActivity",
        "com.android.internal.app.ResolverActivity"
      ];

      const resourceIdIndicators = [
        "android:id/button_always",
        "android:id/button_once",
        "resolver_list",
        "chooser_list"
      ];

      // Get root nodes from the view hierarchy
      const rootNodes = this.elementUtils.extractRootNodes(viewHierarchy);

      // Check all nodes in the hierarchy
      for (const rootNode of rootNodes) {
        let foundIndicator = false;

        this.elementUtils.traverseNode(rootNode, (node: any) => {
          if (foundIndicator) {return;}

          const nodeProperties = this.elementUtils.extractNodeProperties(node);
          const nodeClass = nodeProperties.class || "";
          const nodeText = nodeProperties.text || nodeProperties["content-desc"] || "";
          const nodeResourceId = nodeProperties["resource-id"] || "";

          // Check for class indicators
          for (const className of classIndicators) {
            if (nodeClass.includes(className)) {
              foundIndicator = true;
              return;
            }
          }

          // Check for text indicators (exact match)
          for (const text of textIndicators) {
            if (nodeText === text) {
              foundIndicator = true;
              return;
            }
          }

          // Check for resource ID indicators
          for (const resourceId of resourceIdIndicators) {
            if (nodeResourceId.includes(resourceId)) {
              foundIndicator = true;
              return;
            }
          }
        });

        if (foundIndicator) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.warn(`[DeepLinkManager] Error detecting intent chooser: ${error}`);
      return false;
    }
  }


  /**
     * Handle system intent chooser dialog automatically
   * @param viewHierarchy - Current view hierarchy result
     * @param preference - User preference for handling ("always", "just_once", or "custom")
     * @param customAppPackage - Optional specific app package to select
     * @returns Result of intent chooser handling
     */
  async handleIntentChooser(
    viewHierarchy: ViewHierarchyResult,
    preference: "always" | "just_once" | "custom" = "just_once",
    customAppPackage?: string
  ): Promise<IntentChooserResult> {
    try {
      const detected = this.detectIntentChooser(viewHierarchy);

      if (!detected) {
        return {
          success: true,
          detected: false
        };
      }

      logger.info(`[DeepLinkManager] Intent chooser detected, preference: ${preference}`);

      // Parse the view hierarchy to find buttons
      const rootNodes = this.elementUtils.extractRootNodes(viewHierarchy);
      let targetElement = null;

      if (preference === "always") {
        // Look for "Always" button
        for (const rootNode of rootNodes) {
          targetElement = this.findButtonByText(rootNode, ["Always", "ALWAYS"]);
          if (targetElement) {break;}
        }
      } else if (preference === "just_once") {
        // Look for "Just once" button
        for (const rootNode of rootNodes) {
          targetElement = this.findButtonByText(rootNode, ["Just once", "JUST ONCE", "Once"]);
          if (targetElement) {break;}
        }
      } else if (preference === "custom" && customAppPackage) {
        // Look for specific app in the list
        for (const rootNode of rootNodes) {
          targetElement = this.findAppInChooser(rootNode, customAppPackage);
          if (targetElement) {break;}
        }
      }

      if (targetElement) {
        // Simulate tap on the target element
        const center = this.elementUtils.getElementCenter(targetElement);
        await this.adbUtils.executeCommand(`shell input tap ${center.x} ${center.y}`);

        logger.info(`[DeepLinkManager] Tapped on intent chooser option at (${center.x}, ${center.y})`);

        return {
          success: true,
          detected: true,
          action: preference,
          appSelected: customAppPackage
        };
      } else {
        return {
          success: false,
          detected: true,
          error: `Could not find target element for preference: ${preference}`
        };
      }
    } catch (error) {
      logger.error(`[DeepLinkManager] Failed to handle intent chooser: ${error}`);
      return {
        success: false,
        detected: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
     * Find a button by text content in the view hierarchy
     * @param node - Root node to search from
     * @param textOptions - Array of text options to match
     * @returns Found element or null
     */
  private findButtonByText(node: any, textOptions: string[]): any {
    let foundElement: any = null;

    this.elementUtils.traverseNode(node, (currentNode: any) => {
      if (foundElement) {return;} // Already found

      const properties = this.elementUtils.extractNodeProperties(currentNode);
      const text = properties.text || properties["content-desc"] || "";
      const className = properties.class || "";

      // Check if this is a button-like element with matching text
      if ((className.includes("Button") || className.includes("TextView")) &&
                textOptions.some(option => text.toLowerCase().includes(option.toLowerCase()))) {
        foundElement = currentNode;
      }
    });

    return foundElement;
  }

  /**
     * Find a specific app in the intent chooser list
     * @param node - Root node to search from
     * @param appPackage - App package to find
     * @returns Found element or null
     */
  private findAppInChooser(node: any, appPackage: string): any {
    let foundElement: any = null;

    this.elementUtils.traverseNode(node, (currentNode: any) => {
      if (foundElement) {return;} // Already found

      const properties = this.elementUtils.extractNodeProperties(currentNode);
      const resourceId = properties["resource-id"] || "";
      const text = properties.text || properties["content-desc"] || "";

      // Check if this element references the target app
      if (resourceId.includes(appPackage) || text.includes(appPackage)) {
        foundElement = currentNode;
      }
    });

    return foundElement;
  }
}
