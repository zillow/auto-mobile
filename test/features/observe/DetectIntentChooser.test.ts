import { expect } from "chai";
import { DetectIntentChooser } from "../../../src/features/observe/DetectIntentChooser";
import { DeepLinkManager } from "../../../src/utils/deepLinkManager";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { ObserveResult } from "../../../src/models";

describe("DetectIntentChooser", () => {
  let detectIntentChooser: DetectIntentChooser;
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

  beforeEach(() => {
    // Create DetectIntentChooser instance
    detectIntentChooser = new DetectIntentChooser("test-device");

    // Create mock DeepLinkManager
    mockDeepLinkManager = {
      detectIntentChooser: (viewHierarchy: string) => {
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

        return indicators.some(indicator =>
          viewHierarchy.toLowerCase().includes(indicator.toLowerCase())
        );
      }
    } as any;

    // Create mock ObserveScreen
    mockObserveScreen = {
      execute: async () => mockObserveResult
    } as any;

    // Replace the internal managers with our mocks
    (detectIntentChooser as any).deepLinkManager = mockDeepLinkManager;
    (detectIntentChooser as any).observeScreen = mockObserveScreen;
  });

  describe("constructor", () => {
    it("should create DetectIntentChooser with device ID", () => {
      const instance = new DetectIntentChooser("test-device");
      expect(instance).to.be.instanceOf(DetectIntentChooser);
    });
  });

  describe("execute", () => {
    it("should detect intent chooser when provided with view hierarchy", async () => {
      const viewHierarchy = `
        <hierarchy>
          <node class="com.android.internal.app.ChooserActivity">
            <node text="Choose an app" />
          </node>
        </hierarchy>
      `;

      const result = await detectIntentChooser.execute(viewHierarchy);

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.observation).to.be.null;
    });

    it("should not detect intent chooser in normal app view hierarchy", async () => {
      const viewHierarchy = `
        <hierarchy>
          <node class="android.widget.LinearLayout">
            <node text="Normal app content" />
          </node>
        </hierarchy>
      `;

      const result = await detectIntentChooser.execute(viewHierarchy);

      expect(result.success).to.be.true;
      expect(result.detected).to.be.false;
      expect(result.observation).to.be.null;
    });

    it("should observe screen when no view hierarchy provided", async () => {
      const result = await detectIntentChooser.execute();

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true; // mockObserveResult contains ChooserActivity
      expect(result.observation).to.equal(mockObserveResult);
    });

    it("should handle observe screen failure", async () => {
      // Mock observe screen to fail
      mockObserveScreen.execute = async () => {
        throw new Error("Failed to observe screen");
      };

      const result = await detectIntentChooser.execute();

      expect(result.success).to.be.false;
      expect(result.detected).to.be.false;
      expect(result.error).to.include("Failed to observe screen");
    });

    it("should handle observe screen returning null view hierarchy", async () => {
      // Mock observe screen to return result without view hierarchy
      mockObserveScreen.execute = async () => ({
        timestamp: "2025-01-01T00:00:00.000Z",
        screenSize: { width: 1080, height: 1920 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      });

      const result = await detectIntentChooser.execute();

      expect(result.success).to.be.false;
      expect(result.detected).to.be.false;
      expect(result.error).to.include("Could not get view hierarchy");
    });

    it("should handle deep link manager detection failure", async () => {
      // Mock deep link manager to throw error
      mockDeepLinkManager.detectIntentChooser = () => {
        throw new Error("Detection failed");
      };

      const viewHierarchy = `
        <hierarchy>
          <node class="com.android.internal.app.ChooserActivity" />
        </hierarchy>
      `;

      const result = await detectIntentChooser.execute(viewHierarchy);

      expect(result.success).to.be.false;
      expect(result.detected).to.be.false;
      expect(result.error).to.include("Detection failed");
    });

    it("should detect various intent chooser indicators", async () => {
      const testCases = [
        '<hierarchy><node class="com.android.internal.app.ChooserActivity" /></hierarchy>',
        '<hierarchy><node class="com.android.internal.app.ResolverActivity" /></hierarchy>',
        '<hierarchy><node text="Choose an app" /></hierarchy>',
        '<hierarchy><node text="Open with" /></hierarchy>',
        '<hierarchy><node text="Always" /><node text="Just once" /></hierarchy>'
      ];

      for (const viewHierarchy of testCases) {
        const result = await detectIntentChooser.execute(viewHierarchy);
        expect(result.success).to.be.true;
        expect(result.detected).to.be.true;
      }
    });

    it("should not detect intent chooser in non-chooser screens", async () => {
      const testCases = [
        '<hierarchy><node class="android.widget.Button" text="Click me" /></hierarchy>',
        '<hierarchy><node text="Welcome to the app" /></hierarchy>',
        '<hierarchy><node class="com.example.MainActivity" /></hierarchy>'
      ];

      for (const viewHierarchy of testCases) {
        const result = await detectIntentChooser.execute(viewHierarchy);
        expect(result.success).to.be.true;
        expect(result.detected).to.be.false;
      }
    });
  });
});
