import { expect } from "chai";
import { DetectIntentChooser } from "../../../src/features/observe/DetectIntentChooser";
import { DeepLinkManager } from "../../../src/utils/deepLinkManager";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { Window } from "../../../src/features/observe/Window";
import { AwaitIdle } from "../../../src/features/observe/AwaitIdle";
import { ObserveResult } from "../../../src/models";
import sinon from "sinon";

describe("DetectIntentChooser", () => {
  let detectIntentChooser: DetectIntentChooser;
  let mockDeepLinkManager: DeepLinkManager;
  let mockObserveScreen: sinon.SinonStubbedInstance<ObserveScreen>;
  let mockWindow: sinon.SinonStubbedInstance<Window>;
  let mockAwaitIdle: sinon.SinonStubbedInstance<AwaitIdle>;

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
    mockObserveScreen.execute.resolves(mockObserveResult);

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

    // Replace the internal managers with our mocks
    (detectIntentChooser as any).deepLinkManager = mockDeepLinkManager;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("constructor", () => {
    it("should create DetectIntentChooser with device ID", () => {
      const instance = new DetectIntentChooser("test-device");
      expect(instance).to.be.instanceOf(DetectIntentChooser);
    });
  });

  describe("execute", () => {
    it("should detect intent chooser when provided with view hierarchy", async () => {
      const result = await detectIntentChooser.execute();

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true;
      expect(result.observation).to.equal(mockObserveResult);
    });

    it("should not detect intent chooser in normal app view hierarchy", async () => {
      const normalViewHierarchy = `
        <hierarchy>
          <node class="android.widget.LinearLayout">
            <node text="Normal app content" />
          </node>
        </hierarchy>
      `;

      const normalObserveResult = {
        ...mockObserveResult,
        viewHierarchy: normalViewHierarchy
      };

      mockObserveScreen.getMostRecentCachedObserveResult.resolves(normalObserveResult);
      mockObserveScreen.execute.resolves(normalObserveResult);

      const result = await detectIntentChooser.execute();

      expect(result.success).to.be.true;
      expect(result.detected).to.be.false;
      expect(result.observation).to.equal(normalObserveResult);
    });

    it("should observe screen when no view hierarchy provided", async () => {
      const result = await detectIntentChooser.execute();

      expect(result.success).to.be.true;
      expect(result.detected).to.be.true; // mockObserveResult contains ChooserActivity
      expect(result.observation).to.equal(mockObserveResult);
    });

    it("should handle observe screen failure", async () => {
      // Mock getMostRecentCachedObserveResult to fail
      mockObserveScreen.getMostRecentCachedObserveResult.rejects(new Error("Failed to get cached result"));

      try {
        await detectIntentChooser.execute();
        expect.fail("Expected an error to be thrown");
      } catch (error) {
        expect((error as Error).message).to.include("Cannot perform action without view hierarchy");
      }
    });

    it("should handle observe screen returning null view hierarchy", async () => {
      // Mock observe screen to return result without view hierarchy
      mockObserveScreen.getMostRecentCachedObserveResult.resolves({
        timestamp: "2025-01-01T00:00:00.000Z",
        screenSize: { width: 1080, height: 1920 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      } as ObserveResult);

      try {
        await detectIntentChooser.execute();
        expect.fail("Expected an error to be thrown");
      } catch (error) {
        expect((error as Error).message).to.include("Cannot perform action without view hierarchy");
      }
    });

    it("should handle deep link manager detection failure", async () => {
      // Mock deep link manager to throw error
      mockDeepLinkManager.detectIntentChooser = () => {
        throw new Error("Detection failed");
      };

      const result = await detectIntentChooser.execute();

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
        mockObserveScreen.getMostRecentCachedObserveResult.resolves({
          ...mockObserveResult,
          viewHierarchy
        });

        const result = await detectIntentChooser.execute();
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
        mockObserveScreen.getMostRecentCachedObserveResult.resolves({
          ...mockObserveResult,
          viewHierarchy
        });

        const result = await detectIntentChooser.execute();
        expect(result.success).to.be.true;
        expect(result.detected).to.be.false;
      }
    });
  });
});
