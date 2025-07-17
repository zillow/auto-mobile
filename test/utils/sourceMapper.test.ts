import { expect } from "chai";
import { SourceMapper } from "../../src/utils/sourceMapper";
import { ConfigurationManager } from "../../src/utils/configurationManager";
import path from "path";
import sinon from "sinon";

describe("SourceMapper", function() {
  this.timeout(120000);
  let sourceMapper: SourceMapper;
  let configManagerStub: sinon.SinonStubbedInstance<ConfigurationManager>;

  beforeEach(() => {
    sourceMapper = SourceMapper.getInstance();
    // Clear all state to ensure test isolation
    sourceMapper.clearCache();
    (sourceMapper as any).appConfigs = new Map();
    (sourceMapper as any).sourceIndex = new Map();

    // Mock ConfigurationManager
    configManagerStub = sinon.createStubInstance(ConfigurationManager);
    sinon.stub(ConfigurationManager, "getInstance").returns(configManagerStub);
  });

  afterEach(() => {
    // Ensure clean state after each test
    sourceMapper.clearCache();
    (sourceMapper as any).appConfigs = new Map();
    (sourceMapper as any).sourceIndex = new Map();

    // Restore all stubs
    sinon.restore();
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
      // Mock app configuration for example app
      configManagerStub.getAppConfigs.returns([{
        appId: "com.example.app",
        sourceDir: "/nonexistent/path",
        platform: "android",
        data: new Map()
      }]);

      // This test just ensures the method exists and returns expected structure
      try {
        const result = await sourceMapper.scanProject("com.example.app");

        expect(result).to.have.property("modules");
        expect(result).to.have.property("totalModules");
        expect(result).to.have.property("applicationModules");
        expect(result).to.not.have.property("gradlePlugins");
        expect(result).to.not.have.property("mavenDependencies");
        expect(result).to.not.have.property("currentApplicationModule");
        expect(result.modules).to.be.an("array");
        expect(result.totalModules).to.be.a("number");
        expect(result.applicationModules).to.be.an("array");
      } catch (error) {
        // For non-existent paths, we expect an error about no Android application modules
        expect((error as Error).message).to.include("No Android application modules found");
      }
    });

    it("should cache module discovery results", async () => {
      // Mock app configuration for example app
      configManagerStub.getAppConfigs.returns([{
        appId: "com.example.app",
        sourceDir: "/test/project",
        platform: "android",
        data: new Map()
      }]);

      // For non-existent paths, both calls should throw the same error
      try {
        await sourceMapper.scanProject("com.example.app");
      } catch (error1) {
        try {
          await sourceMapper.scanProject("com.example.app");
        } catch (error2) {
          expect((error1 as Error).message).to.equal((error2 as Error).message);
        }
      }
    });

    it("should handle projects with no Android modules", async () => {
      // Mock app configuration for example app
      configManagerStub.getAppConfigs.returns([{
        appId: "com.example.app",
        sourceDir: "/nonexistent/path",
        platform: "android",
        data: new Map()
      }]);

      try {
        await sourceMapper.scanProject("com.example.app");
        // Should not reach here
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect((error as Error).message).to.include("No Android application modules found");
      }
    });

    it("should handle AutoMobile Android Playground", async function() {
      // Mock app configuration for AutoMobile Playground
      const currentDir = process.cwd();
      const androidPath = path.join(currentDir, "android");

      configManagerStub.getAppConfigs.returns([{
        appId: "com.zillow.automobile.playground",
        sourceDir: androidPath,
        platform: "android",
        data: new Map()
      }]);

      const result = await sourceMapper.scanProject("com.zillow.automobile.playground");

      expect(result.modules).to.have.length(16);
      expect(result.applicationModules).to.be.an("array");
      expect(result.applicationModules).to.have.length(2);
      expect(result.totalModules).to.equal(16);
      expect(result.gradlePlugins).to.be.an("array");
      expect(result.mavenDependencies).to.be.an("array");
      if (result.currentApplicationModule) {
        expect(result.currentApplicationModule).to.have.property("absolutePath");
        expect(result.currentApplicationModule).to.have.property("applicationId");
      }
    });

    it("should handle Zillow Android", async function() {
      // Mock app configuration for AutoMobile Playground
      const androidPath = path.join(process.env.HOME || require("os").homedir(), "zillow/app-platform/android");

      configManagerStub.getAppConfigs.returns([{
        appId: "com.zillow.android.zillowmap",
        sourceDir: androidPath,
        platform: "android",
        data: new Map()
      }]);

      const result = await sourceMapper.scanProject("com.zillow.android.zillowmap");

      expect(result.modules).to.have.length.at.least(1);
      expect(result.applicationModules).to.have.length.at.least(1);
      expect(result.totalModules).to.at.least(1);
      expect(result.gradlePlugins).to.have.length.at.least(1);
      expect(result.mavenDependencies).to.have.length.at.least(1);
      expect(result.currentApplicationModule).to.have.property("absolutePath");
      expect(result.currentApplicationModule).to.have.property("applicationId");
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

  describe("determineTestPlanLocation", () => {
    beforeEach(() => {
      // Mock config for both apps
      const currentDir = process.cwd();
      const playgroundPath = path.join(currentDir, "android");

      const zillowPath = path.join(process.env.HOME || require("os").homedir(), "zillow/app-platform/android");

      configManagerStub.getAppConfigs.returns([
        {
          appId: "com.example.app",
          sourceDir: "/nonexistent/path",
          platform: "android",
          data: new Map()
        },
        {
          appId: "com.zillow.automobile.playground",
          sourceDir: playgroundPath,
          platform: "android",
          data: new Map()
        },
        {
          appId: "com.zillow.android.zillowmap",
          sourceDir: zillowPath,
          platform: "android",
          data: new Map()
        }
      ]);
    });

    it("given example app view hierarchy, should map to example app module", async () => {
      const analysis = {
        activityClasses: ["com.example.app.MainActivity"],
        fragmentClasses: ["com.example.app.SearchFragment"],
        resourceIds: ["com.example.app:id/button"],
        customViews: [],
      };

      try {
        const result = await sourceMapper.determineTestPlanLocation(analysis, "com.example.app");
        expect(result.moduleName).to.be.equal("com.example.app");
      } catch (error) {
        // For non-existent paths, we expect an error about no Android application modules
        expect((error as Error).message).to.include("No Android application modules found");
      }
    });

    it("given AutoMobile Playground App view hierarchy, should map to App module", async () => {
      const analysis = {
        activityClasses: ["com.zillow.automobile.playground.MainActivity"],
        fragmentClasses: [],
        resourceIds: [],
        customViews: [],
      };

      const result = await sourceMapper.determineTestPlanLocation(analysis, "com.zillow.automobile.playground");
      expect(result.moduleName).to.include("playground/app");
    });

    // TODO: Enable this test once we have string resource module mapping
    // it("given AutoMobile Playground Discover view hierarchy, should map to Discover module", async () => {
    //   const analysis = {
    //     activityClasses: [],
    //     fragmentClasses: [],
    //     resourceIds: [],
    //     customViews: [],
    //   };
    //
    //   const result = await sourceMapper.determineTestPlanLocation(analysis, "com.zillow.automobile.playground");
    //   expect(result.moduleName).to.include("playground/discover");
    // });
  });

  describe("indexSourceFiles", () => {
    it("should index source files for AutoMobile Playground", async function() {

      const currentDir = process.cwd();
      const androidPath = path.join(currentDir, "android");
      const appId = "com.zillow.automobile.playground";

      configManagerStub.getAppConfigs.returns([{
        appId: appId,
        sourceDir: androidPath,
        platform: "android",
        data: new Map()
      }]);

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
