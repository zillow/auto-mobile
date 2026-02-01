import { expect, describe, test, beforeEach } from "bun:test";
import { HandleIntentChooser } from "../../../src/features/action/HandleIntentChooser";
import { ObserveResult, ViewHierarchyResult } from "../../../src/models";
import { FakeDeepLinkManager } from "../../fakes/FakeDeepLinkManager";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeWindow } from "../../fakes/FakeWindow";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";

describe("HandleIntentChooser", () => {
  let handleIntentChooser: HandleIntentChooser;
  let fakeDeepLinkManager: FakeDeepLinkManager;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeWindow: FakeWindow;
  let fakeAwaitIdle: FakeAwaitIdle;

  const mockObserveResult: ObserveResult = {
    timestamp: "2025-01-01T00:00:00.000Z",
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    viewHierarchy: {
      hierarchy: {
        node: {
          $: {
            class: "com.android.internal.app.ChooserActivity"
          },
          node: [
            {
              $: {
                text: "Choose an app"
              }
            },
            {
              $: {
                text: "Always",
                class: "android.widget.Button"
              }
            },
            {
              $: {
                text: "Just once",
                class: "android.widget.Button"
              }
            }
          ]
        }
      }
    } as ViewHierarchyResult
  };

  beforeEach(() => {
    // Create fakes for dependencies
    fakeDeepLinkManager = new FakeDeepLinkManager();
    fakeObserveScreen = new FakeObserveScreen();
    fakeWindow = new FakeWindow();
    fakeAwaitIdle = new FakeAwaitIdle();

    // Set up default fake responses
    fakeWindow.configureCachedActiveWindow(null);
    fakeWindow.configureActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });
    fakeObserveScreen.setObserveResult(mockObserveResult);

    // Set default intent chooser to detected
    fakeDeepLinkManager.setDefaultIntentChooserDetected(true);

    // Create HandleIntentChooser instance
    handleIntentChooser = new HandleIntentChooser("test-device");

    // Replace the internal managers with our fakes
    (handleIntentChooser as any).deepLinkManager = fakeDeepLinkManager;
    (handleIntentChooser as any).observeScreen = fakeObserveScreen;
    (handleIntentChooser as any).window = fakeWindow;
    (handleIntentChooser as any).awaitIdle = fakeAwaitIdle;
  });

  describe("constructor", () => {
    test("should create HandleIntentChooser with device ID", () => {
      const instance = new HandleIntentChooser("test-device");
      expect(instance).toBeInstanceOf(HandleIntentChooser);
    });
  });

  describe("execute", () => {
    test("should handle intent chooser with 'always' preference", async () => {
      // Set up fake to return detected intent chooser
      fakeObserveScreen.setObserveResult(mockObserveResult);
      fakeDeepLinkManager.setDefaultIntentChooserDetected(true);
      fakeDeepLinkManager.setIntentChooserResponse("always:none", {
        success: true,
        detected: true,
        action: "always"
      });

      const result = await handleIntentChooser.execute("always");

      expect(result.success).toBe(true);
      expect(result.detected).toBe(true);
      expect(result.action).toBe("always");
      expect(result.appSelected).toBeUndefined();
    });

    test("should handle intent chooser with 'just_once' preference", async () => {
      const resolverHierarchy = {
        hierarchy: {
          node: {
            $: {
              class: "com.android.internal.app.ResolverActivity"
            },
            node: [
              {
                $: {
                  text: "Just once",
                  class: "android.widget.Button"
                }
              }
            ]
          }
        }
      } as ViewHierarchyResult;

      fakeObserveScreen.setObserveResult({
        ...mockObserveResult,
        viewHierarchy: resolverHierarchy
      });
      fakeDeepLinkManager.setDefaultIntentChooserDetected(true);

      const result = await handleIntentChooser.execute("just_once");

      expect(result.success).toBe(true);
      expect(result.detected).toBe(true);
      expect(result.action).toBe("just_once");
      expect(result.appSelected).toBeUndefined();
    });

    test("should handle intent chooser with custom app selection", async () => {
      const customHierarchy = {
        hierarchy: {
          node: {
            $: {
              class: "com.android.internal.app.ChooserActivity"
            },
            node: [
              {
                $: {
                  "resource-id": "com.example.customapp:id/app_icon"
                }
              }
            ]
          }
        }
      } as ViewHierarchyResult;

      fakeObserveScreen.setObserveResult({
        ...mockObserveResult,
        viewHierarchy: customHierarchy
      });
      fakeDeepLinkManager.setDefaultIntentChooserDetected(true);
      fakeDeepLinkManager.setIntentChooserResponse("custom:com.example.customapp", {
        success: true,
        detected: true,
        action: "custom",
        appSelected: "com.example.customapp"
      });

      const result = await handleIntentChooser.execute("custom", "com.example.customapp");

      expect(result.success).toBe(true);
      expect(result.detected).toBe(true);
      expect(result.action).toBe("custom");
      expect(result.appSelected).toBe("com.example.customapp");
    });

    test("should use default 'just_once' preference when none specified", async () => {
      fakeObserveScreen.setObserveResult(mockObserveResult);
      fakeDeepLinkManager.setDefaultIntentChooserDetected(true);

      const result = await handleIntentChooser.execute();

      expect(result.success).toBe(true);
      expect(result.detected).toBe(true);
      expect(result.action).toBe("just_once");
    });

    test("should observe screen when no view hierarchy provided", async () => {
      fakeObserveScreen.setObserveResult(mockObserveResult);
      fakeDeepLinkManager.setDefaultIntentChooserDetected(true);

      const result = await handleIntentChooser.execute("always");

      expect(result.success).toBe(true);
      expect(result.detected).toBe(true);
      expect(result.action).toBe("always");
      expect(result.observation).not.toBeNull();
    });

    test("should handle no intent chooser detected", async () => {
      const normalHierarchy = {
        hierarchy: {
          node: {
            $: {
              class: "android.widget.LinearLayout"
            },
            node: [
              {
                $: {
                  text: "Normal app content"
                }
              }
            ]
          }
        }
      } as ViewHierarchyResult;

      fakeObserveScreen.setObserveResult({
        ...mockObserveResult,
        viewHierarchy: normalHierarchy
      });
      // Set detected to false
      fakeDeepLinkManager.setDefaultIntentChooserDetected(false);

      const result = await handleIntentChooser.execute("always");

      expect(result.success).toBe(true);
      expect(result.detected).toBe(false);
      expect(result.observation).not.toBeNull();
    });

    test("should handle observe screen failure", async () => {
      fakeObserveScreen.setFailureMode("getMostRecentCachedObserveResult", new Error("Cannot perform action without view hierarchy"));
      fakeObserveScreen.setFailureMode("execute", new Error("Cannot perform action without view hierarchy"));

      try {
        await handleIntentChooser.execute("always");
        expect.fail("Expected an error to be thrown");
      } catch (error) {
        expect((error as Error).message).toContain("Cannot perform action without view hierarchy");
      }
    });

    test("should handle deep link manager failure", async () => {
      fakeObserveScreen.setObserveResult(mockObserveResult);
      fakeDeepLinkManager.setIntentChooserResponse("always:none", {
        success: false,
        detected: true,
        error: "Handling failed"
      });

      const result = await handleIntentChooser.execute("always");

      expect(result.success).toBe(false);
      expect(result.detected).toBe(true);
      expect(result.error).toBe("Handling failed");
    });

    test("should handle deep link manager returning failure", async () => {
      fakeObserveScreen.setObserveResult(mockObserveResult);
      fakeDeepLinkManager.setIntentChooserResponse("always:none", {
        success: false,
        detected: true,
        error: "Could not find target element"
      });

      const result = await handleIntentChooser.execute("always");

      expect(result.success).toBe(false);
      expect(result.detected).toBe(true);
      expect(result.error).toBe("Could not find target element");
    });

    test("should preserve original observation when handling unsuccessful", async () => {
      fakeObserveScreen.setObserveResult(mockObserveResult);
      fakeDeepLinkManager.setIntentChooserResponse("always:none", {
        success: false,
        detected: true,
        error: "Target element not found"
      });

      const result = await handleIntentChooser.execute("always");

      expect(result.success).toBe(false);
      expect(result.detected).toBe(true);
      expect(result.error).toBe("Target element not found");
      expect(result.observation).not.toBeNull();
    });
  });
});
