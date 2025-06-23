import { expect } from "chai";
import * as sinon from "sinon";
import { SourceMapper } from "../../src/utils/sourceMapper";
import {
  ActivityInfo,
  FragmentInfo,
  ViewInfo,
  SourceIndexResult
} from "../../src/models/SourceIndexing";

describe("SourceMapper - Source Indexing", () => {
  let sourceMapper: SourceMapper;

  beforeEach(() => {
    sourceMapper = SourceMapper.getInstance();
    // Clear all state
    sourceMapper.clearCache();

    // Reset the internal app configs by creating a fresh instance
    // Since it's a singleton, we need to clear the internal state
    (sourceMapper as any).appConfigs = new Map();
    (sourceMapper as any).sourceIndex = new Map();
  });

  afterEach(() => {
    sinon.restore();
    // Ensure clean state after each test
    sourceMapper.clearCache();
    (sourceMapper as any).appConfigs = new Map();
    (sourceMapper as any).sourceIndex = new Map();
  });

  describe("App Configuration Management", () => {
    it("should add app configuration", async () => {
      const appId = "com.example.testapp";
      const sourceDir = "/test/source";

      // Mock file system check
      const fsExistsStub = sinon.stub(require("fs"), "existsSync").returns(true);

      await sourceMapper.addAppConfig(appId, sourceDir);

      const configs = sourceMapper.getAppConfigs();
      expect(configs).to.have.length(1);
      expect(configs[0].appId).to.equal(appId);
      expect(configs[0].sourceDir).to.equal(sourceDir);

      fsExistsStub.restore();
    });

    it("should throw error for non-existent source directory", async () => {
      const appId = "com.example.testapp";
      const sourceDir = "/nonexistent/path";

      const fsExistsStub = sinon.stub(require("fs"), "existsSync").returns(false);

      try {
        await sourceMapper.addAppConfig(appId, sourceDir);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect((error as Error).message).to.include("Source directory does not exist");
      }

      fsExistsStub.restore();
    });

    it("should get source directory for app ID", async () => {
      const appId = "com.example.testapp";
      const sourceDir = "/test/source";

      const fsExistsStub = sinon.stub(require("fs"), "existsSync").returns(true);

      await sourceMapper.addAppConfig(appId, sourceDir);

      const retrievedSourceDir = sourceMapper.getSourceDir(appId);
      expect(retrievedSourceDir).to.equal(sourceDir);

      const nonExistentSourceDir = sourceMapper.getSourceDir("com.nonexistent.app");
      expect(nonExistentSourceDir).to.be.null;

      fsExistsStub.restore();
    });

    it("should return empty array for no configurations", () => {
      const configs = sourceMapper.getAppConfigs();
      expect(configs).to.be.an("array");
      expect(configs).to.have.length(0);
    });
  });

  describe("Source File Finding", () => {
    it("should find activity info by package name", async () => {
      const appId = "com.example.testapp";

      // Mock getSourceIndex to return mock data
      const mockActivityInfo: ActivityInfo = {
        className: "MainActivity",
        packageName: "com.example.testapp",
        fullClassName: "com.example.testapp.MainActivity",
        sourceFile: "/test/source/MainActivity.java"
      };

      const mockSourceIndex: SourceIndexResult = {
        activities: new Map([["com.example.testapp.MainActivity", mockActivityInfo]]),
        fragments: new Map(),
        views: new Map(),
        lastIndexed: Date.now()
      };

      const getSourceIndexStub = sinon.stub(sourceMapper, "getSourceIndex").resolves(mockSourceIndex);

      const result = await sourceMapper.findActivityInfo(appId, "com.example.testapp.MainActivity");

      expect(result).to.deep.equal(mockActivityInfo);
      expect(getSourceIndexStub.calledWith(appId)).to.be.true;

      getSourceIndexStub.restore();
    });

    it("should find fragment info by class name", async () => {
      const appId = "com.example.testapp";

      const mockFragmentInfo: FragmentInfo = {
        className: "SearchFragment",
        packageName: "com.example.testapp.search",
        fullClassName: "com.example.testapp.search.SearchFragment",
        sourceFile: "/test/source/SearchFragment.java"
      };

      const mockSourceIndex: SourceIndexResult = {
        activities: new Map(),
        fragments: new Map([["com.example.testapp.search.SearchFragment", mockFragmentInfo]]),
        views: new Map(),
        lastIndexed: Date.now()
      };

      const getSourceIndexStub = sinon.stub(sourceMapper, "getSourceIndex").resolves(mockSourceIndex);

      const result = await sourceMapper.findFragmentInfo(appId, "SearchFragment");

      expect(result).to.deep.equal(mockFragmentInfo);
      expect(getSourceIndexStub.calledWith(appId)).to.be.true;

      getSourceIndexStub.restore();
    });

    it("should find view info by class name", async () => {
      const appId = "com.example.testapp";

      const mockViewInfo: ViewInfo = {
        className: "CustomButtonView",
        packageName: "com.example.testapp.ui",
        fullClassName: "com.example.testapp.ui.CustomButtonView",
        sourceFile: "/test/source/CustomButtonView.java"
      };

      const mockSourceIndex: SourceIndexResult = {
        activities: new Map(),
        fragments: new Map(),
        views: new Map([["com.example.testapp.ui.CustomButtonView", mockViewInfo]]),
        lastIndexed: Date.now()
      };

      const getSourceIndexStub = sinon.stub(sourceMapper, "getSourceIndex").resolves(mockSourceIndex);

      const result = await sourceMapper.findViewInfo(appId, "CustomButtonView");

      expect(result).to.deep.equal(mockViewInfo);
      expect(getSourceIndexStub.calledWith(appId)).to.be.true;

      getSourceIndexStub.restore();
    });

    it("should return null when no source index available", async () => {
      const appId = "com.example.testapp";

      const getSourceIndexStub = sinon.stub(sourceMapper, "getSourceIndex").resolves(null);

      const activityResult = await sourceMapper.findActivityInfo(appId, "MainActivity");
      const fragmentResult = await sourceMapper.findFragmentInfo(appId, "SearchFragment");
      const viewResult = await sourceMapper.findViewInfo(appId, "CustomView");

      expect(activityResult).to.be.null;
      expect(fragmentResult).to.be.null;
      expect(viewResult).to.be.null;

      getSourceIndexStub.restore();
    });

    it("should return null when activity not found", async () => {
      const appId = "com.example.testapp";

      const mockSourceIndex: SourceIndexResult = {
        activities: new Map(),
        fragments: new Map(),
        views: new Map(),
        lastIndexed: Date.now()
      };

      const getSourceIndexStub = sinon.stub(sourceMapper, "getSourceIndex").resolves(mockSourceIndex);

      const result = await sourceMapper.findActivityInfo(appId, "NonExistentActivity");

      expect(result).to.be.null;

      getSourceIndexStub.restore();
    });

    it("should find partial activity matches", async () => {
      const appId = "com.example.testapp";

      const mockActivityInfo: ActivityInfo = {
        className: "MainActivity",
        packageName: "com.example.testapp",
        fullClassName: "com.example.testapp.MainActivity",
        sourceFile: "/test/source/MainActivity.java"
      };

      const mockSourceIndex: SourceIndexResult = {
        activities: new Map([["com.example.testapp.MainActivity", mockActivityInfo]]),
        fragments: new Map(),
        views: new Map(),
        lastIndexed: Date.now()
      };

      const getSourceIndexStub = sinon.stub(sourceMapper, "getSourceIndex").resolves(mockSourceIndex);

      // Should find by partial match
      const result = await sourceMapper.findActivityInfo(appId, "MainActivity");

      expect(result).to.deep.equal(mockActivityInfo);

      getSourceIndexStub.restore();
    });

    it("should prefer fragments in same package as activity", async () => {
      const appId = "com.example.testapp";

      const mockActivityInfo: ActivityInfo = {
        className: "MainActivity",
        packageName: "com.example.testapp.main",
        fullClassName: "com.example.testapp.main.MainActivity",
        sourceFile: "/test/source/MainActivity.java"
      };

      const mockFragmentInfo1: FragmentInfo = {
        className: "SearchFragment",
        packageName: "com.example.testapp.main", // Same package as activity
        fullClassName: "com.example.testapp.main.SearchFragment",
        sourceFile: "/test/source/SearchFragment.java"
      };

      const mockFragmentInfo2: FragmentInfo = {
        className: "SearchFragment",
        packageName: "com.example.testapp.other", // Different package
        fullClassName: "com.example.testapp.other.SearchFragment",
        sourceFile: "/test/source/other/SearchFragment.java"
      };

      const mockSourceIndex: SourceIndexResult = {
        activities: new Map(),
        fragments: new Map([
          ["com.example.testapp.main.SearchFragment", mockFragmentInfo1],
          ["com.example.testapp.other.SearchFragment", mockFragmentInfo2]
        ]),
        views: new Map(),
        lastIndexed: Date.now()
      };

      const getSourceIndexStub = sinon.stub(sourceMapper, "getSourceIndex").resolves(mockSourceIndex);

      const result = await sourceMapper.findFragmentInfo(appId, "SearchFragment", mockActivityInfo);

      expect(result).to.deep.equal(mockFragmentInfo1);
      expect(result?.associatedActivity).to.equal(mockActivityInfo.fullClassName);

      getSourceIndexStub.restore();
    });
  });

  describe("Source Index Management", () => {
    it("should return null when no source directory configured", async () => {
      const appId = "com.example.testapp";

      const result = await sourceMapper.getSourceIndex(appId);

      expect(result).to.be.null;
    });

    it("should handle source indexing errors gracefully", async () => {
      const appId = "com.example.testapp";
      const sourceDir = "/test/source";

      const fsExistsStub = sinon.stub(require("fs"), "existsSync").returns(true);

      await sourceMapper.addAppConfig(appId, sourceDir);

      // Mock the private indexSourceFiles method to throw an error
      const indexStub = sinon.stub(sourceMapper as any, "indexSourceFiles").rejects(new Error("Indexing failed"));

      const result = await sourceMapper.getSourceIndex(appId);

      // Should still return a valid structure even if indexing fails
      expect(result).to.not.be.null;
      expect(result?.activities).to.be.an.instanceof(Map);
      expect(result?.fragments).to.be.an.instanceof(Map);
      expect(result?.views).to.be.an.instanceof(Map);

      fsExistsStub.restore();
      indexStub.restore();
    });
  });

  describe("Cache Management", () => {
    it("should clear cache", () => {
      // Test that clearCache method exists and doesn't throw
      expect(() => sourceMapper.clearCache()).to.not.throw();
    });
  });
});
