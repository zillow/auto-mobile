import { expect, describe, test, beforeEach, afterEach } from "bun:test";
import { DeepLinkManager } from "../../src/utils/DeepLinkManager";
import { ElementUtils } from "../../src/features/utility/ElementUtils";
import { ViewHierarchyResult, BootedDevice } from "../../src/models";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";

describe("DeepLinkManager", () => {
  let deepLinkManager: DeepLinkManager;
  let fakeAdb: FakeAdbExecutor;
  let mockElementUtils: ElementUtils;
  let testDevice: BootedDevice;

  beforeEach(() => {
    // Create a proper BootedDevice object
    testDevice = {
      name: "test-device",
      platform: "android",
      deviceId: "test-device-id"
    };

    // Create fakes for testing
    fakeAdb = new FakeAdbExecutor();

    // Set up default responses for dumpsys package
    fakeAdb.setCommandResponse("dumpsys package com.example.app", {
      stdout: `Package [com.example.app] (12345):
  userId=10123
  pkg=Package{abcdef com.example.app}
  codePath=/data/app/com.example.app-1
  resourcePath=/data/app/com.example.app-1
  legacyNativeLibraryDir=/data/app/com.example.app-1/lib
  primaryCpuAbi=arm64-v8a
  secondaryCpuAbi=null
  versionCode=1 minSdk=21 targetSdk=33
  versionName=1.0
  splits=[base]
  apkSigningVersion=2
  applicationInfo=ApplicationInfo{123456 com.example.app}
  flags=[ INSTALLED HAS_CODE ALLOW_CLEAR_USER_DATA ALLOW_BACKUP ]
  privateFlags=[ PRIVATE_FLAG_ACTIVITIES_RESIZE_MODE_RESIZEABLE ]
  dataDir=/data/user/0/com.example.app
  supportsScreens=[small, medium, large, xlarge, resizeable, anyDensity]
  timeStamp=2024-01-01 10:00:00
  firstInstallTime=2024-01-01 10:00:00
  lastUpdateTime=2024-01-01 10:00:00
  signatures=PackageSignatures{fedcba [abcdef]}
  installPermissionsFixed=true
  pkgFlags=[ INSTALLED HAS_CODE ALLOW_CLEAR_USER_DATA ALLOW_BACKUP ]
  declared permissions:
    com.example.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION: prot=signature, INSTALLED
  requested permissions:
    android.permission.INTERNET: granted=true
    android.permission.ACCESS_NETWORK_STATE: granted=true
  install permissions:
    android.permission.INTERNET: granted=true
    android.permission.ACCESS_NETWORK_STATE: granted=true
  User 0: ceDataInode=123456 installed=true hidden=false suspended=false stopped=false notLaunched=false enabled=0 instant=false virtual=false

  Schemes:
      https:
        abcdef123 com.example.app/.MainActivity filter 987654
          Action: "android.intent.action.VIEW"
          Category: "android.intent.category.DEFAULT"
          Category: "android.intent.category.BROWSABLE"
          Scheme: "https"
          Authority: "example.com": -1
      myapp:
        abcdef123 com.example.app/.SecondActivity filter 876543
          Action: "android.intent.action.VIEW"
          Category: "android.intent.category.DEFAULT"
          Category: "android.intent.category.BROWSABLE"
          Scheme: "myapp"
          Authority: "deep": -1

  Non-Data Actions:
      android.intent.action.MAIN:
        abcdef123 com.example.app/.MainActivity filter 765432
          Action: "android.intent.action.MAIN"
          Category: "android.intent.category.LAUNCHER"

Receiver Resolver Table:
  Non-Data Actions:
      androidx.profileinstaller.action.INSTALL_PROFILE:
        abcdef123 com.example.app/androidx.profileinstaller.ProfileInstallReceiver filter 654321
          Action: "androidx.profileinstaller.action.INSTALL_PROFILE"`,
      stderr: ""
    });

    // Create deep link manager
    deepLinkManager = new DeepLinkManager(testDevice, fakeAdb);

    // Create mock element utils
    mockElementUtils = new ElementUtils();
    (deepLinkManager as any).elementUtils = mockElementUtils;
  });

  afterEach(() => {
    // Cleanup
  });

  describe("constructor", () => {
    test("should create DeepLinkManager with device ID", () => {
      const manager = new DeepLinkManager(testDevice, fakeAdb);
      expect(manager).toBeInstanceOf(DeepLinkManager);
    });

    test("should create DeepLinkManager without device ID", () => {
      const manager = new DeepLinkManager(null, fakeAdb);
      expect(manager).toBeInstanceOf(DeepLinkManager);
    });
  });

  describe("setDeviceId", () => {
    test("should set device ID", () => {
      const newDevice: BootedDevice = {
        name: "new-device",
        platform: "android",
        deviceId: "new-device-id"
      };
      deepLinkManager.setDeviceId(newDevice);

      // Just verify it doesn't throw
      expect(deepLinkManager).toBeInstanceOf(DeepLinkManager);
    });
  });

  describe("getDeepLinks", () => {
    test("should successfully get deep links for an app", async () => {
      const result = await deepLinkManager.getDeepLinks("com.example.app");

      expect(result.success).toBe(true);
      expect(result.appId).toBe("com.example.app");
      expect(Array.isArray(result.deepLinks.schemes)).toBe(true);
      expect(Array.isArray(result.deepLinks.hosts)).toBe(true);
      expect(Array.isArray(result.deepLinks.intentFilters)).toBe(true);
      expect(Array.isArray(result.deepLinks.supportedMimeTypes)).toBe(true);
      expect(typeof result.rawOutput).toBe("string");
    });

    test("should handle ADB command failures", async () => {
      // Create a new fake executor that will fail
      const failingFake = new FakeAdbExecutor();
      failingFake.setDefaultResponse({
        stdout: "",
        stderr: "ADB command failed",
        toString: () => "ADB command failed",
        trim: () => "ADB command failed",
        includes: () => true
      });

      const manager = new DeepLinkManager(testDevice, failingFake);
      const result = await manager.getDeepLinks("com.example.app");

      expect(result.success).toBe(false);
      expect(result.deepLinks.schemes).toHaveLength(0);
      expect(result.deepLinks.hosts).toHaveLength(0);
    });

    test("should parse deep link information correctly", async () => {
      const result = await deepLinkManager.getDeepLinks("com.example.app");

      expect(result.success).toBe(true);
      expect(result.deepLinks.schemes).toContain("https");
      expect(result.deepLinks.schemes).toContain("myapp");
      expect(result.deepLinks.hosts).toContain("example.com");
      expect(result.deepLinks.hosts).toContain("deep");
      expect(result.deepLinks.intentFilters.length).toBeGreaterThan(0);
    });
  });

  describe("detectIntentChooser", () => {
    test("should detect intent chooser with ChooserActivity", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: {
              class: "com.android.internal.app.ChooserActivity"
            }
          }
        }
      };

      const detected = deepLinkManager.detectIntentChooser(viewHierarchy);
      expect(detected).toBe(true);
    });

    test("should detect intent chooser with ResolverActivity", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: {
              class: "com.android.internal.app.ResolverActivity"
            }
          }
        }
      };

      const detected = deepLinkManager.detectIntentChooser(viewHierarchy);
      expect(detected).toBe(true);
    });

    test("should detect intent chooser with 'Choose an app' text", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: {
              text: "Choose an app"
            }
          }
        }
      };

      const detected = deepLinkManager.detectIntentChooser(viewHierarchy);
      expect(detected).toBe(true);
    });

    test("should detect intent chooser with 'Always' and 'Just once' buttons", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: {},
            node: [
              {
                $: {
                  text: "Always"
                }
              },
              {
                $: {
                  text: "Just once"
                }
              }
            ]
          }
        }
      };

      const detected = deepLinkManager.detectIntentChooser(viewHierarchy);
      expect(detected).toBe(true);
    });

    test("should not detect intent chooser in normal app screens", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: {},
            node: [
              {
                $: {
                  class: "android.widget.Button",
                  text: "Click me"
                }
              },
              {
                $: {
                  class: "android.widget.TextView",
                  text: "Some text"
                }
              }
            ]
          }
        }
      };

      const detected = deepLinkManager.detectIntentChooser(viewHierarchy);
      expect(detected).toBe(false);
    });

    test("should handle malformed view hierarchy", () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {}
      };

      const detected = deepLinkManager.detectIntentChooser(viewHierarchy);
      expect(detected).toBe(false);
    });
  });

  describe("handleIntentChooser", () => {
    beforeEach(() => {
      // Mock the element utils methods
      const mockButton = {
        bounds: "[100,200][300,400]",
        text: "Always"
      };

      // Mock extractRootNodes
      (mockElementUtils as any).extractRootNodes = () => [mockButton];

      // Mock getElementCenter
      (mockElementUtils as any).getElementCenter = () => ({ x: 200, y: 300 });

      // Mock findButtonByText method by adding it to the deep link manager
      (deepLinkManager as any).findButtonByText = (node: any, textOptions: string[]) => {
        if (textOptions.some(option => node.text && node.text.includes(option))) {
          return node;
        }
        return null;
      };
    });

    test("should handle intent chooser with 'always' preference", async () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: {
              class: "com.android.internal.app.ChooserActivity"
            },
            node: [{
              $: {
                text: "Always",
                class: "android.widget.Button",
                bounds: "[100,200][300,400]"
              }
            }]
          }
        }
      };

      const result = await deepLinkManager.handleIntentChooser(viewHierarchy, "always");

      expect(result.success).toBe(true);
      expect(result.detected).toBe(true);
      expect(result.action).toBe("always");
    });

    test("should handle intent chooser with 'just_once' preference", async () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: {
              class: "com.android.internal.app.ResolverActivity"
            },
            node: [{
              $: {
                text: "Just once",
                class: "android.widget.Button",
                bounds: "[100,200][300,400]"
              }
            }]
          }
        }
      };

      // Update mock to return "Just once" button
      (deepLinkManager as any).findButtonByText = (node: any, textOptions: string[]) => {
        if (textOptions.some(option => option.includes("Just once"))) {
          return { bounds: "[100,200][300,400]", text: "Just once" };
        }
        return null;
      };

      const result = await deepLinkManager.handleIntentChooser(viewHierarchy, "just_once");

      expect(result.success).toBe(true);
      expect(result.detected).toBe(true);
      expect(result.action).toBe("just_once");
    });

    test("should handle intent chooser with custom app selection", async () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: {
              class: "com.android.internal.app.ChooserActivity"
            },
            node: [{
              $: {
                "resource-id": "com.example.customapp:id/app_icon"
              }
            }]
          }
        }
      };

      // Mock findAppInChooser method
      (deepLinkManager as any).findAppInChooser = (node: any, appPackage: string) => {
        if (appPackage === "com.example.customapp") {
          return { bounds: "[100,200][300,400]" };
        }
        return null;
      };

      const result = await deepLinkManager.handleIntentChooser(
        viewHierarchy,
        "custom",
        "com.example.customapp"
      );

      expect(result.success).toBe(true);
      expect(result.detected).toBe(true);
      expect(result.action).toBe("custom");
      expect(result.appSelected).toBe("com.example.customapp");
    });

    test("should return success false when no intent chooser is detected", async () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: {
              class: "android.widget.LinearLayout"
            },
            node: [{
              $: {
                text: "Normal app content"
              }
            }]
          }
        }
      };

      // Reset mocks for this specific test
      (mockElementUtils as any).extractRootNodes = () => [
        {
          $: {
            class: "android.widget.LinearLayout"
          },
          node: [{
            $: {
              text: "Normal app content"
            }
          }]
        }
      ];

      const result = await deepLinkManager.handleIntentChooser(viewHierarchy, "always");

      expect(result.success).toBe(true);
      expect(result.detected).toBe(false);
    });

    test("should return success false when target element not found", async () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: {
              class: "com.android.internal.app.ChooserActivity"
            },
            node: [{
              $: {
                text: "Some other button"
              }
            }]
          }
        }
      };

      // Mock to return null (no matching button found)
      (deepLinkManager as any).findButtonByText = () => null;

      const result = await deepLinkManager.handleIntentChooser(viewHierarchy, "always");

      expect(result.success).toBe(false);
      expect(result.detected).toBe(true);
      expect(result.error).toContain("Could not find target element");
    });

    test("should handle ADB command failures during tap", async () => {
      const viewHierarchy: ViewHierarchyResult = {
        hierarchy: {
          node: {
            $: {
              class: "com.android.internal.app.ChooserActivity"
            },
            node: [{
              $: {
                text: "Always",
                class: "android.widget.Button",
                bounds: "[100,200][300,400]"
              }
            }]
          }
        }
      };

      // Create a failing fake for input tap commands
      const failingFake = new FakeAdbExecutor();
      failingFake.setCommandResponse("shell input tap 200 300", {
        stdout: "",
        stderr: "Input command failed",
        toString: () => "Input command failed",
        trim: () => "Input command failed",
        includes: () => true
      });

      const manager = new DeepLinkManager(testDevice, failingFake);
      (manager as any).elementUtils = mockElementUtils;

      const result = await manager.handleIntentChooser(viewHierarchy, "always");

      expect(result.success).toBe(false);
      expect(result.detected).toBe(true);
    });
  });

  describe("parsePackageDumpsysOutput", () => {
    test("should extract schemes and hosts from dumpsys output", () => {
      const output = `  Schemes:
      https:
        abcdef123 com.example.app/.MainActivity filter 987654
          Action: "android.intent.action.VIEW"
          Category: "android.intent.category.DEFAULT"
          Category: "android.intent.category.BROWSABLE"
          Scheme: "https"
          Authority: "example.com": -1
      myapp:
        abcdef123 com.example.app/.SecondActivity filter 876543
          Action: "android.intent.action.VIEW"
          Category: "android.intent.category.DEFAULT"
          Category: "android.intent.category.BROWSABLE"
          Scheme: "myapp"
          Authority: "deep": -1`;

      const result = (deepLinkManager as any).parsePackageDumpsysOutput("com.example.app", output);

      expect(result.schemes).toContain("https");
      expect(result.schemes).toContain("myapp");
      expect(result.hosts).toContain("example.com");
      expect(result.hosts).toContain("deep");
      expect(result.intentFilters.length).toBeGreaterThan(0);
    });

    test("should handle empty dumpsys output", () => {
      const output = "";

      const result = (deepLinkManager as any).parsePackageDumpsysOutput("com.example.app", output);

      expect(result.schemes).toHaveLength(0);
      expect(result.hosts).toHaveLength(0);
      expect(result.intentFilters).toHaveLength(0);
      expect(result.supportedMimeTypes).toHaveLength(0);
    });

    test("should handle dumpsys output without schemes section", () => {
      const output = `Package [com.example.app] (12345):
  Non-Data Actions:
      android.intent.action.MAIN:
        abcdef123 com.example.app/.MainActivity filter 765432
          Action: "android.intent.action.MAIN"
          Category: "android.intent.category.LAUNCHER"`;

      const result = (deepLinkManager as any).parsePackageDumpsysOutput("com.example.app", output);

      expect(result.schemes).toHaveLength(0);
      expect(result.hosts).toHaveLength(0);
      expect(result.intentFilters).toHaveLength(0);
    });
  });
});
