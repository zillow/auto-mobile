import { describe, it, expect, beforeEach, mock } from "bun:test";
import { NavigationNodeLookup, resetNavigationNodeLookup } from "../../../src/features/performance/NavigationNodeLookup";
import { NavigationRepository } from "../../../src/db/NavigationRepository";

// Mock NavigationRepository
const mockRepository = {
  getNode: mock(() => Promise.resolve(null)),
} as unknown as NavigationRepository;

describe("NavigationNodeLookup", () => {
  let lookup: NavigationNodeLookup;

  beforeEach(() => {
    resetNavigationNodeLookup();
    lookup = new NavigationNodeLookup(mockRepository, 1000);
    mockRepository.getNode = mock(() => Promise.resolve(null));
  });

  describe("getNodeId", () => {
    it("returns null when screenName is null", async () => {
      const result = await lookup.getNodeId("com.example.app", null);
      expect(result).toBeNull();
      expect(mockRepository.getNode).not.toHaveBeenCalled();
    });

    it("returns nodeId when node exists", async () => {
      mockRepository.getNode = mock(() => Promise.resolve({ id: 42, screen_name: "Home" }));
      const result = await lookup.getNodeId("com.example.app", "Home");
      expect(result).toBe(42);
    });

    it("returns null when node does not exist", async () => {
      mockRepository.getNode = mock(() => Promise.resolve(null));
      const result = await lookup.getNodeId("com.example.app", "NonExistent");
      expect(result).toBeNull();
    });

    it("caches results", async () => {
      mockRepository.getNode = mock(() => Promise.resolve({ id: 123, screen_name: "Settings" }));

      // First call hits the repository
      const result1 = await lookup.getNodeId("com.example.app", "Settings");
      expect(result1).toBe(123);
      expect(mockRepository.getNode).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await lookup.getNodeId("com.example.app", "Settings");
      expect(result2).toBe(123);
      expect(mockRepository.getNode).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it("caches null results", async () => {
      mockRepository.getNode = mock(() => Promise.resolve(null));

      await lookup.getNodeId("com.example.app", "Missing");
      await lookup.getNodeId("com.example.app", "Missing");

      // Should only call repository once
      expect(mockRepository.getNode).toHaveBeenCalledTimes(1);
    });

    it("different app/screen combinations have separate cache entries", async () => {
      mockRepository.getNode = mock(async (appId: string, screenName: string) => {
        if (appId === "app1" && screenName === "Home") {return { id: 1, screen_name: "Home" };}
        if (appId === "app2" && screenName === "Home") {return { id: 2, screen_name: "Home" };}
        return null;
      });

      const result1 = await lookup.getNodeId("app1", "Home");
      const result2 = await lookup.getNodeId("app2", "Home");

      expect(result1).toBe(1);
      expect(result2).toBe(2);
      expect(mockRepository.getNode).toHaveBeenCalledTimes(2);
    });
  });

  describe("clearCache", () => {
    it("clears all cached entries", async () => {
      mockRepository.getNode = mock(() => Promise.resolve({ id: 1, screen_name: "Home" }));

      await lookup.getNodeId("com.example.app", "Home");
      expect(lookup.getCacheSize()).toBe(1);

      lookup.clearCache();
      expect(lookup.getCacheSize()).toBe(0);

      // Next call should hit repository again
      await lookup.getNodeId("com.example.app", "Home");
      expect(mockRepository.getNode).toHaveBeenCalledTimes(2);
    });
  });

  describe("cache expiration", () => {
    it("returns fresh data after cache expires", async () => {
      // Use a very short cache time for testing
      const shortCacheLookup = new NavigationNodeLookup(mockRepository, 10); // 10ms

      mockRepository.getNode = mock(() => Promise.resolve({ id: 100, screen_name: "Test" }));

      await shortCacheLookup.getNodeId("app", "Test");
      expect(mockRepository.getNode).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 20));

      // Now a new value should be returned from repository
      mockRepository.getNode = mock(() => Promise.resolve({ id: 200, screen_name: "Test" }));
      const result = await shortCacheLookup.getNodeId("app", "Test");
      expect(result).toBe(200);
    });
  });
});
