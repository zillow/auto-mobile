import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";
import {
  NAVIGATION_RESOURCE_URIS,
  NavigationGraphResourceContent,
  NavigationNodeResourceContent,
  setNavigationGraphProvider
} from "../../../src/server/navigationResources";
import { FakeNavigationGraphManager } from "../../fakes/FakeNavigationGraphManager";
import { z } from "zod";

describe("MCP Navigation Graph Resource", () => {
  let fixture: McpTestFixture;
  let fakeGraph: FakeNavigationGraphManager;

  beforeAll(async () => {
    fixture = new McpTestFixture();
    await fixture.setup();
  });

  beforeEach(() => {
    fakeGraph = new FakeNavigationGraphManager();
    setNavigationGraphProvider(fakeGraph);
  });

  afterEach(() => {
    setNavigationGraphProvider(null);
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.teardown();
    }
  });

  test("should include navigation graph resource in list", async () => {
    const { client } = fixture.getContext();

    const listResourcesResponseSchema = z.object({
      resources: z.array(z.object({
        uri: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        mimeType: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/list",
      params: {}
    }, listResourcesResponseSchema);

    const resource = result.resources.find(
      (r: any) => r.uri === NAVIGATION_RESOURCE_URIS.GRAPH
    );

    expect(resource).toBeDefined();
    expect(resource?.name).toBe("Navigation Graph");
    expect(resource?.mimeType).toBe("application/json");
  });

  test("should return high-level graph summary", async () => {
    fakeGraph.setCurrentAppId("com.example.app");
    fakeGraph.setCurrentScreenValue("Home");
    fakeGraph.addNode({
      screenName: "Home",
      firstSeenAt: 100,
      lastSeenAt: 200,
      visitCount: 2
    });
    fakeGraph.addNode({
      screenName: "Settings",
      firstSeenAt: 150,
      lastSeenAt: 250,
      visitCount: 1
    });
    fakeGraph.addEdge({
      from: "Home",
      to: "Settings",
      timestamp: 250,
      edgeType: "tool",
      interaction: {
        toolName: "tapOn",
        args: {},
        timestamp: 250
      }
    });

    const { client } = fixture.getContext();
    const readResourceResponseSchema = z.object({
      contents: z.array(z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/read",
      params: {
        uri: NAVIGATION_RESOURCE_URIS.GRAPH
      }
    }, readResourceResponseSchema);

    const content = result.contents[0];
    expect(content.uri).toBe(NAVIGATION_RESOURCE_URIS.GRAPH);
    expect(content.mimeType).toBe("application/json");
    expect(content.text).toBeDefined();

    const graph: NavigationGraphResourceContent = JSON.parse(content.text!);
    expect(graph.appId).toBe("com.example.app");
    expect(graph.currentScreen).toBe("Home");
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes[0]?.id).toBeDefined();
    expect(graph.edges[0]?.toolName).toBe("tapOn");
  });

  test("should include navigation node templates in list", async () => {
    const { client } = fixture.getContext();

    const listResourceTemplatesResponseSchema = z.object({
      resourceTemplates: z.array(z.object({
        uriTemplate: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        mimeType: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/templates/list",
      params: {}
    }, listResourceTemplatesResponseSchema);

    const nodeByIdTemplate = result.resourceTemplates.find(
      (t: any) => t.uriTemplate === NAVIGATION_RESOURCE_URIS.NODE_BY_ID
    );
    const nodeByScreenTemplate = result.resourceTemplates.find(
      (t: any) => t.uriTemplate === NAVIGATION_RESOURCE_URIS.NODE_BY_SCREEN
    );

    expect(nodeByIdTemplate).toBeDefined();
    expect(nodeByScreenTemplate).toBeDefined();
  });

  test("should return navigation node resource by id", async () => {
    fakeGraph.setCurrentAppId("com.example.app");
    fakeGraph.setCurrentScreenValue("Home");
    fakeGraph.addNode({
      screenName: "Home",
      firstSeenAt: 100,
      lastSeenAt: 200,
      visitCount: 2
    });
    fakeGraph.addNode({
      screenName: "Settings",
      firstSeenAt: 150,
      lastSeenAt: 250,
      visitCount: 1
    });
    fakeGraph.addEdge({
      from: "Home",
      to: "Settings",
      timestamp: 250,
      edgeType: "tool",
      interaction: {
        toolName: "tapOn",
        args: {},
        timestamp: 250
      }
    });

    const { client } = fixture.getContext();
    const readResourceResponseSchema = z.object({
      contents: z.array(z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/read",
      params: {
        uri: "automobile:navigation/nodes/1"
      }
    }, readResourceResponseSchema);

    const content = result.contents[0];
    expect(content.text).toBeDefined();

    const nodeResource: NavigationNodeResourceContent = JSON.parse(content.text!);
    expect(nodeResource.node.id).toBe(1);
    expect(nodeResource.node.screenName).toBe("Home");
    expect(nodeResource.isCurrentScreen).toBe(true);
    expect(nodeResource.edgesFrom).toHaveLength(1);
    expect(nodeResource.edgesTo).toHaveLength(0);
  });

  test("should return navigation node resource by screen name", async () => {
    fakeGraph.setCurrentAppId("com.example.app");
    fakeGraph.setCurrentScreenValue("Home");
    fakeGraph.addNode({
      screenName: "Home",
      firstSeenAt: 100,
      lastSeenAt: 200,
      visitCount: 2
    });
    fakeGraph.addNode({
      screenName: "Settings",
      firstSeenAt: 150,
      lastSeenAt: 250,
      visitCount: 1
    });
    fakeGraph.addEdge({
      from: "Home",
      to: "Settings",
      timestamp: 250,
      edgeType: "tool",
      interaction: {
        toolName: "tapOn",
        args: {},
        timestamp: 250
      }
    });

    const { client } = fixture.getContext();
    const readResourceResponseSchema = z.object({
      contents: z.array(z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/read",
      params: {
        uri: "automobile:navigation/nodes?screen=Settings"
      }
    }, readResourceResponseSchema);

    const content = result.contents[0];
    expect(content.text).toBeDefined();

    const nodeResource: NavigationNodeResourceContent = JSON.parse(content.text!);
    expect(nodeResource.node.screenName).toBe("Settings");
    expect(nodeResource.isCurrentScreen).toBe(false);
    expect(nodeResource.edgesFrom).toHaveLength(0);
    expect(nodeResource.edgesTo).toHaveLength(1);
  });
});
