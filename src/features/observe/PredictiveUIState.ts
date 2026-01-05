import { ElementParser } from "../utility/ElementParser";
import {
  Element,
  InteractablePrediction,
  ObserveResult,
  PredictedAction,
  PredictionTarget,
  Predictions
} from "../../models";
import { NavigationEdge, NavigationGraphManager, UIState } from "../navigation/NavigationGraphManager";
import { PredictionHistoryRepository } from "../../db/predictionHistoryRepository";
import { normalizeToolArgs } from "../../utils/predictionUtils";

interface InteractableElement {
  element: Element;
  text?: string;
  contentDesc?: string;
  resourceId?: string;
  clickable: boolean;
  scrollable: boolean;
}

export class PredictiveUIState {
  private elementParser = new ElementParser();
  private historyRepository = new PredictionHistoryRepository();
  private readonly DEFAULT_CONFIDENCE = 0.5;

  async generate(result: ObserveResult): Promise<Predictions | undefined> {
    if (!result.viewHierarchy) {
      return undefined;
    }

    const navGraph = NavigationGraphManager.getInstance();
    const currentScreen = navGraph.getCurrentScreen();
    if (!currentScreen) {
      return undefined;
    }

    const appId = navGraph.getCurrentAppId();
    if (appId && result.activeWindow?.appId && appId !== result.activeWindow.appId) {
      return undefined;
    }

    const edges = await navGraph.getEdgesFrom(currentScreen);
    const actionableEdges = edges.filter(edge =>
      edge.interaction?.toolName === "tapOn" || edge.interaction?.toolName === "swipeOn"
    );
    if (actionableEdges.length === 0) {
      return undefined;
    }

    const interactables = this.extractInteractables(result.viewHierarchy);
    if (interactables.length === 0) {
      return undefined;
    }

    const likelyActions: PredictedAction[] = [];
    const interactableElements: InteractablePrediction[] = [];
    const matchedEdges = new Set<string>();
    const predictedElementsByScreen = new Map<string, string[]>();
    const transitionStats = appId
      ? await this.historyRepository.getTransitionStatsForScreen(appId, currentScreen)
      : [];
    const transitionStatsByKey = new Map<string, typeof transitionStats[number]>();
    for (const stat of transitionStats) {
      const key = this.buildTransitionKey(stat.from_screen, stat.to_screen, stat.tool_name, stat.tool_args);
      transitionStatsByKey.set(key, stat);
    }

    for (const interactable of interactables) {
      const match = this.findMatchingEdge(interactable, actionableEdges);
      if (!match || !match.interaction) {
        continue;
      }

      const predictionTarget = this.buildTarget(match, interactable);
      if (!predictionTarget) {
        continue;
      }

      const edgeKey = this.buildEdgeKey(match);
      if (!matchedEdges.has(edgeKey)) {
        const predictedElements = await this.getPredictedElements(
          navGraph,
          match.to,
          predictedElementsByScreen
        );
        const confidence = this.getAdjustedConfidence(
          transitionStatsByKey.get(this.buildTransitionKey(
            currentScreen,
            match.to,
            match.interaction.toolName,
            normalizeToolArgs(match.interaction.args)
          ))
        );
        likelyActions.push({
          action: match.interaction.toolName,
          target: predictionTarget,
          predictedScreen: match.to,
          predictedElements: predictedElements.length > 0 ? predictedElements : undefined,
          confidence
        });
        matchedEdges.add(edgeKey);
      }

      interactableElements.push({
        elementId: interactable.resourceId,
        elementText: interactable.text,
        elementContentDesc: interactable.contentDesc,
        predictedOutcome: {
          screenName: match.to,
          basedOn: "navigation_graph"
        }
      });
    }

    if (likelyActions.length === 0 && interactableElements.length === 0) {
      return undefined;
    }

    return {
      likelyActions,
      interactableElements
    };
  }

  private extractInteractables(viewHierarchy: ObserveResult["viewHierarchy"]): InteractableElement[] {
    if (!viewHierarchy) {
      return [];
    }

    const flattened = this.elementParser.flattenViewHierarchy(viewHierarchy);
    const interactables: InteractableElement[] = [];

    for (const { element } of flattened) {
      const clickable = element.clickable === true || element.clickable === "true";
      const scrollable = element.scrollable === true || element.scrollable === "true";
      if (!clickable && !scrollable) {
        continue;
      }

      interactables.push({
        element,
        text: element.text,
        contentDesc: element["content-desc"],
        resourceId: element["resource-id"],
        clickable,
        scrollable
      });
    }

    return interactables;
  }

  private findMatchingEdge(
    interactable: InteractableElement,
    edges: NavigationEdge[]
  ): NavigationEdge | undefined {
    for (const edge of edges) {
      const toolName = edge.interaction?.toolName;
      const args = edge.interaction?.args;
      const uiState = edge.interaction?.uiState;

      if (toolName === "tapOn" && interactable.clickable) {
        if (this.matchesTapOn(interactable, args)) {
          return edge;
        }
      }

      if (toolName === "swipeOn" && interactable.scrollable) {
        if (this.matchesSwipeOn(interactable, args, uiState)) {
          return edge;
        }
      }
    }

    return undefined;
  }

  private matchesTapOn(interactable: InteractableElement, args?: Record<string, any>): boolean {
    if (!args) {
      return false;
    }

    const hasTextMatch = this.matchesText(args.text, interactable);
    const hasIdMatch = this.matchesResourceId(args.id, interactable);

    return (args.text && hasTextMatch) || (args.id && hasIdMatch);
  }

  private matchesSwipeOn(
    interactable: InteractableElement,
    args?: Record<string, any>,
    uiState?: UIState
  ): boolean {
    const container = args?.container || uiState?.scrollPosition?.container;
    if (!container) {
      return false;
    }

    const containerText = container.text;
    const containerId = container.elementId || container.resourceId;
    const containerDesc = container.contentDesc;

    return (
      this.matchesText(containerText, interactable) ||
      this.matchesResourceId(containerId, interactable) ||
      this.matchesContentDesc(containerDesc, interactable)
    );
  }

  private matchesText(text: string | undefined, interactable: InteractableElement): boolean {
    const normalized = this.normalizeValue(text);
    if (!normalized) {
      return false;
    }
    return normalized === this.normalizeValue(interactable.text)
      || normalized === this.normalizeValue(interactable.contentDesc);
  }

  private matchesResourceId(resourceId: string | undefined, interactable: InteractableElement): boolean {
    const normalized = this.normalizeValue(resourceId);
    if (!normalized) {
      return false;
    }
    return normalized === this.normalizeValue(interactable.resourceId);
  }

  private matchesContentDesc(contentDesc: string | undefined, interactable: InteractableElement): boolean {
    const normalized = this.normalizeValue(contentDesc);
    if (!normalized) {
      return false;
    }
    return normalized === this.normalizeValue(interactable.contentDesc);
  }

  private normalizeValue(value: string | undefined): string | undefined {
    return value?.trim().toLowerCase();
  }

  private buildTarget(edge: NavigationEdge, interactable: InteractableElement): PredictionTarget | null {
    const args = edge.interaction?.args;
    const uiState = edge.interaction?.uiState;
    const toolName = edge.interaction?.toolName;

    if (toolName === "tapOn") {
      const text = args?.text ?? interactable.text;
      const elementId = args?.id ?? interactable.resourceId;
      const contentDesc = interactable.contentDesc;

      if (!text && !elementId && !contentDesc) {
        return null;
      }

      return {
        text,
        elementId,
        contentDesc
      };
    }

    if (toolName === "swipeOn") {
      const container = args?.container || uiState?.scrollPosition?.container;
      const lookFor = args?.lookFor || uiState?.scrollPosition?.targetElement;
      const target: PredictionTarget = {};

      if (container) {
        target.container = {
          text: container.text,
          elementId: container.elementId || container.resourceId,
          contentDesc: container.contentDesc
        };
      }

      if (lookFor) {
        target.lookFor = {
          text: lookFor.text,
          elementId: lookFor.elementId || lookFor.resourceId,
          contentDesc: lookFor.contentDesc
        };
      }

      if (!target.container && !target.lookFor) {
        return null;
      }

      return target;
    }

    return null;
  }

  private buildEdgeKey(edge: NavigationEdge): string {
    const args = edge.interaction?.args ?? {};
    return `${edge.from}:${edge.to}:${edge.interaction?.toolName}:${JSON.stringify(args)}`;
  }

  private buildTransitionKey(
    fromScreen: string,
    toScreen: string,
    toolName: string,
    toolArgs: string
  ): string {
    return `${fromScreen}:${toScreen}:${toolName}:${toolArgs}`;
  }

  private getAdjustedConfidence(
    stats?: {
      attempts: number;
      successes: number;
    }
  ): number {
    if (!stats) {
      return this.DEFAULT_CONFIDENCE;
    }

    const attempts = stats.attempts;
    const accuracy = attempts > 0 ? stats.successes / attempts : this.DEFAULT_CONFIDENCE;
    return this.adjustConfidence(this.DEFAULT_CONFIDENCE, accuracy, attempts);
  }

  private adjustConfidence(
    baseConfidence: number,
    historicalAccuracy: number,
    sampleSize: number
  ): number {
    const historyWeight = Math.min(sampleSize / 100, 0.8);
    const baseWeight = 1 - historyWeight;
    const adjusted = (baseConfidence * baseWeight) + (historicalAccuracy * historyWeight);
    return Math.max(0, Math.min(1, adjusted));
  }

  private async getPredictedElements(
    navGraph: NavigationGraphManager,
    screenName: string,
    cache: Map<string, string[]>
  ): Promise<string[]> {
    if (cache.has(screenName)) {
      return cache.get(screenName) ?? [];
    }

    const edges = await navGraph.getEdgesFrom(screenName);
    const identifiers = new Set<string>();

    for (const edge of edges) {
      const selectedElements = edge.interaction?.uiState?.selectedElements;
      if (!selectedElements) {
        continue;
      }

      for (const selected of selectedElements) {
        const identifier = selected.text || selected.resourceId || selected.contentDesc;
        if (identifier) {
          identifiers.add(identifier);
        }
      }
    }

    const predictedElements = Array.from(identifiers);
    cache.set(screenName, predictedElements);
    return predictedElements;
  }
}
