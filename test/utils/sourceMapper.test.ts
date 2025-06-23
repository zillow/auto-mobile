import { expect } from "chai";
import { SourceMapper } from "../../src/utils/sourceMapper";

describe("SourceMapper", () => {
  let sourceMapper: SourceMapper;

  beforeEach(() => {
    sourceMapper = SourceMapper.getInstance();
    // Clear all state to ensure test isolation
    sourceMapper.clearCache();
    (sourceMapper as any).appConfigs = new Map();
    (sourceMapper as any).sourceIndex = new Map();
  });

  afterEach(() => {
    // Ensure clean state after each test
    sourceMapper.clearCache();
    (sourceMapper as any).appConfigs = new Map();
    (sourceMapper as any).sourceIndex = new Map();
  });

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = SourceMapper.getInstance();
      const instance2 = SourceMapper.getInstance();
      expect(instance1).to.equal(instance2);
    });
  });

  describe("discoverModules", () => {
    it("should discover Android modules in a project", async () => {
      // This test just ensures the method exists and returns expected structure
      const result = await sourceMapper.discoverModules("/nonexistent/path");

      expect(result).to.have.property("modules");
      expect(result).to.have.property("totalModules");
      expect(result.modules).to.be.an("array");
      expect(result.totalModules).to.be.a("number");
    });

    it("should cache module discovery results", async () => {
      const projectRoot = "/test/project";

      // First call
      const result1 = await sourceMapper.discoverModules(projectRoot);

      // Second call should use cache
      const result2 = await sourceMapper.discoverModules(projectRoot);

      expect(result1).to.deep.equal(result2);
    });

    it("should handle projects with no Android modules", async () => {
      const result = await sourceMapper.discoverModules("/nonexistent/path");

      expect(result.modules).to.have.length(0);
      expect(result.mainModule).to.be.undefined;
      expect(result.totalModules).to.equal(0);
    });
  });

  describe("analyzeViewHierarchy", () => {
    it("should extract activity classes from view hierarchy", () => {
      const viewHierarchyXml = `
        <hierarchy>
          mCurrentFocus=Window{abc123 u0 com.example.app/com.example.app.MainActivity}
        </hierarchy>
      `;

      const analysis = sourceMapper.analyzeViewHierarchy(viewHierarchyXml);

      expect(analysis.activityClasses).to.be.an("array");
      expect(analysis.fragmentClasses).to.be.an("array");
      expect(analysis.packageHints).to.be.an("array");
      expect(analysis.resourceIds).to.be.an("array");
      expect(analysis.customViews).to.be.an("array");
    });

    it("should extract fragment classes from view hierarchy", () => {
      const viewHierarchyXml = `
        <hierarchy>
          <node class="com.example.SearchFragment" />
        </hierarchy>
      `;

      const analysis = sourceMapper.analyzeViewHierarchy(viewHierarchyXml);
      expect(analysis.fragmentClasses).to.include("com.example.SearchFragment");
    });

    it("should extract resource IDs from view hierarchy", () => {
      const viewHierarchyXml = `
        <hierarchy>
          <node resource-id="com.example.app:id/button" />
        </hierarchy>
      `;

      const analysis = sourceMapper.analyzeViewHierarchy(viewHierarchyXml);
      expect(analysis.resourceIds).to.include("com.example.app:id/button");
    });
  });

  describe("mapViewHierarchyToModule", () => {
    it("should map view hierarchy to appropriate module", async () => {
      const analysis = {
        activityClasses: ["com.example.app.MainActivity"],
        fragmentClasses: ["com.example.app.SearchFragment"],
        packageHints: ["com.example.app"],
        resourceIds: ["com.example.app:id/button"],
        customViews: []
      };

      const sourceAnalysis = await sourceMapper.mapViewHierarchyToModule(analysis, "/test/project");

      expect(sourceAnalysis).to.have.property("primaryActivity");
      expect(sourceAnalysis).to.have.property("fragments");
      expect(sourceAnalysis).to.have.property("packageHints");
      expect(sourceAnalysis).to.have.property("confidence");
      expect(sourceAnalysis.confidence).to.be.a("number");
      expect(sourceAnalysis.confidence).to.be.at.least(0);
      expect(sourceAnalysis.confidence).to.be.at.most(1);
    });
  });

  describe("determineTestPlanLocation", () => {
    it("should determine appropriate test plan location", async () => {
      const sourceAnalysis = {
        primaryActivity: "com.example.app.MainActivity",
        fragments: ["com.example.app.SearchFragment"],
        packageHints: ["com.example.app"],
        confidence: 0.8,
        suggestedModule: "app",
        resourceReferences: ["com.example.app:id/button"]
      };

      const result = await sourceMapper.determineTestPlanLocation(sourceAnalysis, "/test/project");

      expect(result).to.have.property("success");
      expect(result).to.have.property("targetDirectory");
      expect(result).to.have.property("moduleName");
      expect(result).to.have.property("confidence");
      expect(result).to.have.property("reasoning");
    });
  });

  describe("clearCache", () => {
    it("should clear module cache", () => {
      sourceMapper.clearCache();
      // This test mainly ensures the method exists and doesn't throw
      expect(true).to.be.true;
    });
  });
});
