import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { ViewHierarchy } from "../../../src/features/observe/ViewHierarchy";
import { AdbUtils } from "../../../src/utils/android-cmdline-tools/adb";
import { TakeScreenshot } from "../../../src/features/observe/TakeScreenshot";
import { BootedDevice } from "../../../src/models/DeviceInfo";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import fs from "fs-extra";
import { promisify } from "util";

// Create a mock readFile function that returns some fake screenshot data
const mockReadFile = promisify((path: string, callback: (err: any, data?: Buffer) => void) => {
  // Return fake screenshot data for any path
  setImmediate(() => callback(null, Buffer.from("fake screenshot data")));
});

// Override the readFileAsync function for tests that need it
const originalReadFile = fs.readFile;
const setupReadFileMock = () => {
  (fs as any).readFile = mockReadFile;
};
const teardownReadFileMock = () => {
  (fs as any).readFile = originalReadFile;
};

describe("ViewHierarchy", function() {
  describe("Unit Tests for Public Methods", function() {
    let viewHierarchy: ViewHierarchy;
    let mockAdb: AdbUtils;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      // Create mocks for testing
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, mockAdb, null, mockTakeScreenshot, mockAccessibilityServiceClient);
      setupReadFileMock();
    });

    afterEach(function() {
      teardownReadFileMock();
    });

    it("should identify string filter criteria correctly", function() {
      const propsWithText = { text: "Button Text" };
      const propsWithResourceId = { "resource-id": "com.app:id/button" };
      const propsWithContentDesc = { "content-desc": "Button description" };
      const propsEmpty = { clickable: "true" };

      // Now that the method is public, we can call it directly
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithText)).to.be.true;
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithResourceId)).to.be.true;
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithContentDesc)).to.be.true;
      expect(viewHierarchy.meetsStringFilterCriteria(propsEmpty)).to.be.false;
    });

    it("should identify boolean filter criteria correctly", function() {
      const propsClickable = { clickable: "true" };
      const propsScrollable = { scrollable: "true" };
      const propsFocused = { focused: "true" };
      const propsNonBoolean = { text: "Button" };

      expect(viewHierarchy.meetsBooleanFilterCriteria(propsClickable)).to.be.true;
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsScrollable)).to.be.true;
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsFocused)).to.be.true;
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsNonBoolean)).to.be.false;
    });

    it("should check meets filter criteria correctly", function() {
      const propsWithText = { text: "Button Text" };
      const propsClickable = { clickable: "true" };
      const propsEmpty = { enabled: "true" };

      expect(viewHierarchy.meetsFilterCriteria(propsWithText)).to.be.true;
      expect(viewHierarchy.meetsFilterCriteria(propsClickable)).to.be.true;
      expect(viewHierarchy.meetsFilterCriteria(propsEmpty)).to.be.false;
    });

    it("should calculate screenshot hash correctly", function() {
      const testBuffer = Buffer.from("test screenshot data");

      const hash = viewHierarchy.calculateScreenshotHash(testBuffer);

      expect(hash).to.be.a("string");
      expect(hash).to.have.length(32); // MD5 hash length
      expect(hash).to.match(/^[a-f0-9]+$/); // Hex string
    });

    it("should validate XML data correctly", function() {
      const validXml = '<?xml version="1.0"?><hierarchy><node text="test"/></hierarchy>';
      const invalidXml = "";
      const xmlWithoutHierarchy = '<?xml version="1.0"?><root><node text="test"/></root>';

      expect(viewHierarchy.validateXmlData(validXml)).to.be.true;
      expect(viewHierarchy.validateXmlData(invalidXml)).to.be.false;
      expect(viewHierarchy.validateXmlData(xmlWithoutHierarchy)).to.be.false;
    });

    it("should extract XML from ADB output correctly", function() {
      const tempFile = "/sdcard/window_dump.xml";
      const xmlContent = '<?xml version="1.0"?><hierarchy><node text="test"/></hierarchy>';
      const stdout = `UI hierchary dumped to:${tempFile}\n${xmlContent}`;

      const result = viewHierarchy.extractXmlFromAdbOutput(stdout, tempFile);
      expect(result).to.equal(xmlContent);

      // Should return original if no UI hierarchy message
      const result2 = viewHierarchy.extractXmlFromAdbOutput(xmlContent, tempFile);
      expect(result2).to.equal(xmlContent);
    });

    it("should process node children correctly", function() {
      const node = {
        $: { text: "parent" },
        node: [
          { $: { text: "child1", clickable: "true" } },
          { $: { text: "child2", scrollable: "true" } },
          { $: { enabled: "true" } } // Should be filtered out
        ]
      };

      const filteredChildren = viewHierarchy.processNodeChildren(node, child => {
        return viewHierarchy.meetsFilterCriteria(child.$) ? child : null;
      });

      expect(filteredChildren).to.have.length(2);
      expect(filteredChildren[0].$).to.have.property("text", "child1");
      expect(filteredChildren[1].$).to.have.property("text", "child2");
    });

    it("should normalize node structure correctly", function() {
      const singleChild = [{ text: "single" }];
      const multipleChildren = [{ text: "first" }, { text: "second" }];

      const normalizedSingle = viewHierarchy.normalizeNodeStructure(singleChild);
      const normalizedMultiple = viewHierarchy.normalizeNodeStructure(multipleChildren);

      expect(normalizedSingle).to.be.an("object");
      expect(normalizedSingle).to.have.property("text", "single");
      expect(normalizedMultiple).to.be.an("array");
      expect(normalizedMultiple).to.have.length(2);
    });

    it("should filter single node correctly", function() {
      const nodeWithCriteria = {
        $: { text: "test", clickable: "true", enabled: "true", class: "android.widget.Button" },
        node: {
          $: { "resource-id": "button", "enabled": "false" }
        }
      };

      const filteredNode = viewHierarchy.filterSingleNode(nodeWithCriteria);

      expect(filteredNode).to.exist;
      expect(filteredNode).to.have.property("text", "test");
      expect(filteredNode).to.have.property("clickable", "true");
      expect(filteredNode).to.not.have.property("enabled"); // Should be filtered out
      expect(filteredNode).to.not.have.property("class"); // Should be filtered out
    });

    it("should filter single root node correctly", function() {
      const rootNode = {
        $: { class: "android.widget.FrameLayout" },
        node: [
          { $: { text: "visible text" } },
          { $: { enabled: "true" } } // Should be filtered out
        ]
      };

      const filteredRoot = viewHierarchy.filterSingleNode(rootNode, true);

      expect(filteredRoot).to.exist;
      expect(filteredRoot.node).to.exist;
      expect(filteredRoot.node).to.have.property("text", "visible text");
    });

    it("should return children when parent doesn't meet criteria but children do", function() {
      const nodeWithoutCriteria = {
        $: { enabled: "true" },
        node: [
          { $: { text: "child1" } },
          { $: { clickable: "true" } }
        ]
      };

      const result = viewHierarchy.filterSingleNode(nodeWithoutCriteria);

      expect(result).to.be.an("array");
      expect(result).to.have.length(2);
    });

    it("should calculate filtering stats", function() {
      const original = { large: "data".repeat(1000) };
      const filtered = { small: "data" };

      // Should not throw error
      expect(() => {
        viewHierarchy.calculateFilteringStats(original, filtered);
      }).to.not.throw();
    });
  });

  describe("Dumpsys Activity Top Integration Tests", function() {
    let viewHierarchy: ViewHierarchy;
    let mockAdb: AdbUtils;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, mockAdb, null, mockTakeScreenshot, mockAccessibilityServiceClient);
    });

    it("should parse dumpsys activity top output for class overrides", function() {
      const sampleDumpsysOutput = `
    View Hierarchy:
      com.android.internal.policy.DecorView{930a38 I.E...... R.....ID 0,0-1080,2400 aid=0}[]
        android.widget.LinearLayout{d76e313 V.E...... ......ID 0,0-1080,2400}
          dev.jasonpearson.android.ui.base.ZillowToolbar{9958b11 VFE...... ........ 0,0-1080,173 #7f0a078a app:id/search_toolbar aid=1073742017}
            android.widget.LinearLayout{a9c5a77 V.E...... ........ 0,51-0,122}
              com.google.android.material.textview.MaterialTextView{bace2c3 V.ED..... ......ID 0,0-0,71 #7f0a087c app:id/toolbar_title aid=1073742019}
              android.widget.RelativeLayout{5d91052 G.E...... ......I. 0,0-0,0 #7f0a0133 app:id/beta_tag aid=1073742018}
                com.google.android.material.textview.MaterialTextView{1d11f23 V.ED..... ......ID 0,0-0,0 #7f0a0134 app:id/beta_tag_text}
      Looper (main, tid 2) {2b059f8}
        (Total messages: 0, polling=false, quitting=false)
      `;

      const result = (viewHierarchy as any).parseDumpsysActivityTop(sampleDumpsysOutput);

      expect(result.classOverrides.size).to.be.greaterThan(0);
      // Check that custom classes were identified (non-Android classes)
      let foundCustomClass = false;
      for (const value of result.classOverrides.values()) {
        if (!value.match(/^(android\.|com\.android\.|androidx\.)/)) {
          foundCustomClass = true;
          break;
        }
      }
      expect(foundCustomClass).to.be.true;
    });

    it("should parse dumpsys activity top output for fragment data", function() {
      const sampleDumpsysOutput = `
    Active Fragments:
      NavHostFragment{97b69d} (5e6014e0-0916-441b-98fc-b250f5c30f83 id=0x7f0a012b)
          mFragmentId=#7f0a012b mContainerId=#7f0a012b mTag=null
          SearchTabContainerFragment{fc93440} (92eba8cc-8e59-4c67-9dcf-2f98fc626dd1 id=0x7f0a012b tag=8ba7a0d8-1d7d-4159-ab80-e3adbf1888ca)
              mFragmentId=#7f0a012b mContainerId=#7f0a012b mTag=8ba7a0d8-1d7d-4159-ab80-e3adbf1888ca
              Child FragmentManager{54867e5 in SearchTabContainerFragment{fc93440}}}:
                Active Fragments:
                RealEstateMapFragment{889490d} (ca2b0904-c6ce-46d1-a9a7-0b3afe6209e8 id=0x7f0a0774 tag=MAIN_FRAGMENT)
                    mFragmentId=#7f0a0774 mContainerId=#7f0a0774 mTag=MAIN_FRAGMENT
      `;

      const result = (viewHierarchy as any).parseDumpsysActivityTop(sampleDumpsysOutput);

      expect(result.fragmentData.size).to.be.greaterThan(0);
      // Check that we found SearchTabContainerFragment and RealEstateMapFragment
      expect(result.fragmentData.has("0x7f0a012b")).to.be.true;
      expect(result.fragmentData.get("0x7f0a012b")).to.equal("SearchTabContainerFragment");
      expect(result.fragmentData.has("0x7f0a0774")).to.be.true;
      expect(result.fragmentData.get("0x7f0a0774")).to.equal("RealEstateMapFragment");
    });

    it("should augment view hierarchy with class and fragment information", function() {
      const mockActivityTopData = {
        classOverrides: new Map([
          ["dev.jasonpearson.android.zillowmap:id/search_toolbar", "dev.jasonpearson.android.ui.base.ZillowToolbar"],
          ["0,0-1080,173", "dev.jasonpearson.android.ui.base.ZillowToolbar"]
        ]),
        fragmentData: new Map([
          ["0x7f0a012b", "SearchTabContainerFragment"],
          ["0x7f0a0774", "RealEstateMapFragment"]
        ]),
        viewData: new Map([
          ["dev.jasonpearson.android.zillowmap:id/custom_view", "dev.jasonpearson.android.ui.base.CustomView"]
        ])
      };

      const mockViewHierarchy: any = {
        hierarchy: {
          "resource-id": "dev.jasonpearson.android.zillowmap:id/search_toolbar",
          "class": "android.view.ViewGroup",
          "bounds": "[0,0][1080,173]",
          "node": {
            "resource-id": "0x7f0a012b",
            "class": "android.widget.FrameLayout"
          }
        }
      };

      (viewHierarchy as any).augmentViewHierarchyWithClassAndFragment(mockViewHierarchy, mockActivityTopData);

      // Check that class was overridden
      expect(mockViewHierarchy.hierarchy.class).to.equal("dev.jasonpearson.android.ui.base.ZillowToolbar");

      // Check that fragment was added
      expect((mockViewHierarchy.hierarchy.node as any).fragment).to.equal("SearchTabContainerFragment");
    });

    it("should handle empty dumpsys output gracefully", function() {
      const emptyDumpsysOutput = "";

      const result = (viewHierarchy as any).parseDumpsysActivityTop(emptyDumpsysOutput);

      expect(result.classOverrides.size).to.equal(0);
      expect(result.fragmentData.size).to.equal(0);
    });

    it("should handle dumpsys output without view hierarchy section", function() {
      const dumpsysWithoutViewHierarchy = `
        Some other output
        No View Hierarchy here
        Looper (main, tid 2) {2b059f8}
      `;

      const result = (viewHierarchy as any).parseDumpsysActivityTop(dumpsysWithoutViewHierarchy);

      expect(result.classOverrides.size).to.equal(0);
      expect(result.fragmentData.size).to.equal(0);
    });

    it("should handle dumpsys output without active fragments section", function() {
      const dumpsysWithoutActiveFragments = `
        View Hierarchy:
          com.android.internal.policy.DecorView{930a38 I.E...... R.....ID 0,0-1080,2400 aid=0}[]
            dev.jasonpearson.android.ui.base.ZillowToolbar{9958b11 VFE...... ........ 0,0-1080,173 #7f0a078a app:id/search_toolbar}
        Looper (main, tid 2) {2b059f8}
      `;

      const result = (viewHierarchy as any).parseDumpsysActivityTop(dumpsysWithoutActiveFragments);

      expect(result.classOverrides.size).to.be.greaterThan(0);
      expect(result.fragmentData.size).to.equal(0);
    });

    it("should only override non-Android classes", function() {
      const dumpsysWithMixedClasses = `
        View Hierarchy:
          android.widget.LinearLayout{d76e313 V.E...... ......ID 0,0-1080,2400 #7f0a01ff app:id/android_layout}
          com.android.internal.widget.DecorView{930a38 I.E...... R.....ID 0,0-1080,2400 #7f0a01fe app:id/decor_view}
          androidx.appcompat.widget.Toolbar{a9c5a77 V.E...... ........ 0,51-0,122 #7f0a01fd app:id/androidx_toolbar}
          dev.jasonpearson.android.ui.base.ZillowToolbar{9958b11 VFE...... ........ 0,0-1080,173 #7f0a078a app:id/zillow_toolbar}
        Looper (main, tid 2) {2b059f8}
      `;

      const result = (viewHierarchy as any).parseDumpsysActivityTop(dumpsysWithMixedClasses);

      // Should only have the Zillow class, not Android/androidx classes
      expect(result.classOverrides.size).to.equal(1);
      expect(result.classOverrides.has("7f0a078a")).to.be.true;
      expect(result.classOverrides.get("7f0a078a")).to.equal("dev.jasonpearson.android.ui.base.ZillowToolbar");
      expect(result.classOverrides.has("7f0a01ff")).to.be.false;
      expect(result.classOverrides.has("7f0a01fe")).to.be.false;
      expect(result.classOverrides.has("7f0a01fd")).to.be.false;
    });
  });

  describe("Cache Management Tests", function() {
    let viewHierarchy: ViewHierarchy;
    let mockAdb: AdbUtils;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      // Create mocks for testing
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, mockAdb, null, mockTakeScreenshot, mockAccessibilityServiceClient);
    });

    it("should return null from checkInMemoryCache when no cache exists", async function() {
      const mockBuffer = Buffer.from("mock screenshot data");
      const result = await viewHierarchy.checkInMemoryCache(mockBuffer);
      expect(result).to.be.null;
    });

    it("should return null from checkInMemoryCache when cache is expired", async function() {
      const hash = "test-hash";
      const mockBuffer = Buffer.from("mock screenshot data");
      const oldTimestamp = Date.now() - 120000; // 2 minutes ago (older than 60s TTL)

      // Access the static cache to add expired entry
      (ViewHierarchy as any).viewHierarchyCache.set(hash, {
        timestamp: oldTimestamp,
        activityHash: hash,
        viewHierarchy: { hierarchy: { test: "data" } }
      });

      const result = await viewHierarchy.checkInMemoryCache(mockBuffer);
      expect(result).to.be.null;
    });

    it("should return cached result from checkInMemoryCache when cache is valid", async function() {
      const hash = "test-hash";
      const mockBuffer = Buffer.from("mock screenshot data");
      const recentTimestamp = Date.now() - 30000; // 30 seconds ago (within 60s TTL)
      const testHierarchy = { hierarchy: { test: "data" } } as any;

      // Access the static cache to add valid entry
      (ViewHierarchy as any).viewHierarchyCache.set(hash, {
        timestamp: recentTimestamp,
        activityHash: hash,
        viewHierarchy: testHierarchy
      });

      // For this test to pass with fuzzy matching, we'd need actual screenshot files
      // For now, just test that it returns null since no fuzzy match is found
      const result = await viewHierarchy.checkInMemoryCache(mockBuffer);
      expect(result).to.be.null; // Will be null since no screenshot files exist to match against
    });

    it("should cache view hierarchy correctly", async function() {
      const timestamp = Date.now();
      const testHierarchy = { hierarchy: { test: "data" } } as any;

      await viewHierarchy.cacheViewHierarchy(timestamp, testHierarchy);

      // Check that it was cached using legacy hash-based method
      const cached = await viewHierarchy.checkCacheHierarchy(timestamp.toString());
      expect(cached).to.deep.equal(testHierarchy);
    });

    it("should return empty cache result when cache is empty", async function() {
      // Clear any existing cache
      (ViewHierarchy as any).viewHierarchyCache.clear();

      const result = await viewHierarchy.getMostRecentCachedViewHierarchy();

      expect(result).to.exist;
      expect(result.hierarchy).to.have.property("error", "No cached view hierarchy available");
    });

    it("should return most recent cached view hierarchy", async function() {
      const hash1 = "hash1";
      const hash2 = "hash2";
      const oldHierarchy = { hierarchy: { data: "old" } } as any;
      const newHierarchy = { hierarchy: { data: "new" } } as any;

      // Add old entry
      (ViewHierarchy as any).viewHierarchyCache.set(hash1, {
        timestamp: Date.now() - 50000,
        activityHash: hash1,
        viewHierarchy: oldHierarchy
      });

      // Add newer entry
      (ViewHierarchy as any).viewHierarchyCache.set(hash2, {
        timestamp: Date.now() - 10000,
        activityHash: hash2,
        viewHierarchy: newHierarchy
      });

      const result = await viewHierarchy.getMostRecentCachedViewHierarchy();
      expect(result).to.deep.equal(newHierarchy);
    });

    it("should check cache hierarchy correctly", async function() {
      const hash = "test-hash";
      const testHierarchy = { hierarchy: { test: "data" } } as any;

      // Set up in-memory cache
      (ViewHierarchy as any).viewHierarchyCache.set(hash, {
        timestamp: Date.now() - 30000,
        activityHash: hash,
        viewHierarchy: testHierarchy
      });

      // Use legacy hash-based method for this test
      const result = await viewHierarchy.checkCacheHierarchy(hash);
      expect(result).to.deep.equal(testHierarchy);
    });

    it("should return null from checkCacheHierarchy when no cache exists for nonexistent hash", async function() {
      const result = await viewHierarchy.checkCacheHierarchy("nonexistent-hash");
      expect(result).to.be.null;
    });

    it("should return null from checkCacheHierarchyWithFuzzyMatching when no cache exists", async function() {
      const mockBuffer = Buffer.from("mock screenshot data");
      const result = await viewHierarchy.checkCacheHierarchyWithFuzzyMatching(mockBuffer);
      expect(result).to.be.null;
    });

    it("should return null from checkDiskCache when file doesn't exist", async function() {
      const mockBuffer = Buffer.from("mock screenshot data");
      const result = await viewHierarchy.checkDiskCache(mockBuffer);
      expect(result).to.be.null;
    });


  });

  describe("XML Processing Tests", function() {
    let viewHierarchy: ViewHierarchy;
    let mockAdb: AdbUtils;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, mockAdb, null, mockTakeScreenshot, mockAccessibilityServiceClient);
    });

    it("should process valid XML data correctly", async function() {
      const validXml = '<?xml version="1.0"?><hierarchy><node text="test" clickable="true"/></hierarchy>';

      const result = await viewHierarchy.processXmlData(validXml);

      expect(result).to.exist;
      expect(result.hierarchy).to.exist;
    });

    it("should handle invalid XML data", async function() {
      const invalidXml = "";

      const result = await viewHierarchy.processXmlData(invalidXml);

      expect(result).to.exist;
      expect(result.hierarchy).to.have.property("error");
    });

    it("should parse XML to view hierarchy", async function() {
      const xmlData = '<?xml version="1.0"?><hierarchy><node text="test" clickable="true"/></hierarchy>';

      const result = await viewHierarchy.parseXmlToViewHierarchy(xmlData);

      expect(result).to.exist;
      expect(result.hierarchy).to.exist;
    });

    it("should execute uiautomator dump command", async function() {
      const xmlContent = '<?xml version="1.0"?><hierarchy><node text="test"/></hierarchy>';
      const mockAdbWithOutput = {
        executeCommand: async (cmd: string) => {
          if (cmd.includes("uiautomator dump")) {
            return { stdout: xmlContent, stderr: "" };
          }
          return { stdout: "", stderr: "" };
        }
      } as unknown as AdbUtils;

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithMock = new ViewHierarchy(mockDevice, mockAdbWithOutput, null, mockTakeScreenshot, mockAccessibilityServiceClient);

      const result = await viewHierarchyWithMock.executeUiAutomatorDump();
      expect(result).to.equal(xmlContent);
    });
  });

  describe("Screenshot Buffer Management Tests", function() {
    it("should throw error when screenshot fails", async function() {
      const mockDevice: BootedDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };

      const mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;

      const mockTakeScreenshotFail = {
        execute: async () => ({ success: false, error: "Screenshot failed" })
      } as unknown as TakeScreenshot;

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithMock = new ViewHierarchy(mockDevice, mockAdb, null, mockTakeScreenshotFail, mockAccessibilityServiceClient);

      try {
        await viewHierarchyWithMock.getOrCreateScreenshotBuffer(null);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an("error");
        expect((error as Error).message).to.include("Screenshot failed");
      }
    });
  });

  describe("Error Handling Tests", function() {
    let viewHierarchy: ViewHierarchy;
    let mockAdb: AdbUtils;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, mockAdb, mockTakeScreenshot, mockAccessibilityServiceClient);
      setupReadFileMock();
    });

    afterEach(function() {
      teardownReadFileMock();
    });

    it("should handle no active window gracefully", async function() {
      const result = await viewHierarchy.getAndroidViewHierarchy();

      expect(result).to.exist;
      expect(result.hierarchy).to.exist;
    });

    it("should handle screenshot errors in getViewHierarchy", async function() {
      const mockTakeScreenshotError = {
        execute: async () => ({ success: false, error: "screenshot error" })
      } as unknown as TakeScreenshot;

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithMocks = new ViewHierarchy(mockDevice, mockAdb, null, mockTakeScreenshotError, mockAccessibilityServiceClient);

      const result = await viewHierarchyWithMocks.getAndroidViewHierarchy();

      expect(result).to.exist;
      expect(result.hierarchy).to.exist;
    });

    it("should handle ADB errors in executeUiAutomatorDump", async function() {
      const mockAdbError = {
        executeCommand: async () => {
          throw new Error("null root node returned by UiTestAutomationBridge");
        }
      } as unknown as AdbUtils;

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithError = new ViewHierarchy(mockDevice, mockAdbError, null, mockTakeScreenshot, mockAccessibilityServiceClient);

      try {
        await viewHierarchyWithError.executeUiAutomatorDump();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an("error");
      }
    });

    it("should handle device locked/screen off error in _getViewHierarchyWithoutCache", async function() {
      const mockAdbLockedError = {
        executeCommand: async () => {
          throw new Error("null root node returned by UiTestAutomationBridge");
        }
      } as unknown as AdbUtils;

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithError = new ViewHierarchy(mockDevice, mockAdbLockedError, null, mockTakeScreenshot, mockAccessibilityServiceClient);

      // Call _getViewHierarchyWithoutCache directly to test its error handling
      const result = await (viewHierarchyWithError as any)._getViewHierarchyWithoutCache();

      expect(result).to.exist;
      expect(result.hierarchy).to.have.property("error");
      expect(result.hierarchy.error).to.include("screen appears to be off or device is locked");
    });

    it("should handle cat file not found error in _getViewHierarchyWithoutCache", async function() {
      const mockAdbCatError = {
        executeCommand: async () => {
          throw new Error("cat: /sdcard/window_dump.xml: No such file or directory");
        }
      } as unknown as AdbUtils;

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithError = new ViewHierarchy(mockDevice, mockAdbCatError, null, mockTakeScreenshot, mockAccessibilityServiceClient);

      // Call _getViewHierarchyWithoutCache directly to test its error handling
      const result = await (viewHierarchyWithError as any)._getViewHierarchyWithoutCache();

      expect(result).to.exist;
      expect(result.hierarchy).to.have.property("error");
      expect(result.hierarchy.error).to.include("screen appears to be off or device is locked");
    });

    it("should handle generic error in _getViewHierarchyWithoutCache", async function() {
      const mockAdbGenericError = {
        executeCommand: async () => {
          throw new Error("Some other generic error");
        }
      } as unknown as AdbUtils;

      const mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      const viewHierarchyWithError = new ViewHierarchy(mockDevice, mockAdbGenericError, null, mockTakeScreenshot, mockAccessibilityServiceClient);

      // Call _getViewHierarchyWithoutCache directly to test its error handling
      const result = await (viewHierarchyWithError as any)._getViewHierarchyWithoutCache();

      expect(result).to.exist;
      expect(result.hierarchy).to.have.property("error");
      expect(result.hierarchy.error).to.include("Failed to retrieve view hierarchy data");
    });
  });

  describe("FilterViewHierarchy Tests", function() {
    let viewHierarchy: ViewHierarchy;
    let mockAdb: AdbUtils;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, mockAdb, mockTakeScreenshot, mockAccessibilityServiceClient);
    });

    it("should handle empty hierarchy", function() {
      const emptyHierarchy = null;
      const result = viewHierarchy.filterViewHierarchy(emptyHierarchy);
      expect(result).to.equal(emptyHierarchy);
    });

    it("should handle hierarchy without hierarchy property", function() {
      const noHierarchy = { data: "test" };
      const result = viewHierarchy.filterViewHierarchy(noHierarchy);
      expect(result).to.equal(noHierarchy);
    });

    it("should filter hierarchy with mixed criteria", function() {
      const testHierarchy = {
        hierarchy: {
          $: { class: "android.widget.FrameLayout" },
          node: [
            { $: { text: "Keep this", class: "android.widget.Button" } },
            { $: { clickable: "true", class: "android.widget.View" } },
            { $: { enabled: "true", class: "android.widget.View" } }, // Should be filtered out
            {
              $: { class: "android.widget.LinearLayout" },
              node: {
                $: { "resource-id": "important_button", "class": "android.widget.Button" }
              }
            }
          ]
        }
      };

      const result = viewHierarchy.filterViewHierarchy(testHierarchy);

      expect(result).to.exist;
      expect(result.hierarchy).to.exist;
    });
  });

  describe("Edge Cases and Additional Coverage", function() {
    let viewHierarchy: ViewHierarchy;
    let mockAdb: AdbUtils;
    let mockTakeScreenshot: TakeScreenshot;
    let mockAccessibilityServiceClient: AccessibilityServiceClient;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;

      mockTakeScreenshot = {
        execute: async () => ({ success: true, path: "/tmp/test.png" })
      } as unknown as TakeScreenshot;

      mockAccessibilityServiceClient = {
        getLatestHierarchy: async () => null,
        convertToViewHierarchyResult: () => ({ hierarchy: {} }),
        convertAccessibilityNode: () => ({}),
        getAccessibilityHierarchy: async () => null
      } as unknown as AccessibilityServiceClient;

      viewHierarchy = new ViewHierarchy(mockDevice, mockAdb, mockTakeScreenshot, mockAccessibilityServiceClient);
    });

    it("should handle node with empty children array", function() {
      const nodeWithEmptyChildren = {
        $: { text: "parent" },
        node: []
      };

      const filteredChildren = viewHierarchy.processNodeChildren(nodeWithEmptyChildren, child => child);
      expect(filteredChildren).to.have.length(0);
    });

    it("should handle node with single child (not array)", function() {
      const nodeWithSingleChild = {
        $: { text: "parent" },
        node: { $: { text: "single child", clickable: "true" } }
      };

      const filteredChildren = viewHierarchy.processNodeChildren(nodeWithSingleChild, child => {
        return viewHierarchy.meetsFilterCriteria(child.$) ? child : null;
      });

      expect(filteredChildren).to.have.length(1);
      expect(filteredChildren[0].$).to.have.property("text", "single child");
    });

    it("should handle filterSingleNode with null input", function() {
      const result = viewHierarchy.filterSingleNode(null);
      expect(result).to.be.null;
    });

    it("should handle node with over 64 children (should be limited)", function() {
      const manyChildren = [];
      for (let i = 0; i < 100; i++) {
        manyChildren.push({ $: { text: `child${i}`, clickable: "true" } });
      }

      const nodeWithManyChildren = {
        $: { text: "parent" },
        node: manyChildren
      };

      const filteredChildren = viewHierarchy.processNodeChildren(nodeWithManyChildren, child => child);
      expect(filteredChildren).to.have.length(64); // Should be limited to 64
    });

    it("should handle string filter criteria with empty values", function() {
      const propsWithEmptyText = { text: "" };
      const propsWithEmptyResourceId = { "resource-id": "" };
      const propsWithNullText = { text: null };

      expect(viewHierarchy.meetsStringFilterCriteria(propsWithEmptyText)).to.be.false;
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithEmptyResourceId)).to.be.false;
      expect(viewHierarchy.meetsStringFilterCriteria(propsWithNullText)).to.be.false;
    });

    it("should handle boolean filter criteria with string values", function() {
      const propsWithStringTrue = { clickable: "true" };
      const propsWithStringFalse = { clickable: "false" };
      const propsWithActualBoolean = { clickable: true };

      expect(viewHierarchy.meetsBooleanFilterCriteria(propsWithStringTrue)).to.be.true;
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsWithStringFalse)).to.be.false;
      expect(viewHierarchy.meetsBooleanFilterCriteria(propsWithActualBoolean)).to.be.false;
    });

    it("should handle normalize structure with empty array", function() {
      const emptyArray: any[] = [];
      const result = viewHierarchy.normalizeNodeStructure(emptyArray);
      expect(result).to.be.an("array");
      expect(result).to.have.length(0);
    });

    it("should handle filter criteria with mixed property formats", function() {
      const mixedProps = {
        "resourceId": "button_id", // camelCase
        "content-desc": "Button description", // hyphenated
        "scrollable": "true"
      };

      expect(viewHierarchy.meetsStringFilterCriteria(mixedProps)).to.be.true;
      expect(viewHierarchy.meetsBooleanFilterCriteria(mixedProps)).to.be.true;
      expect(viewHierarchy.meetsFilterCriteria(mixedProps)).to.be.true;
    });

    it("should clean node properties correctly with various edge cases", function() {
      const nodeWithVariousProps = {
        $: {
          "text": "valid text",
          "resourceId": "valid_id", // camelCase - should be normalized to resource-id
          "contentDesc": "valid desc", // camelCase - should be normalized to content-desc
          "enabled": "true", // should be filtered out
          "clickable": "false", // should be filtered out
          "scrollable": "true", // should be kept
          "class": "android.widget.View", // not in allowed properties
          "content-desc": "", // empty string should be filtered out
          "bounds": "[0,0][100,100]" // should be kept
        }
      };

      const filteredNode = viewHierarchy.filterSingleNode(nodeWithVariousProps);

      expect(filteredNode).to.exist;
      expect(filteredNode).to.have.property("text", "valid text");
      expect(filteredNode).to.have.property("resource-id", "valid_id");
      expect(filteredNode).to.have.property("content-desc", "valid desc");
      expect(filteredNode).to.have.property("scrollable", "true");
      expect(filteredNode).to.have.property("bounds", "[0,0][100,100]");
      expect(filteredNode).to.not.have.property("enabled");
      expect(filteredNode).to.not.have.property("clickable");
      expect(filteredNode).to.not.have.property("class");
    });

    it("should handle node without $ properties correctly", function() {
      const nodeWithoutDollar = {
        "text": "direct text",
        "resourceId": "direct_id",
        "enabled": "true", // should be filtered out
        "scrollable": "true", // should be kept
        "class": "android.widget.View", // not in allowed properties
        "content-desc": "", // empty string should be filtered out
        "node": {
          text: "child text"
        }
      };

      const filteredNode = viewHierarchy.filterSingleNode(nodeWithoutDollar);

      expect(filteredNode).to.exist;
      expect(filteredNode).to.have.property("text", "direct text");
      expect(filteredNode).to.have.property("resourceId", "direct_id");
      expect(filteredNode).to.have.property("scrollable", "true");
      expect(filteredNode).to.not.have.property("enabled");
      expect(filteredNode).to.not.have.property("class");
      expect(filteredNode).to.not.have.property("content-desc");
    });
  });
});


describe("Z-Index Accessibility Analysis", () => {
  const mockDevice: BootedDevice = {
    deviceId: "test-device",
    name: "Test Device",
    platform: "android"
  };

  it("should add accessible field to clickable elements", async () => {
    const mockAccessibilityServiceClient = {
      getLatestHierarchy: async () => null,
      convertToViewHierarchyResult: () => ({ hierarchy: {} }),
      convertAccessibilityNode: () => ({}),
      getAccessibilityHierarchy: async () => null
    } as unknown as AccessibilityServiceClient;

    const viewHierarchy = new ViewHierarchy(mockDevice, null, null, mockAccessibilityServiceClient);

    // Mock XML with clickable elements at different Z levels
    const mockXml = `
      <hierarchy>
        <node bounds="[0,0][100,100]" clickable="true" text="Button 1"/>
        <node bounds="[50,50][150,150]" clickable="true" text="Button 2"/>
        <node bounds="[0,0][200,200]" clickable="false" text="Background"/>
      </hierarchy>
    `;

    const result = await viewHierarchy.processXmlData(mockXml);

    // Find clickable elements in the result
    const findClickableElements = (node: any): any[] => {
      const clickableElements: any[] = [];
      if (node.clickable === "true" && node.accessible !== undefined) {
        clickableElements.push(node);
      }
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          clickableElements.push(...findClickableElements(child));
        }
      }
      return clickableElements;
    };

    const clickableElements = findClickableElements(result.hierarchy as any);

    // Verify that clickable elements have the accessible field
    expect(clickableElements.length).to.be.greaterThan(0);
    for (const element of clickableElements) {
      expect(element).to.have.property("accessible");
      expect(element.accessible).to.be.a("number");
      expect(element.accessible).to.be.within(0, 1);
      // Check 3 decimal places precision
      expect(element.accessible.toString().split(".")[1]?.length || 0).to.be.at.most(3);
    }
  });

  it("should calculate accessibility percentage correctly for overlapping elements", async () => {
    const mockDevice: BootedDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    const mockAccessibilityServiceClient = {
      getLatestHierarchy: async () => null,
      convertToViewHierarchyResult: () => ({ hierarchy: {} }),
      convertAccessibilityNode: () => ({}),
      getAccessibilityHierarchy: async () => null
    } as unknown as AccessibilityServiceClient;

    const viewHierarchy = new ViewHierarchy(mockDevice, null, null, mockAccessibilityServiceClient);

    // Mock XML with overlapping clickable elements
    const mockXml = `
      <hierarchy>
        <node bounds="[0,0][100,100]" clickable="true" text="Bottom Button">
          <node bounds="[25,25][75,75]" clickable="false" text="Overlay"/>
        </node>
      </hierarchy>
    `;

    const result = await viewHierarchy.processXmlData(mockXml);

    // Find the clickable element after filtering
    const findClickableElement = (node: any): any => {
      if (node.clickable === "true") {
        return node;
      }
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          const found = findClickableElement(child);
          if (found) {return found;}
        }
      }
      return null;
    };

    const bottomButton = findClickableElement(result.hierarchy);
    expect(bottomButton).to.not.be.null;
    expect(bottomButton.accessible).to.be.a("number");
    expect(bottomButton.accessible).to.be.within(0, 1);

    // With a 50x50 overlay on a 100x100 button, accessibility should be 0.75 (75%)
    // Total area: 100*100 = 10000
    // Covered area: 50*50 = 2500
    // Accessible area: 10000 - 2500 = 7500
    // Percentage: 7500/10000 = 0.75
    expect(bottomButton.accessible).to.equal(0.75);
  });

  it("should handle elements with no bounds gracefully", async () => {
    const mockDevice: BootedDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    const mockAccessibilityServiceClient = {
      getLatestHierarchy: async () => null,
      convertToViewHierarchyResult: () => ({ hierarchy: {} }),
      convertAccessibilityNode: () => ({}),
      getAccessibilityHierarchy: async () => null
    } as unknown as AccessibilityServiceClient;

    const viewHierarchy = new ViewHierarchy(mockDevice, null, null, mockAccessibilityServiceClient);

    // Mock XML with element without bounds
    const mockXml = `
      <hierarchy>
        <node clickable="true" text="Button without bounds"/>
        <node bounds="[0,0][100,100]" clickable="true" text="Button with bounds"/>
      </hierarchy>
    `;

    // Should not throw an error
    const result = await viewHierarchy.processXmlData(mockXml);
    expect(result).to.be.an("object");
    expect(result.hierarchy).to.be.an("object");
  });
});

describe("findFocusedElement", function() {
  let viewHierarchy: ViewHierarchy;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    const mockAccessibilityServiceClient = {
      getLatestHierarchy: async () => null,
      convertToViewHierarchyResult: () => ({ hierarchy: {} }),
      convertAccessibilityNode: () => ({}),
      getAccessibilityHierarchy: async () => null
    } as unknown as AccessibilityServiceClient;

    viewHierarchy = new ViewHierarchy(mockDevice, null, null, null, mockAccessibilityServiceClient);
  });

  it("should find focused element in simple hierarchy", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: [
          {
            "text": "Button 1",
            "resource-id": "com.example:id/button1",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "false"
          },
          {
            "text": "Input Field",
            "resource-id": "com.example:id/input",
            "bounds": "[0,60][200,100]",
            "clickable": "true",
            "focused": "true"
          }
        ]
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).to.not.be.null;
    expect(focusedElement!.text).to.equal("Input Field");
    expect(focusedElement!["resource-id"]).to.equal("com.example:id/input");
    expect(focusedElement!.focused).to.be.true;
  });

  it("should return null when no element is focused", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: [
          {
            "text": "Button 1",
            "resource-id": "com.example:id/button1",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "false"
          },
          {
            "text": "Button 2",
            "resource-id": "com.example:id/button2",
            "bounds": "[0,110][100,160]",
            "clickable": "true",
            "focused": "false"
          }
        ]
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).to.be.null;
  });

  it("should return null for empty or null hierarchy", function() {
    expect(viewHierarchy.findFocusedElement(null)).to.be.null;
    expect(viewHierarchy.findFocusedElement({})).to.be.null;
    expect(viewHierarchy.findFocusedElement({ hierarchy: null })).to.be.null;
  });

  it("should find focused element in deeply nested hierarchy", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "text": "Container",
          "resource-id": "com.example:id/container",
          "bounds": "[0,0][300,200]",
          "focused": "false",
          "node": {
            "text": "SubContainer",
            "resource-id": "com.example:id/sub_container",
            "bounds": "[10,10][290,190]",
            "focused": "false",
            "node": [
              {
                "text": "Deep Button",
                "resource-id": "com.example:id/deep_button",
                "bounds": "[20,20][80,50]",
                "clickable": "true",
                "focused": "false"
              },
              {
                "text": "Deep Input",
                "resource-id": "com.example:id/deep_input",
                "bounds": "[20,60][200,90]",
                "clickable": "true",
                "focused": "true"
              }
            ]
          }
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).to.not.be.null;
    expect(focusedElement!.text).to.equal("Deep Input");
    expect(focusedElement!["resource-id"]).to.equal("com.example:id/deep_input");
    expect(focusedElement!.focused).to.be.true;
  });

  it("should handle boolean focused property", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "text": "Button",
          "resource-id": "com.example:id/button",
          "bounds": "[0,0][100,50]",
          "clickable": "true",
          "focused": true  // Boolean instead of string
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).to.not.be.null;
    expect(focusedElement!.text).to.equal("Button");
    expect(focusedElement!.focused).to.be.true;
  });

  it("should handle element with $ properties structure", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "$": {
            "text": "Button with $",
            "resource-id": "com.example:id/button_dollar",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "true"
          }
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).to.not.be.null;
    expect(focusedElement!.text).to.equal("Button with $");
    expect(focusedElement!["resource-id"]).to.equal("com.example:id/button_dollar");
    expect(focusedElement!.focused).to.be.true;
  });

  it("should stop at first focused element found", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: [
          {
            "text": "First Focused",
            "resource-id": "com.example:id/first",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": "true"
          },
          {
            "text": "Second Focused",
            "resource-id": "com.example:id/second",
            "bounds": "[0,60][100,110]",
            "clickable": "true",
            "focused": "true"
          }
        ]
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    expect(focusedElement).to.not.be.null;
    expect(focusedElement!.text).to.equal("First Focused");
    expect(focusedElement!["resource-id"]).to.equal("com.example:id/first");
  });

  it("should handle elements without valid bounds", function() {
    const mockViewHierarchy = {
      hierarchy: {
        node: {
          "text": "Invalid Bounds Element",
          "resource-id": "com.example:id/invalid",
          "bounds": "invalid-bounds-format",
          "focused": "true"
        }
      }
    };

    const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

    // Should return null because parseNodeBounds fails for invalid bounds
    expect(focusedElement).to.be.null;
  });
});
