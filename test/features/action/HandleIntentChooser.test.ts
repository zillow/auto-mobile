import { expect } from "chai";
import { HandleIntentChooser } from "../../../src/features/action/HandleIntentChooser";
import { DeepLinkManager } from "../../../src/utils/deepLinkManager";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { Window } from "../../../src/features/observe/Window";
import { AwaitIdle } from "../../../src/features/observe/AwaitIdle";
import { IntentChooserResult, ObserveResult, ViewHierarchyResult } from "../../../src/models";
import sinon from "sinon";

describe("HandleIntentChooser", () => {
  let handleIntentChooser: HandleIntentChooser;
  let mockDeepLinkManager: DeepLinkManager;
  let mockObserveScreen: sinon.SinonStubbedInstance<ObserveScreen>;
  let mockWindow: sinon.SinonStubbedInstance<Window>;
  let mockAwaitIdle: sinon.SinonStubbedInstance<AwaitIdle>;

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

  const mockUpdatedObserveResult: ObserveResult = {
    ...mockObserveResult,
    timestamp: "2025-01-01T00:00:00.001Z",
    viewHierarchy: {
      hierarchy: {
        node: {
          $: {
            class: "com.example.MainActivity"
          },
          node: [
            {
              $: {
                text: "App content after chooser"
              }
            }
          ]
        }
      }
    } as ViewHierarchyResult
  };

  beforeEach(() => {
    // Create stubs for dependencies
    mockObserveScreen = sinon.createStubInstance(ObserveScreen);
    mockWindow = sinon.createStubInstance(Window);
    mockAwaitIdle = sinon.createStubInstance(AwaitIdle);

    // Stub the constructors
    sinon.stub(ObserveScreen.prototype, "execute").callsFake(mockObserveScreen.execute);
    sinon.stub(ObserveScreen.prototype, "getMostRecentCachedObserveResult").callsFake(mockObserveScreen.getMostRecentCachedObserveResult);
    sinon.stub(Window.prototype, "getCachedActiveWindow").callsFake(mockWindow.getCachedActiveWindow);
    sinon.stub(Window.prototype, "getActive").callsFake(mockWindow.getActive);
    sinon.stub(AwaitIdle.prototype, "initializeUiStabilityTracking").callsFake(mockAwaitIdle.initializeUiStabilityTracking);
    sinon.stub(AwaitIdle.prototype, "waitForUiStability").callsFake(mockAwaitIdle.waitForUiStability);
    sinon.stub(AwaitIdle.prototype, "waitForUiStabilityWithState").callsFake(mockAwaitIdle.waitForUiStabilityWithState);

    // Set up default mock responses
    mockWindow.getCachedActiveWindow.resolves(null);
    mockWindow.getActive.resolves({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });
    mockAwaitIdle.initializeUiStabilityTracking.resolves();
    mockAwaitIdle.waitForUiStability.resolves();
    mockAwaitIdle.waitForUiStabilityWithState.resolves();
    mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockObserveResult);
    mockObserveScreen.execute.resolves(mockUpdatedObserveResult);

    // Create HandleIntentChooser instance
    handleIntentChooser = new HandleIntentChooser("test-device");

    // Create mock DeepLinkManager
    mockDeepLinkManager = {
      handleIntentChooser: async (viewHierarchy: ViewHierarchyResult, preference: string, customAppPackage?: string): Promise<IntentChooserResult> => {
        // Look for common intent chooser indicators
        const indicators = [
          "com.android.internal.app.ChooserActivity",
          "com.android.internal.app.ResolverActivity",
          "Choose an app",
          "Open with",
          "Complete action using",
          "Always",
          "Just once",
          "android:id/button_always",
          "android:id/button_once",
          "resolver_list",
          "chooser_list"
        ];

        const viewHierarchyString = JSON.stringify(viewHierarchy);
        const detected = indicators.some(indicator =>
          viewHierarchyString.toLowerCase().includes(indicator.toLowerCase())
        );

        if (!detected) {
          return { success: true, detected: false };
        }

        // Simulate successful handling
        return {
          success: true,
          detected: true,
          action: preference as any,
          appSelected: customAppPackage
        };
      }
    } as any;

    // Replace the internal managers with our mocks
    (handleIntentChooser as any).deepLinkManager = mockDeepLinkManager;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("constructor", () => {
    it("should create HandleIntentChooser with device ID", () => {
      const instance = new HandleIntentChooser("test-device");
      expect(instance).to.be.instanceOf(HandleIntentChooser);
    });
  });

  describe("execute", () => {
    it("should handle intent chooser with 'always' preference", async () => {
      // The test will use the default mockObserveResult which contains ChooserActivity
      const result = await handleIntentChooser.execute("always");

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("always");
      expect(result.appSelected).to.be.undefined;
      expect(result.observation).to.equal(mockUpdatedObserveResult);
    });

    it("should handle intent chooser with 'just_once' preference", async () => {
      // Update the mock to return ResolverActivity hierarchy
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

      mockObserveScreen.getMostRecentCachedObserveResult.resolves({
        ...mockObserveResult,
        viewHierarchy: resolverHierarchy
      });

      const result = await handleIntentChooser.execute("just_once");

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("just_once");
      expect(result.appSelected).to.be.undefined;
      expect(result.observation).to.equal(mockUpdatedObserveResult);
    });

    it("should handle intent chooser with custom app selection", async () => {
      // Update the mock to return custom app hierarchy
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

      mockObserveScreen.getMostRecentCachedObserveResult.resolves({
        ...mockObserveResult,
        viewHierarchy: customHierarchy
      });

      const result = await handleIntentChooser.execute("custom", "com.example.customapp");

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("custom");
      expect(result.appSelected).to.equal("com.example.customapp");
      expect(result.observation).to.equal(mockUpdatedObserveResult);
    });

    it("should use default 'just_once' preference when none specified", async () => {
      const result = await handleIntentChooser.execute();

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("just_once");
    });

    it("should observe screen when no view hierarchy provided", async () => {
      // Create a new mock for this specific test
      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockObserveResult);
      mockObserveScreen.execute.resolves(mockUpdatedObserveResult);

      const result = await handleIntentChooser.execute("always");

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("always");
      expect(result.observation).to.equal(mockUpdatedObserveResult);
    });

    it("should handle no intent chooser detected", async () => {
      // Update mock to return hierarchy without intent chooser
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

      mockObserveScreen.getMostRecentCachedObserveResult.resolves({
        ...mockObserveResult,
        viewHierarchy: normalHierarchy
      });

      const result = await handleIntentChooser.execute("always");

      expect(result.success).to.be.true;
      expect(result.detected).to.be.false;
      expect(result.observation).to.be.not.null;
    });

    it("should handle observe screen failure", async () => {
      // Mock observe screen to fail only when called for updated observation
      let callCount = 0;
      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockObserveResult);
      mockObserveScreen.execute.callsFake(async () => {
        callCount++;
        if (callCount === 1) {
          // First call when no viewHierarchy provided - should succeed
          return mockObserveResult;
        } else {
          // Second call for updated observation - should fail
          throw new Error("Failed to observe screen");
        }
      });

      const result = await handleIntentChooser.execute("always");

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("always");
      expect(result.observation).to.equal(mockObserveResult); // Should fall back to original
    });

    it("should handle observe screen returning null view hierarchy", async () => {
      // Mock getMostRecentCachedObserveResult to fail
      mockObserveScreen.getMostRecentCachedObserveResult.rejects(new Error("Cannot perform action without view hierarchy"));
      // Also mock execute to fail since BaseVisualChange falls back to execute()
      mockObserveScreen.execute.rejects(new Error("Cannot perform action without view hierarchy"));

      try {
        await handleIntentChooser.execute("always");
        expect.fail("Expected an error to be thrown");
      } catch (error) {
        expect((error as Error).message).to.include("Cannot perform action without view hierarchy");
      }
    });

    it("should handle deep link manager failure", async () => {
      // Mock deep link manager to fail
      mockDeepLinkManager.handleIntentChooser = async () => {
        throw new Error("Handling failed");
      };

      try {
        await handleIntentChooser.execute("always");
        expect.fail("Expected an error to be thrown");
      } catch (error) {
        expect((error as Error).message).to.include("Handling failed");
      }
    });

    it("should handle deep link manager returning failure", async () => {
      // Mock deep link manager to return failure
      mockDeepLinkManager.handleIntentChooser = async () => ({
        success: false,
        detected: true,
        error: "Could not find target element"
      });

      const result = await handleIntentChooser.execute("always");

      expect(result.success).to.be.false;
      expect(result.detected).to.be.true;
      expect(result.error).to.equal("Could not find target element");
      expect(result.observation).to.equal(mockUpdatedObserveResult);
    });

    it("should preserve original observation when handling unsuccessful", async () => {
      // Mock deep link manager to return unsuccessful but detected result
      mockDeepLinkManager.handleIntentChooser = async () => ({
        success: false,
        detected: true,
        error: "Target element not found"
      });

      const result = await handleIntentChooser.execute("always");

      expect(result.success).to.be.false;
      expect(result.detected).to.be.true;
      expect(result.error).to.equal("Target element not found");
      expect(result.observation).to.equal(mockUpdatedObserveResult);
    });
  });
});
