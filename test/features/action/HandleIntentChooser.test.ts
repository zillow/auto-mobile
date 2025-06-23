import { expect } from "chai";
import { HandleIntentChooser } from "../../../src/features/action/HandleIntentChooser";
import { DeepLinkManager } from "../../../src/utils/deepLinkManager";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { IntentChooserResult, ObserveResult } from "../../../src/models";

describe("HandleIntentChooser", () => {
  let handleIntentChooser: HandleIntentChooser;
  let mockDeepLinkManager: DeepLinkManager;
  let mockObserveScreen: ObserveScreen;

  const mockObserveResult: ObserveResult = {
    timestamp: "2025-01-01T00:00:00.000Z",
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    viewHierarchy: `
      <hierarchy>
        <node class="com.android.internal.app.ChooserActivity">
          <node text="Choose an app" />
          <node text="Always" class="android.widget.Button" />
          <node text="Just once" class="android.widget.Button" />
        </node>
      </hierarchy>
    `
  };

  const mockUpdatedObserveResult: ObserveResult = {
    ...mockObserveResult,
    timestamp: "2025-01-01T00:00:00.001Z",
    viewHierarchy: `
      <hierarchy>
        <node class="com.example.MainActivity">
          <node text="App content after chooser" />
        </node>
      </hierarchy>
    `
  };

  beforeEach(() => {
    // Create HandleIntentChooser instance
    handleIntentChooser = new HandleIntentChooser("test-device");

    // Create mock DeepLinkManager
    mockDeepLinkManager = {
      handleIntentChooser: async (viewHierarchy: string, preference: string, customAppPackage?: string): Promise<IntentChooserResult> => {
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

        const detected = indicators.some(indicator =>
          viewHierarchy.toLowerCase().includes(indicator.toLowerCase())
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

    // Create mock ObserveScreen that always returns the updated result
    mockObserveScreen = {
      execute: async () => mockUpdatedObserveResult
    } as any;

    // Replace the internal managers with our mocks
    (handleIntentChooser as any).deepLinkManager = mockDeepLinkManager;
    (handleIntentChooser as any).observeScreen = mockObserveScreen;
  });

  describe("constructor", () => {
    it("should create HandleIntentChooser with device ID", () => {
      const instance = new HandleIntentChooser("test-device");
      expect(instance).to.be.instanceOf(HandleIntentChooser);
    });

    it("should create HandleIntentChooser without device ID", () => {
      const instance = new HandleIntentChooser();
      expect(instance).to.be.instanceOf(HandleIntentChooser);
    });
  });

  describe("execute", () => {
    it("should handle intent chooser with 'always' preference", async () => {
      const viewHierarchy = `
        <hierarchy>
          <node class="com.android.internal.app.ChooserActivity">
            <node text="Always" class="android.widget.Button" />
          </node>
        </hierarchy>
      `;

      const result = await handleIntentChooser.execute("always", undefined, viewHierarchy);

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("always");
      expect(result.appSelected).to.be.undefined;
      expect(result.observation).to.equal(mockUpdatedObserveResult);
    });

    it("should handle intent chooser with 'just_once' preference", async () => {
      const viewHierarchy = `
        <hierarchy>
          <node class="com.android.internal.app.ResolverActivity">
            <node text="Just once" class="android.widget.Button" />
          </node>
        </hierarchy>
      `;

      const result = await handleIntentChooser.execute("just_once", undefined, viewHierarchy);

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("just_once");
      expect(result.appSelected).to.be.undefined;
      expect(result.observation).to.equal(mockUpdatedObserveResult);
    });

    it("should handle intent chooser with custom app selection", async () => {
      const viewHierarchy = `
        <hierarchy>
          <node class="com.android.internal.app.ChooserActivity">
            <node resource-id="com.example.customapp:id/app_icon" />
          </node>
        </hierarchy>
      `;

      const result = await handleIntentChooser.execute("custom", "com.example.customapp", viewHierarchy);

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("custom");
      expect(result.appSelected).to.equal("com.example.customapp");
      expect(result.observation).to.equal(mockUpdatedObserveResult);
    });

    it("should use default 'just_once' preference when none specified", async () => {
      const viewHierarchy = `
        <hierarchy>
          <node class="com.android.internal.app.ChooserActivity" />
        </hierarchy>
      `;

      const result = await handleIntentChooser.execute(undefined, undefined, viewHierarchy);

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("just_once");
    });

    it("should observe screen when no view hierarchy provided", async () => {
      // Create a new mock for this specific test
      let callCount = 0;
      mockObserveScreen.execute = async () => {
        callCount++;
        // First call should return the initial observation with chooser
        // Second call should return updated observation
        return callCount === 1 ? mockObserveResult : mockUpdatedObserveResult;
      };

      const result = await handleIntentChooser.execute("always");

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("always");
      expect(result.observation).to.equal(mockUpdatedObserveResult);
    });

    it("should handle no intent chooser detected", async () => {
      const viewHierarchy = `
        <hierarchy>
          <node class="android.widget.LinearLayout">
            <node text="Normal app content" />
          </node>
        </hierarchy>
      `;

      const result = await handleIntentChooser.execute("always", undefined, viewHierarchy);

      expect(result.success).to.be.true;
      expect(result.detected).to.be.false;
      expect(result.observation).to.be.null;
    });

    it("should handle observe screen failure", async () => {
      // Mock observe screen to fail only when called for updated observation
      let callCount = 0;
      mockObserveScreen.execute = async () => {
        callCount++;
        if (callCount === 1) {
          // First call when no viewHierarchy provided - should succeed
          return mockObserveResult;
        } else {
          // Second call for updated observation - should fail
          throw new Error("Failed to observe screen");
        }
      };

      const result = await handleIntentChooser.execute("always");

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.action).to.equal("always");
      expect(result.observation).to.equal(mockObserveResult); // Should fall back to original
    });

    it("should handle observe screen returning null view hierarchy", async () => {
      // Mock observe screen to return result without view hierarchy
      mockObserveScreen.execute = async () => ({
        timestamp: "2025-01-01T00:00:00.000Z",
        screenSize: { width: 1080, height: 1920 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      });

      const result = await handleIntentChooser.execute("always");

      expect(result.success).to.be.false;
      expect(result.detected).to.be.false;
      expect(result.error).to.include("Could not get view hierarchy");
    });

    it("should handle deep link manager failure", async () => {
      // Mock deep link manager to fail
      mockDeepLinkManager.handleIntentChooser = async () => {
        throw new Error("Handling failed");
      };

      const viewHierarchy = `
        <hierarchy>
          <node class="com.android.internal.app.ChooserActivity" />
        </hierarchy>
      `;

      const result = await handleIntentChooser.execute("always", undefined, viewHierarchy);

      expect(result.success).to.be.false;
      expect(result.detected).to.be.false;
      expect(result.error).to.include("Handling failed");
    });

    it("should handle deep link manager returning failure", async () => {
      // Mock deep link manager to return failure
      mockDeepLinkManager.handleIntentChooser = async () => ({
        success: false,
        detected: true,
        error: "Could not find target element"
      });

      const viewHierarchy = `
        <hierarchy>
          <node class="com.android.internal.app.ChooserActivity" />
        </hierarchy>
      `;

      const result = await handleIntentChooser.execute("always", undefined, viewHierarchy);

      expect(result.success).to.be.false;
      expect(result.detected).to.be.true;
      expect(result.error).to.equal("Could not find target element");
      expect(result.observation).to.be.null; // Should be null when viewHierarchy provided directly
    });

    it("should preserve original observation when handling unsuccessful", async () => {
      // Mock deep link manager to return unsuccessful but detected result
      mockDeepLinkManager.handleIntentChooser = async () => ({
        success: false,
        detected: true,
        error: "Target element not found"
      });

      const viewHierarchy = `
        <hierarchy>
          <node class="com.android.internal.app.ChooserActivity" />
        </hierarchy>
    `;

      const result = await handleIntentChooser.execute("always", undefined, viewHierarchy);

      expect(result.success).to.be.false;
      expect(result.detected).to.be.true;
      expect(result.error).to.equal("Target element not found");
      expect(result.observation).to.be.null; // Should be null when viewHierarchy provided directly
    });
  });
});
