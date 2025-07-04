import { expect } from "chai";
import { describe, it } from "mocha";
import path from "path";
import xml2js from "xml2js";
import { ViewHierarchy } from "../../../src/features/observe/ViewHierarchy";
import { AdbUtils } from "../../../src/utils/adb";
import { TakeScreenshot } from "../../../src/features/observe/TakeScreenshot";
import { Window } from "../../../src/features/observe/Window";
import { logger } from "../../../src/utils/logger";
import { readFileAsync } from "../../../src/utils/io";

describe("ViewHierarchy - Sample Data", function() {
  // Set longer timeout for XML parsing
  this.timeout(10000);

  let viewHierarchy: ViewHierarchy;
  let adb: AdbUtils;
  let takeScreenshot: TakeScreenshot;
  let window: Window;

  beforeEach(function() {
    // Initialize with test mode
    adb = new AdbUtils();
    takeScreenshot = new TakeScreenshot("test-device", adb);
    window = new Window("test-device", adb);
    viewHierarchy = new ViewHierarchy("test-device", adb, takeScreenshot, window);
  });

  // Helper function to read and parse XML file
  async function readAndParseXmlFile(filePath: string): Promise<any> {
    // Read the XML file
    const xmlData = await readFileAsync(filePath, "utf8");

    // Remove the UI hierchary dumped message if present
    const uiHierarchyMessage = "UI hierchary dumped to:";
    let cleanedXmlData = xmlData;
    if (cleanedXmlData.includes(uiHierarchyMessage)) {
      const prefixEnd = cleanedXmlData.indexOf(uiHierarchyMessage) + uiHierarchyMessage.length + "/sdcard/window_dump.xml".length + 1;
      cleanedXmlData = cleanedXmlData.substring(prefixEnd);
    }

    // Parse the XML with options to handle hyphenated attributes
    const parser = new xml2js.Parser({
      explicitArray: false,
      attrNameProcessors: [name => {
        // Convert hyphenated attribute names to camelCase (content-desc -> contentDesc)
        return name.replace(/-([a-z])/g, g => g[1].toUpperCase());
      }]
    });
    return parser.parseStringPromise(cleanedXmlData);
  }

  it("should filter the map screen hierarchy and retain useful elements", async function() {
    // Load and parse the map screen XML
    const mapScreenPath = path.join(__dirname, "../../sampleData/viewHierarchy/mapScreen.xml");
    const mapHierarchy = await readAndParseXmlFile(mapScreenPath);

    // Apply filtering
    const filteredHierarchy = viewHierarchy.filterViewHierarchy(mapHierarchy);

    // Verify that filtering didn't remove all elements
    expect(filteredHierarchy).to.exist;
    expect(filteredHierarchy.hierarchy).to.exist;

    // Count elements in the filtered hierarchy to ensure we have some results
    let elementCount = 0;
    function countElements(node: any) {
      if (!node) {return;}

      // Count this node
      elementCount++;

      // Check children
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          countElements(child);
        }
      }

      // If we have a different structure due to filtering
      if (Array.isArray(node)) {
        for (const item of node) {
          countElements(item);
        }
      }
    }

    countElements(filteredHierarchy.hierarchy);
    logger.info(`Map screen filtered hierarchy has ${elementCount} elements`);
    expect(elementCount).to.be.greaterThan(1, "Filtering should retain some elements");

    // Check for specific UI elements that should be retained
    // For map screen, we'd expect to find elements like search box, map markers, etc.
    let hasSearchElements = false;
    let hasMapElements = false;

    viewHierarchy.traverseViewHierarchy(filteredHierarchy.hierarchy, node => {
      // Check for search related elements
      if ((node.$ && node.$["content-desc"] && node.$["content-desc"].includes("Search")) ||
          (node.text && node.text.includes("Search")) ||
          (node.$ && node.$["resource-id"] && node.$["resource-id"].includes("search"))) {
        hasSearchElements = true;
      }

      // Check for map related elements
      if ((node.$ && node.$["content-desc"] && node.$["content-desc"].includes("Map")) ||
          (node.$ && node.$["resource-id"] && node.$["resource-id"].includes("map"))) {
        hasMapElements = true;
      }
    });

    logger.info(`Has search elements: ${hasSearchElements}, Has map elements: ${hasMapElements}`);
    expect(hasSearchElements || hasMapElements).to.be.true;
  });

  it("should filter the favorites screen hierarchy and retain useful elements", async function() {
    // Load and parse the favorites screen XML
    const favoritesScreenPath = path.join(__dirname, "../../sampleData/viewHierarchy/favoritesScreen.xml");
    const favoritesHierarchy = await readAndParseXmlFile(favoritesScreenPath);

    // Apply filtering
    const filteredHierarchy = viewHierarchy.filterViewHierarchy(favoritesHierarchy);

    // Verify that filtering didn't remove all elements
    expect(filteredHierarchy).to.exist;
    expect(filteredHierarchy.hierarchy).to.exist;

    // Count elements in the filtered hierarchy to ensure we have some results
    let elementCount = 0;
    function countElements(node: any) {
      if (!node) {return;}

      // Count this node
      elementCount++;

      // Check children
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          countElements(child);
        }
      }

      // If we have a different structure due to filtering
      if (Array.isArray(node)) {
        for (const item of node) {
          countElements(item);
        }
      }
    }

    countElements(filteredHierarchy.hierarchy);
    logger.info(`Favorites screen filtered hierarchy has ${elementCount} elements`);
    expect(elementCount).to.be.greaterThan(1, "Filtering should retain some elements");

    // Check for specific UI elements that should be retained
    // For favorites screen, we'd expect to find elements like "Saved homes", buttons, etc.
    let hasSavedHomesElements = false;
    let hasButtonElements = false;

    viewHierarchy.traverseViewHierarchy(filteredHierarchy.hierarchy, node => {
      // Check for saved homes related elements
      if ((node.$ && node.$.text && node.$.text.includes("Saved homes")) ||
          (node.text && node.text.includes("Saved homes")) ||
          (node.$ && node.$["content-desc"] && node.$["content-desc"].includes("Saved"))) {
        hasSavedHomesElements = true;
      }

      // Check for button elements
      if ((node.$ && node.$.class && node.$.class.includes("Button")) ||
          (node.$ && node.$["clickable"] === "true")) {
        hasButtonElements = true;
      }
    });

    logger.info(`Has saved homes elements: ${hasSavedHomesElements}, Has button elements: ${hasButtonElements}`);
    expect(hasSavedHomesElements || hasButtonElements).to.be.true;
  });

  it("should verify the structure of filtered elements", async function() {
    const mapScreenPath = path.join(__dirname, "../../sampleData/viewHierarchy/mapScreen.xml");
    const mapHierarchy = await readAndParseXmlFile(mapScreenPath);

    const filteredHierarchy = viewHierarchy.filterViewHierarchy(mapHierarchy);

    let hasUnwantedProperties = false;
    const unwantedProps = ["checkable", "checked", "password", "long-clickable", "selected", "index"];

    viewHierarchy.traverseViewHierarchy(filteredHierarchy.hierarchy, node => {
      if (node.$) {
        for (const prop of unwantedProps) {
          if (prop in node.$) {
            hasUnwantedProperties = true;
            logger.info(`Found unwanted property ${prop} in filtered hierarchy`);
          }
        }
      } else {
        for (const prop of unwantedProps) {
          if (prop in node) {
            hasUnwantedProperties = true;
            logger.info(`Found unwanted property ${prop} in filtered hierarchy`);
          }
        }
      }
    });

    expect(hasUnwantedProperties).to.be.false, "Filtered hierarchy should not contain unwanted properties";

    const clickableElements = await viewHierarchy.findClickableElements(filteredHierarchy);
    logger.info(`Found ${clickableElements.length} clickable elements`);
    expect(clickableElements.length).to.be.greaterThan(0, "Should find clickable elements");

    const textElement = viewHierarchy.findElementByText(filteredHierarchy, "Search", "TextView", true, false);
    logger.info(`Found text element: ${textElement ? "yes" : "no"}`);

    const scrollableElements = viewHierarchy.findScrollableElements(filteredHierarchy);
    logger.info(`Found ${scrollableElements.length} scrollable elements`);

    const hasInteractiveElements = clickableElements.length > 0 || scrollableElements.length > 0 || textElement !== null;
    expect(hasInteractiveElements).to.be.true;
  });
});
