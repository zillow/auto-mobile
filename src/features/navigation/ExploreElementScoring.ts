import type { Element } from "../../models";
import type { NavigationEdge } from "./NavigationGraphManager";
import type {
  ElementSelectionStats,
  ExplorationMode,
  ExplorationStrategy,
  PlannedInteraction,
  TrackedElement
} from "./ExploreTypes";
import { getElementKey } from "./ExploreElementExtraction";

/**
 * Calculate navigation score for an element
 */
export function calculateNavigationScore(element: Element): number {
  let score = 0;

  const clickable =
    element.clickable === true || (element.clickable as any) === "true";
  const scrollable =
    element.scrollable === true || (element.scrollable as any) === "true";

  // Clickable bonus - clickable elements are more likely to be interactive
  if (clickable) {
    score += 5;
  }

  // Scrollable bonus - scrollable containers can reveal new content
  if (scrollable) {
    score += 3;
  }

  // Hierarchy depth bonus - linear function where closer to root = higher score
  // Formula: max(0, 25 - depth * 2)
  // depth 0: +25, depth 3: +19, depth 6: +13, depth 10: +5, depth 12+: 0
  const depth = (element as any).hierarchyDepth ?? 99;
  const depthBonus = Math.max(0, 25 - depth * 2);
  score += depthBonus;

  return Math.max(0, score);
}

/**
 * Calculate novelty score based on previous interactions
 */
export function calculateNoveltyScore(
  element: Element,
  exploredElements: Map<string, TrackedElement>
): number {
  const elementKey = getElementKey(element);
  const tracked = exploredElements.get(elementKey);

  // High score for never-explored elements
  if (!tracked) {
    return 10;
  }

  // Reduce score based on interaction count
  return Math.max(1, 10 - tracked.interactionCount);
}

/**
 * Estimate coverage gain from interacting with element
 */
export function estimateCoverageGain(element: Element): number {
  // For now, use a simple heuristic based on navigation score
  // Future: could use ML or historical data
  const navScore = calculateNavigationScore(element);
  return Math.max(1, navScore / 10);
}

/**
 * Breadth-first selection: prefer unexplored elements on current screen
 */
export function selectBreadthFirst(elements: Element[]): Element | null {
  if (elements.length === 0) {
    return null;
  }

  // Sort by navigation score
  const sorted = elements.sort((a, b) => {
    return calculateNavigationScore(b) - calculateNavigationScore(a);
  });

  return sorted[0];
}

/**
 * Depth-first selection: follow promising paths deeply
 */
export function selectDepthFirst(
  elements: Element[],
  exploredElements: Map<string, TrackedElement>
): Element | null {
  if (elements.length === 0) {
    return null;
  }

  // Prefer elements we haven't tried yet, then by score
  const sorted = elements.sort((a, b) => {
    const aNever = !exploredElements.has(getElementKey(a));
    const bNever = !exploredElements.has(getElementKey(b));

    if (aNever && !bNever) {
      return -1;
    }
    if (!aNever && bNever) {
      return 1;
    }

    return calculateNavigationScore(b) - calculateNavigationScore(a);
  });

  return sorted[0];
}

/**
 * Weighted selection result with element and stats
 */
export interface WeightedSelectionResult {
  element: Element;
  stats: ElementSelectionStats;
}

/**
 * Weighted selection: balance navigation score, novelty, and coverage
 */
export function selectWeighted(
  elements: Element[],
  mode: ExplorationMode,
  exploredElements: Map<string, TrackedElement>
): WeightedSelectionResult | null {
  if (elements.length === 0) {
    return null;
  }

  // Calculate scores for each element
  const scored = elements.map(element => {
    const navScore = calculateNavigationScore(element);
    const novelty = calculateNoveltyScore(element, exploredElements);
    const coverage = estimateCoverageGain(element);

    // Adjust weights based on mode
    let finalScore: number;
    if (mode === "discover") {
      // Heavily favor novelty and coverage
      finalScore = navScore * 0.3 + novelty * 0.4 + coverage * 0.3;
    } else if (mode === "validate") {
      // Favor previously explored elements
      finalScore = navScore * 0.5 + (10 - novelty) * 0.3 + coverage * 0.2;
    } else {
      // Hybrid: balanced approach
      finalScore = navScore * 0.4 + novelty * 0.4 + coverage * 0.2;
    }

    return {
      element,
      navScore,
      novelty,
      coverage,
      finalScore
    };
  });

  // Sort by final score
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // Return selection with stats
  const selected = scored[0];
  return {
    element: selected.element,
    stats: {
      text: selected.element.text,
      resourceId: selected.element["resource-id"],
      className: selected.element["class"],
      score: selected.navScore,
      novelty: selected.novelty,
      coverage: selected.coverage,
      finalScore: selected.finalScore
    }
  };
}

/**
 * Ranked element for dry run
 */
export interface RankedElement {
  element: Element;
  score: number;
  reason: string;
  action: "tapOn" | "swipeOn";
  whitelistStatus: "allowed" | "blocked" | "unknown";
}

/**
 * Rank elements for dry run
 */
export function rankElementsForDryRun(
  elements: Element[],
  strategy: ExplorationStrategy,
  mode: ExplorationMode,
  exploredElements: Map<string, TrackedElement>
): RankedElement[] {
  const scored = elements.map(element => {
    const navScore = calculateNavigationScore(element);
    const novelty = calculateNoveltyScore(element, exploredElements);
    const coverage = estimateCoverageGain(element);
    const isScrollable =
      element.scrollable === true || (element.scrollable as any) === "true";

    let score = navScore;
    let reason = `Navigation score ${navScore.toFixed(1)}`;

    if (strategy === "weighted") {
      if (mode === "discover") {
        score = navScore * 0.3 + novelty * 0.4 + coverage * 0.3;
      } else if (mode === "validate") {
        score = navScore * 0.5 + (10 - novelty) * 0.3 + coverage * 0.2;
      } else {
        score = navScore * 0.4 + novelty * 0.4 + coverage * 0.2;
      }
      reason =
        `Weighted score ${score.toFixed(2)} ` +
        `(nav=${navScore.toFixed(1)}, novelty=${novelty.toFixed(1)}, coverage=${coverage.toFixed(1)})`;
    } else if (strategy === "depth-first") {
      reason = `Depth-first preference with score ${score.toFixed(1)}`;
    } else {
      reason = `Breadth-first priority with score ${score.toFixed(1)}`;
    }

    return {
      element,
      score,
      reason,
      action: isScrollable ? "swipeOn" : "tapOn",
      whitelistStatus: "unknown"
    } as RankedElement;
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Get element target for planned interaction
 */
export function getElementTarget(element: Element): PlannedInteraction["target"] {
  if (element.text) {
    return { type: "text", value: element.text };
  }
  if (element["content-desc"]) {
    return { type: "text", value: element["content-desc"] };
  }
  if (element["resource-id"]) {
    return { type: "id", value: element["resource-id"] };
  }
  if (element.bounds) {
    const x = Math.round((element.bounds.left + element.bounds.right) / 2);
    const y = Math.round((element.bounds.top + element.bounds.bottom) / 2);
    return { type: "coordinates", value: `${x},${y}` };
  }
  return { type: "coordinates", value: "0,0" };
}

/**
 * Predict outcome for element based on known edges
 */
export function predictOutcomeForElement(
  element: Element,
  edges: NavigationEdge[]
): PlannedInteraction["predictedOutcome"] {
  if (edges.length === 0) {
    return { screen: "unknown", confidence: 0 };
  }

  let bestScore = 0;
  let bestScreen = "unknown";

  for (const edge of edges) {
    const score = scoreEdgeMatch(element, edge);
    if (score > bestScore) {
      bestScore = score;
      bestScreen = edge.to;
    }
  }

  if (bestScore <= 0) {
    return { screen: "unknown", confidence: 0 };
  }

  return { screen: bestScreen, confidence: Math.round(bestScore * 100) / 100 };
}

/**
 * Score how well an element matches an edge
 */
export function scoreEdgeMatch(element: Element, edge: NavigationEdge): number {
  const uiState = edge.uiState || edge.interaction?.uiState;
  if (!uiState) {
    return 0;
  }

  let score = 0;
  for (const selected of uiState.selectedElements ?? []) {
    score = Math.max(score, scoreSelectedElementMatch(element, selected));
  }

  if (uiState.scrollPosition) {
    score = Math.max(
      score,
      scoreScrollPositionMatch(element, uiState.scrollPosition)
    );
  }

  return score;
}

/**
 * Score match between element and selected element from edge
 */
export function scoreSelectedElementMatch(
  element: Element,
  selected: { text?: string; resourceId?: string; contentDesc?: string }
): number {
  let score = 0;
  score = Math.max(
    score,
    scoreIdentifierMatch(element["resource-id"], selected.resourceId, 0.95, 0.85)
  );
  score = Math.max(
    score,
    scoreIdentifierMatch(element.text, selected.text, 0.9, 0.7)
  );
  score = Math.max(
    score,
    scoreIdentifierMatch(
      element["content-desc"],
      selected.contentDesc,
      0.85,
      0.65
    )
  );
  return score;
}

/**
 * Score match between element and scroll position
 */
export function scoreScrollPositionMatch(
  element: Element,
  scrollPosition: {
    container?: { text?: string; resourceId?: string; contentDesc?: string };
    targetElement: { text?: string; resourceId?: string; contentDesc?: string };
  }
): number {
  let score = 0;
  if (scrollPosition.container) {
    score = Math.max(
      score,
      scoreIdentifierMatch(
        element["resource-id"],
        scrollPosition.container.resourceId,
        0.8,
        0.7
      )
    );
    score = Math.max(
      score,
      scoreIdentifierMatch(element.text, scrollPosition.container.text, 0.75, 0.65)
    );
    score = Math.max(
      score,
      scoreIdentifierMatch(
        element["content-desc"],
        scrollPosition.container.contentDesc,
        0.75,
        0.65
      )
    );
  }

  score = Math.max(
    score,
    scoreIdentifierMatch(
      element["resource-id"],
      scrollPosition.targetElement.resourceId,
      0.8,
      0.7
    )
  );
  score = Math.max(
    score,
    scoreIdentifierMatch(
      element.text,
      scrollPosition.targetElement.text,
      0.75,
      0.65
    )
  );
  score = Math.max(
    score,
    scoreIdentifierMatch(
      element["content-desc"],
      scrollPosition.targetElement.contentDesc,
      0.75,
      0.65
    )
  );

  return score;
}

/**
 * Score identifier match with full and partial match scores
 */
export function scoreIdentifierMatch(
  value: string | undefined,
  candidate: string | undefined,
  fullMatchScore: number,
  partialMatchScore: number
): number {
  if (!value || !candidate) {
    return 0;
  }
  const normalizedValue = value.trim().toLowerCase();
  const normalizedCandidate = candidate.trim().toLowerCase();
  if (normalizedValue === normalizedCandidate) {
    return fullMatchScore;
  }
  if (
    normalizedValue.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedValue)
  ) {
    return partialMatchScore;
  }
  return 0;
}
