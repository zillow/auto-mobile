import { expect } from "chai";
import { SourceMapper } from "../../src/utils/sourceMapper";
import path from "path";

describe("SourceMapper", function() {
  this.timeout(120000);
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
      const result = await sourceMapper.scanProject("/nonexistent/path", "com.example.app");

      expect(result).to.have.property("modules");
      expect(result).to.have.property("totalModules");
      expect(result).to.have.property("applicationModules");
      expect(result).to.not.have.property("gradlePlugins");
      expect(result).to.not.have.property("mavenDependencies");
      expect(result).to.not.have.property("currentApplicationModule");
      expect(result.modules).to.be.an("array");
      expect(result.totalModules).to.be.a("number");
      expect(result.applicationModules).to.be.an("array");
    });

    it("should cache module discovery results", async () => {
      const projectRoot = "/test/project";

      // First call
      const result1 = await sourceMapper.scanProject(projectRoot, "com.example.app");

      // Second call should use cache
      const result2 = await sourceMapper.scanProject(projectRoot, "com.example.app");

      expect(result1).to.deep.equal(result2);
    });

    it("should handle projects with no Android modules", async () => {
      const result = await sourceMapper.scanProject("/nonexistent/path", "com.example.app");

      expect(result.modules).to.have.length(0);
      expect(result.applicationModules).to.have.length(0);
      expect(result.totalModules).to.equal(0);
    });

    it("should handle AutoMobile Android Playground", async function() {
      const currentDir = process.cwd();
      const androidPath = path.join(currentDir, "android");
      const result = await sourceMapper.scanProject(androidPath, "com.zillow.automobile.playground");

      expect(result.modules).to.have.length(16);
      expect(result.applicationModules).to.be.an("array");
      expect(result.applicationModules).to.have.length(2);
      expect(result.totalModules).to.equal(16);
      expect(result.gradlePlugins).to.be.an("array");
      expect(result.mavenDependencies).to.be.an("array");
      if (result.currentApplicationModule) {
        expect(result.currentApplicationModule).to.have.property("absolutePath");
        expect(result.currentApplicationModule).to.have.property("applicationId");
        expect(result.currentApplicationModule).to.have.property("gradleTasks");
        expect(result.currentApplicationModule.gradleTasks).to.be.an("array");
      }
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
        customViews: [],
        composables: []
      };

      const sourceAnalysis = await sourceMapper.mapViewHierarchyToModule(analysis, "/test/project", "com.example.app");
      console.log(sourceAnalysis);

      expect(sourceAnalysis).to.have.property("primaryActivity");
      expect(sourceAnalysis).to.have.property("fragments");
      expect(sourceAnalysis).to.have.property("packageHints");
      expect(sourceAnalysis).to.have.property("confidence");
      expect(sourceAnalysis.confidence).to.be.a("number");
      expect(sourceAnalysis.confidence).to.be.at.least(0);
      expect(sourceAnalysis.confidence).to.be.at.most(1);
    });

    it("should map view hierarchy to app module for AutoMobile Playground", async () => {
      const analysis = {
        activityClasses: ["com.zillow.automobile.playground.MainActivity"],
        fragmentClasses: [],
        packageHints: ["com.zillow.automobile.playground"],
        resourceIds: [],
        customViews: [],
        composables: []
      };

      const currentDir = process.cwd();
      const androidPath = path.join(currentDir, "android");
      const sourceAnalysis = await sourceMapper.mapViewHierarchyToModule(analysis, androidPath, "com.zillow.automobile.playground");
      console.log(sourceAnalysis);

      expect(sourceAnalysis).to.have.property("primaryActivity");
      expect(sourceAnalysis).to.have.property("fragments");
      expect(sourceAnalysis).to.have.property("packageHints");
      expect(sourceAnalysis).to.have.property("confidence");
      expect(sourceAnalysis.confidence).to.be.a("number");
      expect(sourceAnalysis.confidence).to.be.at.least(0);
      expect(sourceAnalysis.confidence).to.be.at.most(1);
    });

    it("should map view hierarchy to discover module for AutoMobile Playground", async () => {
      const analysis = {
        activityClasses: ["com.zillow.automobile.playground.MainActivity"],
        fragmentClasses: [],
        packageHints: ["com.zillow.automobile.discover"],
        resourceIds: [],
        customViews: [],
        composables: []
      };

      const currentDir = process.cwd();
      const androidPath = path.join(currentDir, "android");
      const sourceAnalysis = await sourceMapper.mapViewHierarchyToModule(analysis, androidPath, "com.zillow.automobile.playground");
      console.log(sourceAnalysis);

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

      const result = await sourceMapper.determineTestPlanLocation(sourceAnalysis, "/test/project", "com.example.app");

      expect(result).to.have.property("success");
      expect(result).to.have.property("targetDirectory");
      expect(result).to.have.property("moduleName");
      expect(result).to.have.property("confidence");
      expect(result).to.have.property("reasoning");
    });
  });

  describe("indexSourceFiles", () => {
    it("should index source files for AutoMobile Playground", async function() {

      const currentDir = process.cwd();
      console.log(`currentDir: ${currentDir}`);
      const androidPath = path.join(currentDir, "android");
      console.log(`androidPath: ${androidPath}`);
      const appId = "com.zillow.automobile.playground";

      const result = await sourceMapper.indexSourceFiles(appId, androidPath);

      expect(result).to.have.property("activities");
      expect(result).to.have.property("fragments");
      expect(result).to.have.property("views");
      expect(result).to.have.property("lastIndexed");

      expect(result.activities).to.be.instanceOf(Map);
      expect(result.fragments).to.be.instanceOf(Map);
      expect(result.views).to.be.instanceOf(Map);
      expect(result.lastIndexed).to.be.a("number");

      // Check that we found some activities
      expect(result.activities.size).to.be.greaterThan(0);

      const activities = Array.from(result.activities.values());

      // Verify activity structure - find activities by package name since order is not guaranteed
      const accessibilityActivity = activities.find(activity =>
        activity.packageName === "com.zillow.automobile.accessibilityservice"
      );
      const playgroundActivity = activities.find(activity =>
        activity.packageName === "com.zillow.automobile.playground"
      );

      expect(accessibilityActivity).to.not.be.undefined;
      expect(accessibilityActivity!.className).to.equal("MainActivity");
      expect(accessibilityActivity!.packageName).to.equal("com.zillow.automobile.accessibilityservice");
      expect(accessibilityActivity!.fullClassName).to.equal("com.zillow.automobile.accessibilityservice.MainActivity");
      expect(accessibilityActivity!.sourceFile).to.equal(`${androidPath}/accessibility-service/src/main/java/com/zillow/automobile/accessibilityservice/MainActivity.kt`);

      expect(playgroundActivity).to.not.be.undefined;
      expect(playgroundActivity!.className).to.equal("MainActivity");
      expect(playgroundActivity!.packageName).to.equal("com.zillow.automobile.playground");
      expect(playgroundActivity!.fullClassName).to.equal("com.zillow.automobile.playground.MainActivity");
      expect(playgroundActivity!.sourceFile).to.equal(`${androidPath}/playground/app/src/main/java/com/zillow/automobile/playground/MainActivity.kt`);

      expect(result.fragments.size).to.be.equal(0);
      expect(result.views.size).to.be.equal(0);
      expect(result.composables.size).to.be.equal(95);
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
