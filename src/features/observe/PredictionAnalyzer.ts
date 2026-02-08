import { DefaultElementParser } from "../utility/ElementParser";
import { ObserveResult, PredictedAction } from "../../models";
import { PredictionHistoryRepository, PredictionErrorType } from "../../db/predictionHistoryRepository";
import { NavigationGraphManager } from "../navigation/NavigationGraphManager";
import { NodeCryptoService } from "../../utils/crypto";
import { normalizeIdentifier, normalizeToolArgs } from "../../utils/predictionUtils";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

export interface PredictionActionContext {
  appId: string;
  fromScreen: string;
  toolName: string;
  toolArgs: Record<string, any>;
}

export interface PredictionHistoryStore {
  recordOutcome: PredictionHistoryRepository["recordOutcome"];
}

export interface NavigationGraphLike {
  getCurrentScreen(): string | null;
}

export class PredictionAnalyzer {
  private elementParser = new DefaultElementParser();
  private historyRepository: PredictionHistoryStore;
  private navigationGraph: NavigationGraphLike;
  private timer: Timer;

  constructor(
    historyRepository: PredictionHistoryStore = new PredictionHistoryRepository(),
    navigationGraph: NavigationGraphLike = NavigationGraphManager.getInstance(),
    timer: Timer = defaultTimer
  ) {
    this.historyRepository = historyRepository;
    this.navigationGraph = navigationGraph;
    this.timer = timer;
  }

  async recordOutcomeForAction(
    previousObservation: ObserveResult | null,
    actualObservation: ObserveResult | null,
    context: PredictionActionContext
  ): Promise<void> {
    if (!previousObservation?.predictions?.likelyActions || !actualObservation) {
      return;
    }

    const prediction = this.findMatchingPrediction(
      previousObservation.predictions.likelyActions,
      context.toolName,
      context.toolArgs
    );

    if (!prediction) {
      return;
    }

    const actualScreen = this.navigationGraph.getCurrentScreen();
    if (!actualScreen) {
      return;
    }

    const predictedElements = prediction.predictedElements ?? [];
    const foundElements = this.extractElementIdentifiers(actualObservation);
    const matchScore = this.calculateMatchScore(predictedElements, foundElements, prediction.predictedScreen, actualScreen);
    const correct = this.isCorrectPrediction(prediction.predictedScreen, actualScreen, predictedElements, matchScore);
    const partialMatch = this.isPartialMatch(prediction.predictedScreen, actualScreen, matchScore);
    const errorType = this.resolveErrorType(prediction.predictedScreen, actualScreen, predictedElements, matchScore);

    const predictionId = NodeCryptoService.generateCacheKey(JSON.stringify({
      fromScreen: context.fromScreen,
      predictedScreen: prediction.predictedScreen,
      toolName: context.toolName,
      toolArgs: normalizeToolArgs(context.toolArgs),
      timestamp: this.timer.now()
    }));

    try {
      await this.historyRepository.recordOutcome({
        appId: context.appId,
        predictionId,
        timestamp: this.timer.now(),
        fromScreen: context.fromScreen,
        predictedScreen: prediction.predictedScreen,
        actualScreen,
        toolName: context.toolName,
        toolArgs: context.toolArgs,
        predictedElements,
        foundElements,
        confidence: prediction.confidence ?? 0.5,
        matchScore,
        correct,
        partialMatch,
        errorType
      });
    } catch (error) {
      logger.warn(`[PredictionAnalyzer] Failed to record outcome: ${error}`);
    }
  }

  private findMatchingPrediction(
    predictions: PredictedAction[],
    toolName: string,
    toolArgs: Record<string, any>
  ): PredictedAction | undefined {
    const candidates = predictions.filter(prediction => prediction.action === toolName);
    if (candidates.length === 0) {
      return undefined;
    }

    for (const candidate of candidates) {
      if (toolName === "tapOn" && this.matchesTapOn(candidate, toolArgs)) {
        return candidate;
      }
      if (toolName === "swipeOn" && this.matchesSwipeOn(candidate, toolArgs)) {
        return candidate;
      }
    }

    return undefined;
  }

  private matchesTapOn(prediction: PredictedAction, toolArgs: Record<string, any>): boolean {
    const target = prediction.target;
    const argText = normalizeIdentifier(toolArgs.text);
    const argId = normalizeIdentifier(toolArgs.elementId ?? toolArgs.id);
    const targetText = normalizeIdentifier(target.text);
    const targetId = normalizeIdentifier(target.elementId);
    const targetDesc = normalizeIdentifier(target.contentDesc);

    if (argText && (argText === targetText || argText === targetDesc)) {
      return true;
    }

    if (argId && argId === targetId) {
      return true;
    }

    return false;
  }

  private matchesSwipeOn(prediction: PredictedAction, toolArgs: Record<string, any>): boolean {
    const target = prediction.target;
    const container = toolArgs.container ?? {};
    const lookFor = toolArgs.lookFor ?? {};

    const containerMatch = this.matchesTarget(container, target.container);
    const lookForMatch = this.matchesTarget(lookFor, target.lookFor);

    return containerMatch || lookForMatch;
  }

  private matchesTarget(
    args: { text?: string; elementId?: string; contentDesc?: string },
    target?: { text?: string; elementId?: string; contentDesc?: string }
  ): boolean {
    if (!target) {
      return false;
    }

    const argText = normalizeIdentifier(args.text);
    const argId = normalizeIdentifier(args.elementId);
    const argDesc = normalizeIdentifier(args.contentDesc);
    const targetText = normalizeIdentifier(target.text);
    const targetId = normalizeIdentifier(target.elementId);
    const targetDesc = normalizeIdentifier(target.contentDesc);

    if (argText && (argText === targetText || argText === targetDesc)) {
      return true;
    }

    if (argId && argId === targetId) {
      return true;
    }

    if (argDesc && argDesc === targetDesc) {
      return true;
    }

    return false;
  }

  private extractElementIdentifiers(observation: ObserveResult): string[] {
    if (!observation.viewHierarchy) {
      return [];
    }

    const flattened = this.elementParser.flattenViewHierarchy(observation.viewHierarchy);
    const identifiers = new Set<string>();

    for (const { element } of flattened) {
      if (element.text) {
        identifiers.add(element.text);
      }
      if (element["resource-id"]) {
        identifiers.add(element["resource-id"]);
      }
      if (element["content-desc"]) {
        identifiers.add(element["content-desc"]);
      }
    }

    return Array.from(identifiers);
  }

  private calculateMatchScore(
    predictedElements: string[],
    foundElements: string[],
    predictedScreen: string,
    actualScreen: string
  ): number {
    if (predictedScreen !== actualScreen) {
      return 0;
    }

    if (predictedElements.length === 0) {
      return 1;
    }

    const predictedSet = new Set(
      predictedElements
        .map(normalizeIdentifier)
        .filter((value): value is string => Boolean(value))
    );
    if (predictedSet.size === 0) {
      return 1;
    }

    const foundSet = new Set(
      foundElements
        .map(normalizeIdentifier)
        .filter((value): value is string => Boolean(value))
    );

    let matches = 0;
    for (const predicted of predictedSet) {
      if (foundSet.has(predicted)) {
        matches += 1;
      }
    }

    return matches / predictedSet.size;
  }

  private isCorrectPrediction(
    predictedScreen: string,
    actualScreen: string,
    predictedElements: string[],
    matchScore: number
  ): boolean {
    if (predictedScreen !== actualScreen) {
      return false;
    }

    if (predictedElements.length === 0) {
      return true;
    }

    return matchScore >= 1;
  }

  private isPartialMatch(
    predictedScreen: string,
    actualScreen: string,
    matchScore: number
  ): boolean {
    return predictedScreen === actualScreen && matchScore > 0 && matchScore < 1;
  }

  private resolveErrorType(
    predictedScreen: string,
    actualScreen: string,
    predictedElements: string[],
    matchScore: number
  ): PredictionErrorType | undefined {
    if (predictedScreen !== actualScreen) {
      return "wrong_screen";
    }

    if (predictedElements.length > 0 && matchScore < 1) {
      return "missing_elements";
    }

    return undefined;
  }
}
