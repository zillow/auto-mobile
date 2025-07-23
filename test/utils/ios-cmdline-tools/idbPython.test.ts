import { expect } from "chai";
import { IdbPython, IdbAccessibilityElement } from "../../../src/utils/ios-cmdline-tools/idbPython";
import { BootedDevice, ExecResult } from "../../../src/models";

describe("IdbPython", function() {
  let idb: IdbPython;
  let mockDevice: BootedDevice;
  let mockExecAsync: (command: string, maxBuffer?: number) => Promise<ExecResult>;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-ios-device-id",
      name: "Test iOS Device",
      platform: "ios",
      source: "local"
    };

    mockExecAsync = async (command: string): Promise<ExecResult> => {
      return {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
    };

    idb = new IdbPython(mockDevice, mockExecAsync);
  });

  describe("parseAccessibilityToViewHierarchy", function() {
    it("should parse iOS Calendar app accessibility data to ViewHierarchyResult", function() {
      const calendarElements: IdbAccessibilityElement[] = [
        {
          "AXFrame": "{{0, 0}, {393, 852}}",
          "AXUniqueId": null,
          "frame": { "y": 0, "x": 0, "width": 393, "height": 852 },
          "role_description": "application",
          "AXLabel": "Calendar",
          "content_required": false,
          "type": "Application",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXApplication",
          "subrole": null
        },
        {
          "AXFrame": "{{24, 145.66666666666666}, {345, 81.666666666666657}}",
          "AXUniqueId": null,
          "frame": { "y": 145.66666666666666, "x": 24, "width": 345, "height": 81.666666666666657 },
          "role_description": "heading",
          "AXLabel": "What's New in Calendar",
          "content_required": false,
          "type": "Heading",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXHeading",
          "subrole": null
        },
        {
          "AXFrame": "{{24, 712.66666666666663}, {345, 50.333333333333371}}",
          "AXUniqueId": null,
          "frame": { "y": 712.66666666666663, "x": 24, "width": 345, "height": 50.333333333333371 },
          "role_description": "button",
          "AXLabel": "Continue",
          "content_required": false,
          "type": "Button",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXButton",
          "subrole": null
        }
      ];

      const result = idb.parseAccessibilityToViewHierarchy(calendarElements);

      expect(result).to.have.property("hierarchy");
      expect(result.hierarchy).to.have.property("node");
      expect(result.hierarchy.node).to.not.be.undefined;

      const rootNode = result.hierarchy.node!;
      expect(rootNode.$).to.have.property("text", "Calendar");
      expect(rootNode.$).to.have.property("content-desc", "Calendar");
      expect(rootNode.$).to.have.property("class", "Application");
      expect(rootNode.$).to.have.property("ios-role", "AXApplication");
      expect(rootNode.$).to.have.property("enabled", "true");
      expect(rootNode.$).to.have.property("bounds", "[0,0][393,852]");

      expect(rootNode.bounds).to.deep.equal({
        left: 0,
        top: 0,
        right: 393,
        bottom: 852
      });

      expect(rootNode.node).to.be.an("array").with.length(2);

      const headingNode = rootNode.node![0];
      expect(headingNode.$).to.have.property("text", "What's New in Calendar");
      expect(headingNode.$).to.have.property("class", "Heading");
      expect(headingNode.$).to.have.property("ios-role", "AXHeading");

      const buttonNode = rootNode.node![1];
      expect(buttonNode.$).to.have.property("text", "Continue");
      expect(buttonNode.$).to.have.property("class", "Button");
      expect(buttonNode.$).to.have.property("ios-role", "AXButton");
      expect(buttonNode.$).to.have.property("clickable", "true");
      expect(buttonNode.$).to.have.property("focusable", "true");
    });

    it("should parse iOS Settings app accessibility data to ViewHierarchyResult", function() {
      const settingsElements: IdbAccessibilityElement[] = [
        {
          "AXFrame": "{{0, 0}, {393, 852}}",
          "AXUniqueId": null,
          "frame": { "y": 0, "x": 0, "width": 393, "height": 852 },
          "role_description": "application",
          "AXLabel": "Settings",
          "content_required": false,
          "type": "Application",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXApplication",
          "subrole": null
        },
        {
          "AXFrame": "{{16, 150.66666666666666}, {361, 36}}",
          "AXUniqueId": null,
          "frame": { "y": 150.66666666666666, "x": 16, "width": 361, "height": 36 },
          "role_description": "search text field",
          "AXLabel": null,
          "content_required": false,
          "type": "TextField",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": "Search",
          "enabled": true,
          "role": "AXTextField",
          "subrole": "AXSearchField"
        },
        {
          "AXFrame": "{{20, 201.66666666666666}, {353, 100.33333333333334}}",
          "AXUniqueId": "com.apple.settings.primaryAppleAccount",
          "frame": { "y": 201.66666666666666, "x": 20, "width": 353, "height": 100.33333333333334 },
          "role_description": "button",
          "AXLabel": "Apple Account, Sign in to access your iCloud data, the App Store, Apple services, and more.",
          "content_required": false,
          "type": "Button",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXButton",
          "subrole": null
        }
      ];

      const result = idb.parseAccessibilityToViewHierarchy(settingsElements);

      expect(result).to.have.property("hierarchy");
      expect(result.hierarchy).to.have.property("node");

      const rootNode = result.hierarchy.node!;
      expect(rootNode.$).to.have.property("text", "Settings");
      expect(rootNode.$).to.have.property("class", "Application");

      expect(rootNode.node).to.be.an("array").with.length(2);

      const textFieldNode = rootNode.node![0];
      expect(textFieldNode.$).to.have.property("class", "TextField");
      expect(textFieldNode.$).to.have.property("ios-role", "AXTextField");
      expect(textFieldNode.$).to.have.property("ios-subrole", "AXSearchField");
      expect(textFieldNode.$).to.have.property("ios-value", "Search");
      expect(textFieldNode.$).to.have.property("focusable", "true");

      const buttonNode = rootNode.node![1];
      expect(buttonNode.$).to.have.property("resource-id", "com.apple.settings.primaryAppleAccount");
      expect(buttonNode.$).to.have.property("clickable", "true");
      expect(buttonNode.$).to.have.property("focusable", "true");
    });

    it("should handle empty accessibility elements array", function() {
      const result = idb.parseAccessibilityToViewHierarchy([]);

      expect(result).to.have.property("hierarchy");
      expect(result.hierarchy).to.have.property("error", "No accessibility elements provided");
    });

    it("should handle array without Application element", function() {
      const elements: IdbAccessibilityElement[] = [
        {
          "AXFrame": "{{24, 145}, {345, 81}}",
          "AXUniqueId": null,
          "frame": { "y": 145, "x": 24, "width": 345, "height": 81 },
          "role_description": "heading",
          "AXLabel": "Test Heading",
          "content_required": false,
          "type": "Heading",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXHeading",
          "subrole": null
        }
      ];

      const result = idb.parseAccessibilityToViewHierarchy(elements);

      expect(result).to.have.property("hierarchy");
      expect(result.hierarchy).to.have.property("node");

      const rootNode = result.hierarchy.node!;
      expect(rootNode.$).to.have.property("text", "Test Heading");
      expect(rootNode.$).to.have.property("class", "Heading");
      expect(rootNode.node).to.be.undefined; // No child elements since we used the only element as root
    });

    it("should correctly identify clickable elements", function() {
      const elements: IdbAccessibilityElement[] = [
        {
          "AXFrame": "{{0, 0}, {100, 100}}",
          "AXUniqueId": null,
          "frame": { "y": 0, "x": 0, "width": 100, "height": 100 },
          "role_description": "button",
          "AXLabel": "Test Button",
          "content_required": false,
          "type": "Button",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXButton",
          "subrole": null
        },
        {
          "AXFrame": "{{0, 100}, {100, 100}}",
          "AXUniqueId": null,
          "frame": { "y": 100, "x": 0, "width": 100, "height": 100 },
          "role_description": "text",
          "AXLabel": "Regular Text",
          "content_required": false,
          "type": "StaticText",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXStaticText",
          "subrole": null
        },
        {
          "AXFrame": "{{0, 200}, {100, 100}}",
          "AXUniqueId": null,
          "frame": { "y": 200, "x": 0, "width": 100, "height": 100 },
          "role_description": "text",
          "AXLabel": "Actionable Text",
          "content_required": false,
          "type": "StaticText",
          "title": null,
          "help": null,
          "custom_actions": ["Tap", "Long Press"],
          "AXValue": null,
          "enabled": true,
          "role": "AXStaticText",
          "subrole": null
        }
      ];

      const result = idb.parseAccessibilityToViewHierarchy(elements);
      const rootNode = result.hierarchy.node!;

      expect(rootNode.$).to.have.property("clickable", "true"); // Button type

      const childNodes = rootNode.node!;
      expect(childNodes).to.have.length(2);

      expect(childNodes[0].$).to.have.property("clickable", "true"); // StaticText is considered clickable

      expect(childNodes[1].$).to.have.property("clickable", "true"); // Has custom actions
    });

    it("should correctly identify focusable elements", function() {
      const elements: IdbAccessibilityElement[] = [
        {
          "AXFrame": "{{0, 0}, {100, 100}}",
          "AXUniqueId": null,
          "frame": { "y": 0, "x": 0, "width": 100, "height": 100 },
          "role_description": "text field",
          "AXLabel": "Input Field",
          "content_required": false,
          "type": "TextField",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXTextField",
          "subrole": null
        },
        {
          "AXFrame": "{{0, 100}, {100, 100}}",
          "AXUniqueId": null,
          "frame": { "y": 100, "x": 0, "width": 100, "height": 100 },
          "role_description": "heading",
          "AXLabel": "Title",
          "content_required": false,
          "type": "Heading",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXHeading",
          "subrole": null
        }
      ];

      const result = idb.parseAccessibilityToViewHierarchy(elements);
      const rootNode = result.hierarchy.node!;

      expect(rootNode.$).to.have.property("focusable", "true"); // TextField type

      const childNodes = rootNode.node!;
      expect(childNodes[0].$).to.have.property("focusable", "false"); // Heading type, not focusable
    });

    it("should correctly map bounds from frame data", function() {
      const elements: IdbAccessibilityElement[] = [
        {
          "AXFrame": "{{10, 20}, {100, 200}}",
          "AXUniqueId": null,
          "frame": { "y": 20, "x": 10, "width": 100, "height": 200 },
          "role_description": "button",
          "AXLabel": "Test",
          "content_required": false,
          "type": "Button",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXButton",
          "subrole": null
        }
      ];

      const result = idb.parseAccessibilityToViewHierarchy(elements);
      const rootNode = result.hierarchy.node!;

      expect(rootNode.$).to.have.property("bounds", "[10,20][110,220]");
      expect(rootNode.bounds).to.deep.equal({
        left: 10,
        top: 20,
        right: 110,
        bottom: 220
      });
    });

    it("should parse real iOS Contacts app accessibility data", function() {
      const contactsElements: IdbAccessibilityElement[] = [
        {
          "AXFrame": "{{0, 0}, {393, 852}}",
          "AXUniqueId": null,
          "frame": { "y": 0, "x": 0, "width": 393, "height": 852 },
          "role_description": "application",
          "AXLabel": "Contacts",
          "content_required": false,
          "type": "Application",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXApplication",
          "subrole": null
        },
        {
          "AXFrame": "{{0, 249.66666666666666}, {393, 43.999999999999972}}",
          "AXUniqueId": null,
          "frame": { "y": 249.66666666666666, "x": 0, "width": 393, "height": 43.999999999999972 },
          "role_description": "text",
          "AXLabel": "John Appleseed",
          "content_required": false,
          "type": "StaticText",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXStaticText",
          "subrole": null
        },
        {
          "AXFrame": "{{0, 341.66666666666663}, {393, 44}}",
          "AXUniqueId": null,
          "frame": { "y": 341.66666666666663, "x": 0, "width": 393, "height": 44 },
          "role_description": "text",
          "AXLabel": "Kate Bell",
          "content_required": false,
          "type": "StaticText",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXStaticText",
          "subrole": null
        }
      ];

      const result = idb.parseAccessibilityToViewHierarchy(contactsElements);

      expect(result).to.have.property("hierarchy");
      expect(result.hierarchy).to.have.property("node");

      const rootNode = result.hierarchy.node!;
      expect(rootNode.$).to.have.property("text", "Contacts");
      expect(rootNode.$).to.have.property("class", "Application");
      expect(rootNode.$).to.have.property("ios-role", "AXApplication");

      expect(rootNode.node).to.be.an("array").with.length(2);

      const johnContact = rootNode.node![0];
      expect(johnContact.$).to.have.property("text", "John Appleseed");
      expect(johnContact.$).to.have.property("class", "StaticText");
      expect(johnContact.$).to.have.property("clickable", "true"); // StaticText is considered clickable

      const kateBell = rootNode.node![1];
      expect(kateBell.$).to.have.property("text", "Kate Bell");
      expect(kateBell.$).to.have.property("class", "StaticText");

      // Verify bounds calculation for real coordinates
      expect(johnContact.bounds).to.deep.equal({
        left: 0,
        top: 249.66666666666666,
        right: 393,
        bottom: 293.66666666666663 // 249.66... + 43.999...
      });
    });
  });

  describe("getViewHierarchy", function() {
    it("should call describeAll and parse the result", async function() {
      const mockAccessibilityData = [
        {
          "AXFrame": "{{0, 0}, {393, 852}}",
          "AXUniqueId": null,
          "frame": { "y": 0, "x": 0, "width": 393, "height": 852 },
          "role_description": "application",
          "AXLabel": "Test App",
          "content_required": false,
          "type": "Application",
          "title": null,
          "help": null,
          "custom_actions": [],
          "AXValue": null,
          "enabled": true,
          "role": "AXApplication",
          "subrole": null
        }
      ];

      mockExecAsync = async (command: string): Promise<ExecResult> => {
        if (command.includes("ui describe-all")) {
          return {
            stdout: JSON.stringify(mockAccessibilityData),
            stderr: "",
            toString: () => JSON.stringify(mockAccessibilityData),
            trim: () => JSON.stringify(mockAccessibilityData),
            includes: (str: string) => JSON.stringify(mockAccessibilityData).includes(str)
          };
        }
        if (command.includes("list-targets")) {
          // Mock the list-targets command to return a connected device
          const mockTarget = {
            udid: "test-ios-device-id",
            name: "Test iOS Device",
            target_type: "simulator",
            state: "Booted",
            os_version: "17.0",
            architecture: "x86_64",
            companion_info: {
              udid: "test-ios-device-id",
              is_local: true,
              pid: 12345,
              address: { path: "/tmp/test" },
              metadata: {}
            },
            screen_dimensions: null,
            model: null,
            device: null,
            extended: {},
            diagnostics: {},
            metadata: {}
          };
          return {
            stdout: JSON.stringify(mockTarget),
            stderr: "",
            toString: () => JSON.stringify(mockTarget),
            trim: () => JSON.stringify(mockTarget),
            includes: (str: string) => JSON.stringify(mockTarget).includes(str)
          };
        }
        return { stdout: "", stderr: "", toString: () => "", trim: () => "", includes: () => false };
      };

      idb = new IdbPython(mockDevice, mockExecAsync);

      const result = await idb.getViewHierarchy();

      expect(result).to.have.property("hierarchy");
      expect(result.hierarchy).to.have.property("node");
      expect(result.hierarchy.node!.$).to.have.property("text", "Test App");
    });

    it("should handle JSON parsing errors gracefully", async function() {
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        if (command.includes("ui describe-all")) {
          return {
            stdout: "invalid json",
            stderr: "",
            toString: () => "invalid json",
            trim: () => "invalid json",
            includes: () => false
          };
        }
        return { stdout: "", stderr: "", toString: () => "", trim: () => "", includes: () => false };
      };

      idb = new IdbPython(mockDevice, mockExecAsync);

      const result = await idb.getViewHierarchy();

      expect(result).to.have.property("hierarchy");
      expect(result.hierarchy).to.have.property("error", "Failed to retrieve iOS view hierarchy");
    });
  });

  describe("isAvailable", function() {
    it("should return true when idb is available", async function() {
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        if (command.includes("idb --version")) {
          return {
            stdout: "idb version 1.0.0",
            stderr: "",
            toString: () => "idb version 1.0.0",
            trim: () => "idb version 1.0.0",
            includes: () => false
          };
        }
        return { stdout: "", stderr: "", toString: () => "", trim: () => "", includes: () => false };
      };

      idb = new IdbPython(null, mockExecAsync);

      const available = await idb.isAvailable();
      expect(available).to.be.true;
    });

    it("should return false when idb is not available", async function() {
      mockExecAsync = async (command: string): Promise<ExecResult> => {
        throw new Error("Command not found: idb");
      };

      idb = new IdbPython(null, mockExecAsync);

      const available = await idb.isAvailable();
      expect(available).to.be.false;
    });
  });
});
