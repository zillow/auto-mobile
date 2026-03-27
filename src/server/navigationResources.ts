import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import { NavigationScreenshotManager } from "../features/navigation/NavigationScreenshotManager";
import { testCoverageAnalyzer } from "../features/navigation/TestCoverageAnalyzer";
import {
  NavigationGraphSummary,
  NavigationGraphSummaryProvider,
  NavigationGraphNodeResource,
  NavigationGraphNodeResourceProvider,
  NavigationGraphHistoryProvider
} from "../utils/interfaces/NavigationGraph";
import { logger } from "../utils/logger";
import { defaultTimer } from "../utils/SystemTimer";

export const NAVIGATION_RESOURCE_URIS = {
  GRAPH: "automobile:navigation/graph",
  GRAPH_WITH_APP_ID: "automobile:navigation/graph?appId={appId}",
  NODE_BY_ID: "automobile:navigation/nodes/{nodeId}",
  NODE_BY_SCREEN: "automobile:navigation/nodes?screen={screenName}",
  NODE_SCREENSHOT: "automobile:navigation/nodes/{nodeId}/screenshot",
  HISTORY: "automobile:navigation/history",
  HISTORY_WITH_CURSOR: "automobile:navigation/history?cursor={cursor}",
  HISTORY_WITH_LIMIT: "automobile:navigation/history?limit={limit}",
  HISTORY_WITH_CURSOR_AND_LIMIT: "automobile:navigation/history?cursor={cursor}&limit={limit}",
  TEST_COVERAGE: "automobile:navigation/test-coverage",
} as const;

export type NavigationGraphResourceContent = NavigationGraphSummary;
export type NavigationNodeResourceContent = NavigationGraphNodeResource;

const GRAPH_RESOURCE_UPDATE_DEBOUNCE_MS = 1000;

type NavigationGraphResourceProvider =
  NavigationGraphSummaryProvider &
  NavigationGraphNodeResourceProvider &
  NavigationGraphHistoryProvider;

let navigationGraphProvider: NavigationGraphResourceProvider | null = null;

function getNavigationGraphProvider(): NavigationGraphResourceProvider {
  return navigationGraphProvider ?? NavigationGraphManager.getInstance();
}
let updateListenerProvider: NavigationGraphSummaryProvider | null = null;
let updateTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleNavigationGraphUpdate(): void {
  if (updateTimeout) {
    return;
  }

  updateTimeout = defaultTimer.setTimeout(() => {
    updateTimeout = null;
    void ResourceRegistry.notifyResourcesUpdated([
      NAVIGATION_RESOURCE_URIS.GRAPH,
      NAVIGATION_RESOURCE_URIS.HISTORY,
    ]);
  }, GRAPH_RESOURCE_UPDATE_DEBOUNCE_MS);
}

function attachGraphUpdateListener(provider: NavigationGraphSummaryProvider): void {
  if (updateListenerProvider?.setGraphUpdateListener) {
    updateListenerProvider.setGraphUpdateListener(null);
  }

  updateListenerProvider = provider;

  if (provider.setGraphUpdateListener) {
    provider.setGraphUpdateListener(scheduleNavigationGraphUpdate);
  }
}

export function setNavigationGraphProvider(provider: NavigationGraphResourceProvider | null): void {
  navigationGraphProvider = provider;
  attachGraphUpdateListener(getNavigationGraphProvider());
}

async function getNavigationGraphResource(appId?: string): Promise<ResourceContent> {
  const uri = appId
    ? `automobile:navigation/graph?appId=${encodeURIComponent(appId)}`
    : NAVIGATION_RESOURCE_URIS.GRAPH;

  try {
    // Use exportGraphSummaryForApp if available and appId is provided
    let graph;
    const provider = getNavigationGraphProvider();
    if (appId && provider.exportGraphSummaryForApp) {
      graph = await provider.exportGraphSummaryForApp(appId);
    } else {
      graph = await provider.exportGraphSummary();
    }

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(graph, null, 2)
    };
  } catch (error) {
    logger.error(`[NavigationResources] Failed to get navigation graph: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve navigation graph: ${error}`
      }, null, 2)
    };
  }
}

async function getNavigationGraphHistoryResource(
  uri: string,
  options: {
    cursor?: string;
    limit?: number;
  } = {}
): Promise<ResourceContent> {
  try {
    const history = await getNavigationGraphProvider().exportGraphHistory(options);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(history, null, 2)
    };
  } catch (error) {
    logger.error(`[NavigationResources] Failed to get navigation history: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve navigation history: ${error}`
      }, null, 2)
    };
  }
}

function buildNavigationNodeError(uri: string, error: string): ResourceContent {
  return {
    uri,
    mimeType: "application/json",
    text: JSON.stringify({ error }, null, 2)
  };
}

async function getNavigationNodeByIdResource(nodeId: number): Promise<ResourceContent> {
  const uri = `automobile:navigation/nodes/${nodeId}`;

  try {
    const nodeResource = await getNavigationGraphProvider().getNodeResourceById(nodeId);
    if (!nodeResource) {
      return buildNavigationNodeError(uri, `Navigation node ${nodeId} not found.`);
    }

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(nodeResource, null, 2)
    };
  } catch (error) {
    logger.error(`[NavigationResources] Failed to get navigation node ${nodeId}: ${error}`);
    return buildNavigationNodeError(uri, `Failed to retrieve navigation node ${nodeId}: ${error}`);
  }
}

async function getNavigationNodeByScreenResource(screenName: string): Promise<ResourceContent> {
  const uri = `automobile:navigation/nodes?screen=${encodeURIComponent(screenName)}`;

  try {
    const nodeResource = await getNavigationGraphProvider().getNodeResourceByScreen(screenName);
    if (!nodeResource) {
      return buildNavigationNodeError(uri, `Navigation node for screen '${screenName}' not found.`);
    }

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(nodeResource, null, 2)
    };
  } catch (error) {
    logger.error(`[NavigationResources] Failed to get navigation node '${screenName}': ${error}`);
    return buildNavigationNodeError(uri, `Failed to retrieve navigation node '${screenName}': ${error}`);
  }
}

function parseHistoryParams(params: Record<string, string>): {
  cursor?: string;
  limit?: number;
} {
  const cursorRaw = params.cursor ? decodeURIComponent(params.cursor).trim() : "";
  const limitRaw = params.limit ? decodeURIComponent(params.limit).trim() : "";

  const cursor = cursorRaw || undefined;
  if (!limitRaw) {
    return { cursor };
  }

  const parsedLimit = Number(limitRaw);
  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    throw new Error(`Invalid history limit: ${params.limit}`);
  }

  return {
    cursor,
    limit: Math.floor(parsedLimit)
  };
}

async function getNavigationNodeScreenshotResource(nodeId: number): Promise<ResourceContent> {
  const uri = `automobile:navigation/nodes/${nodeId}/screenshot`;

  try {
    // Get the node to find its screenshot path
    const nodeResource = await getNavigationGraphProvider().getNodeResourceById(nodeId);
    if (!nodeResource || !nodeResource.node) {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: `Navigation node ${nodeId} not found.` }, null, 2)
      };
    }

    // Get the screenshot path from the database node
    // The node from repository includes screenshot_path
    const appId = NavigationGraphManager.getInstance().getCurrentAppId();
    if (!appId) {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: "No current app set." }, null, 2)
      };
    }

    // Find screenshot for this screen using the screenshot manager
    const screenshotManager = NavigationScreenshotManager.getInstance();
    const screenshotPath = await screenshotManager.findExistingScreenshot(
      appId,
      nodeResource.node.screenName
    );

    if (!screenshotPath) {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: `No screenshot available for node ${nodeId}.` }, null, 2)
      };
    }

    // Read the screenshot file
    const screenshotData = await screenshotManager.readScreenshot(screenshotPath);
    if (!screenshotData) {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: `Screenshot file not found for node ${nodeId}.` }, null, 2)
      };
    }

    // Return as base64-encoded blob
    return {
      uri,
      mimeType: "image/webp",
      blob: screenshotData.toString("base64")
    };
  } catch (error) {
    logger.error(`[NavigationResources] Failed to get screenshot for node ${nodeId}: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({ error: `Failed to retrieve screenshot: ${error}` }, null, 2)
    };
  }
}

export function registerNavigationResources(options: {
  navigationGraph?: NavigationGraphResourceProvider;
} = {}): void {
  if (options.navigationGraph) {
    navigationGraphProvider = options.navigationGraph;
  }

  attachGraphUpdateListener(getNavigationGraphProvider());

  ResourceRegistry.register(
    NAVIGATION_RESOURCE_URIS.GRAPH,
    "Navigation Graph",
    "High-level navigation graph for the current app (nodes and edges). Use ?appId= to filter by specific app.",
    "application/json",
    () => getNavigationGraphResource()
  );

  ResourceRegistry.registerTemplate(
    NAVIGATION_RESOURCE_URIS.GRAPH_WITH_APP_ID,
    "Navigation Graph (App-Specific)",
    "High-level navigation graph filtered by app ID.",
    "application/json",
    async params => {
      const appId = params.appId ? decodeURIComponent(params.appId).trim() : undefined;
      return getNavigationGraphResource(appId);
    }
  );

  ResourceRegistry.register(
    NAVIGATION_RESOURCE_URIS.HISTORY,
    "Navigation History",
    "Ordered navigation history for the current app (nodes and edges).",
    "application/json",
    () => getNavigationGraphHistoryResource(NAVIGATION_RESOURCE_URIS.HISTORY)
  );

  const historyHandler = async (params: Record<string, string>) => {
    const { cursor, limit } = parseHistoryParams(params);
    const query = new URLSearchParams();
    if (cursor) {
      query.set("cursor", cursor);
    }
    if (limit) {
      query.set("limit", limit.toString());
    }
    const queryString = query.toString();
    const uri = queryString
      ? `${NAVIGATION_RESOURCE_URIS.HISTORY}?${queryString}`
      : NAVIGATION_RESOURCE_URIS.HISTORY;
    return getNavigationGraphHistoryResource(uri, { cursor, limit });
  };

  ResourceRegistry.registerTemplate(
    NAVIGATION_RESOURCE_URIS.HISTORY_WITH_CURSOR_AND_LIMIT,
    "Navigation History",
    "Ordered navigation history with pagination support.",
    "application/json",
    historyHandler
  );

  ResourceRegistry.registerTemplate(
    NAVIGATION_RESOURCE_URIS.HISTORY_WITH_CURSOR,
    "Navigation History",
    "Ordered navigation history with pagination support.",
    "application/json",
    historyHandler
  );

  ResourceRegistry.registerTemplate(
    NAVIGATION_RESOURCE_URIS.HISTORY_WITH_LIMIT,
    "Navigation History",
    "Ordered navigation history with pagination support.",
    "application/json",
    historyHandler
  );

  ResourceRegistry.registerTemplate(
    NAVIGATION_RESOURCE_URIS.NODE_BY_ID,
    "Navigation Graph Node",
    "Detailed navigation graph node by node ID, including relationships.",
    "application/json",
    async params => {
      const nodeId = Number(params.nodeId);
      if (!Number.isFinite(nodeId)) {
        return buildNavigationNodeError(
          `automobile:navigation/nodes/${params.nodeId}`,
          `Invalid navigation node id: ${params.nodeId}`
        );
      }
      return getNavigationNodeByIdResource(nodeId);
    }
  );

  ResourceRegistry.registerTemplate(
    NAVIGATION_RESOURCE_URIS.NODE_BY_SCREEN,
    "Navigation Graph Node (Screen)",
    "Detailed navigation graph node by screen name, including relationships.",
    "application/json",
    async params => {
      const screenName = decodeURIComponent(params.screenName ?? "").trim();
      if (!screenName) {
        return buildNavigationNodeError(
          "automobile:navigation/nodes?screen=",
          "Screen name is required."
        );
      }
      return getNavigationNodeByScreenResource(screenName);
    }
  );

  ResourceRegistry.registerTemplate(
    NAVIGATION_RESOURCE_URIS.NODE_SCREENSHOT,
    "Navigation Node Screenshot",
    "Screenshot thumbnail for a navigation graph node (WebP image).",
    "image/webp",
    async params => {
      const nodeId = Number(params.nodeId);
      if (!Number.isFinite(nodeId)) {
        return {
          uri: `automobile:navigation/nodes/${params.nodeId}/screenshot`,
          mimeType: "application/json",
          text: JSON.stringify({ error: `Invalid node id: ${params.nodeId}` }, null, 2)
        };
      }
      return getNavigationNodeScreenshotResource(nodeId);
    }
  );

  ResourceRegistry.register(
    NAVIGATION_RESOURCE_URIS.TEST_COVERAGE,
    "Navigation Test Coverage Report",
    "Comprehensive test coverage analysis for the navigation graph, including coverage metrics, critical gaps, and recommendations.",
    "application/json",
    async () => {
      try {
        const navManager = NavigationGraphManager.getInstance();
        const appId = navManager.getCurrentAppId();

        if (!appId) {
          return {
            uri: NAVIGATION_RESOURCE_URIS.TEST_COVERAGE,
            mimeType: "application/json",
            text: JSON.stringify({
              error: "No current app set. Launch or observe an app first to enable test coverage tracking."
            }, null, 2)
          };
        }

        const report = await testCoverageAnalyzer.generateReport(appId);
        return {
          uri: NAVIGATION_RESOURCE_URIS.TEST_COVERAGE,
          mimeType: "application/json",
          text: JSON.stringify(report, null, 2)
        };
      } catch (error) {
        logger.error(`[NavigationResources] Failed to generate test coverage report: ${error}`);
        return {
          uri: NAVIGATION_RESOURCE_URIS.TEST_COVERAGE,
          mimeType: "application/json",
          text: JSON.stringify({
            error: `Failed to generate test coverage report: ${error}`
          }, null, 2)
        };
      }
    }
  );

  logger.info("[NavigationResources] Registered navigation graph resources including test coverage");
}
