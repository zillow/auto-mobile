import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import {
  NavigationGraphSummary,
  NavigationGraphSummaryProvider,
  NavigationGraphNodeResource,
  NavigationGraphNodeResourceProvider
} from "../utils/interfaces/NavigationGraph";
import { logger } from "../utils/logger";

export const NAVIGATION_RESOURCE_URIS = {
  GRAPH: "automobile://navigation/graph",
  NODE_BY_ID: "automobile://navigation/nodes/{nodeId}",
  NODE_BY_SCREEN: "automobile://navigation/nodes?screen={screenName}",
} as const;

export type NavigationGraphResourceContent = NavigationGraphSummary;
export type NavigationNodeResourceContent = NavigationGraphNodeResource;

const GRAPH_RESOURCE_UPDATE_DEBOUNCE_MS = 1000;

type NavigationGraphResourceProvider = NavigationGraphSummaryProvider & NavigationGraphNodeResourceProvider;

let navigationGraphProvider: NavigationGraphResourceProvider = NavigationGraphManager.getInstance();
let updateListenerProvider: NavigationGraphSummaryProvider | null = null;
let updateTimeout: ReturnType<typeof setTimeout> | null = null;
let providerOverride = false;

function scheduleNavigationGraphUpdate(): void {
  if (updateTimeout) {
    return;
  }

  updateTimeout = setTimeout(() => {
    updateTimeout = null;
    void ResourceRegistry.notifyResourceUpdated(NAVIGATION_RESOURCE_URIS.GRAPH);
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
  navigationGraphProvider = provider ?? NavigationGraphManager.getInstance();
  providerOverride = provider !== null;
  attachGraphUpdateListener(navigationGraphProvider);
}

async function getNavigationGraphResource(): Promise<ResourceContent> {
  try {
    const graph = await navigationGraphProvider.exportGraphSummary();
    return {
      uri: NAVIGATION_RESOURCE_URIS.GRAPH,
      mimeType: "application/json",
      text: JSON.stringify(graph, null, 2)
    };
  } catch (error) {
    logger.error(`[NavigationResources] Failed to get navigation graph: ${error}`);
    return {
      uri: NAVIGATION_RESOURCE_URIS.GRAPH,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve navigation graph: ${error}`
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
  const uri = `automobile://navigation/nodes/${nodeId}`;

  try {
    const nodeResource = await navigationGraphProvider.getNodeResourceById(nodeId);
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
  const uri = `automobile://navigation/nodes?screen=${encodeURIComponent(screenName)}`;

  try {
    const nodeResource = await navigationGraphProvider.getNodeResourceByScreen(screenName);
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

export function registerNavigationResources(options: {
  navigationGraph?: NavigationGraphResourceProvider;
} = {}): void {
  if (options.navigationGraph) {
    navigationGraphProvider = options.navigationGraph;
    providerOverride = true;
  } else if (!providerOverride) {
    navigationGraphProvider = NavigationGraphManager.getInstance();
  }

  attachGraphUpdateListener(navigationGraphProvider);

  ResourceRegistry.register(
    NAVIGATION_RESOURCE_URIS.GRAPH,
    "Navigation Graph",
    "High-level navigation graph for the current app (nodes and edges).",
    "application/json",
    getNavigationGraphResource
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
          `automobile://navigation/nodes/${params.nodeId}`,
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
          "automobile://navigation/nodes?screen=",
          "Screen name is required."
        );
      }
      return getNavigationNodeByScreenResource(screenName);
    }
  );

  logger.info("[NavigationResources] Registered navigation graph resources");
}
