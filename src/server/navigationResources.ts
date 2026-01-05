import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { NavigationGraphManager } from "../features/navigation/NavigationGraphManager";
import {
  NavigationGraphSummary,
  NavigationGraphSummaryProvider
} from "../utils/interfaces/NavigationGraph";
import { logger } from "../utils/logger";

export const NAVIGATION_RESOURCE_URIS = {
  GRAPH: "automobile://navigation/graph"
} as const;

export type NavigationGraphResourceContent = NavigationGraphSummary;

const GRAPH_RESOURCE_UPDATE_DEBOUNCE_MS = 1000;

let navigationGraphProvider: NavigationGraphSummaryProvider = NavigationGraphManager.getInstance();
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

export function setNavigationGraphProvider(provider: NavigationGraphSummaryProvider | null): void {
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

export function registerNavigationResources(options: {
  navigationGraph?: NavigationGraphSummaryProvider;
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

  logger.info("[NavigationResources] Registered navigation graph resources");
}
