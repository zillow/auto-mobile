import { Element } from "../../models/Element";
import { ObserveResult } from "../../models/ObserveResult";
import { ElementBounds } from "../../models/ElementBounds";
import { ElementFinder } from "../utility/ElementFinder";
import { ElementParser } from "../utility/ElementParser";
import { ElementGeometry } from "../utility/ElementGeometry";
import { NavigationEdge } from "../../utils/interfaces/NavigationGraph";

export type InteractionType = "navigation" | "input" | "action" | "scroll" | "toggle";

export interface IdentifyInteractionsOptions {
  platform: "android" | "ios";
  filter?: {
    types?: InteractionType[];
    minConfidence?: number;
    limit?: number;
  };
  includeContext?: {
    navigationGraph?: boolean;
    elementDetails?: boolean;
    suggestedParams?: boolean;
  };
}

export interface IdentifyInteractionsResult {
  success: boolean;
  screenName: string;
  interactions: IdentifiedInteraction[];
  summary: {
    totalInteractable: number;
    byType: Record<string, number>;
    navigationOptions: number;
    inputFields: number;
  };
  error?: string;
}

export interface IdentifiedInteraction {
  id: string;
  type: InteractionType;
  description: string;
  confidence: number;
  suggestedToolCall?: {
    tool: "tapOn" | "inputText" | "swipeOn";
    params: Record<string, unknown>;
  };
  predictedOutcome?: {
    type: "screen_change" | "dialog" | "expansion" | "unknown";
    destination?: string;
    confidence: number;
  };
  element?: {
    resourceId?: string;
    text?: string;
    contentDescription?: string;
    className: string;
    bounds: ElementBounds;
  };
}

interface InteractionCandidate {
  element: Element;
  typeHint?: InteractionType;
  hasText: boolean;
}

export class IdentifyInteractions {
  private readonly elementFinder = new ElementFinder();
  private readonly elementParser = new ElementParser();
  private readonly geometry = new ElementGeometry();

  analyze(
    observeResult: ObserveResult,
    options: IdentifyInteractionsOptions,
    currentScreen: string | null,
    navigationEdges: NavigationEdge[]
  ): IdentifyInteractionsResult {
    const screenName = currentScreen || "UnknownScreen";
    const viewHierarchy = observeResult.viewHierarchy;

    if (!viewHierarchy?.hierarchy) {
      return {
        success: false,
        screenName,
        interactions: [],
        summary: {
          totalInteractable: 0,
          byType: {},
          navigationOptions: 0,
          inputFields: 0
        },
        error: "No observation available. Call the 'observe' tool first to capture screen state."
      };
    }

    const screenWidth = observeResult.screenSize?.width ?? 0;
    const screenHeight = observeResult.screenSize?.height ?? 0;
    const includeElementDetails = options.includeContext?.elementDetails !== false;
    const includeSuggestedParams = options.includeContext?.suggestedParams !== false;
    const includeNavigation = options.includeContext?.navigationGraph !== false;

    const candidates = this.collectCandidates(viewHierarchy, screenWidth, screenHeight);
    const interactions = this.buildInteractions(
      candidates,
      includeElementDetails,
      includeSuggestedParams,
      includeNavigation ? navigationEdges : [],
      currentScreen
    );

    const filtered = this.applyFilters(interactions, options.filter);
    const summary = this.buildSummary(filtered);

    return {
      success: true,
      screenName,
      interactions: filtered,
      summary
    };
  }

  private collectCandidates(viewHierarchy: NonNullable<ObserveResult["viewHierarchy"]>, screenWidth: number, screenHeight: number): InteractionCandidate[] {
    const candidates: InteractionCandidate[] = [];
    const seen = new Set<string>();

    const addCandidate = (element: Element, typeHint?: InteractionType) => {
      if (!element?.bounds) {
        return;
      }

      if (screenWidth > 0 && screenHeight > 0) {
        if (!this.geometry.isElementVisible(element, screenWidth, screenHeight)) {
          return;
        }
      }

      const key = this.buildElementKey(element);
      if (seen.has(key)) {
        return;
      }

      const hasText = Boolean(this.getElementText(element));
      seen.add(key);
      candidates.push({ element, typeHint, hasText });
    };

    const clickables = this.elementFinder.findClickableElements(viewHierarchy);
    for (const element of clickables) {
      addCandidate(element);
    }

    const scrollables = this.elementFinder.findScrollableElements(viewHierarchy);
    for (const element of scrollables) {
      addCandidate(element, "scroll");
    }

    const flattened = this.elementParser.flattenViewHierarchy(viewHierarchy);
    for (const { element } of flattened) {
      const typeHint = this.getTypeHint(element);
      if (typeHint) {
        addCandidate(element, typeHint);
      }
    }

    return candidates;
  }

  private buildInteractions(
    candidates: InteractionCandidate[],
    includeElementDetails: boolean,
    includeSuggestedParams: boolean,
    navigationEdges: NavigationEdge[],
    currentScreen: string | null
  ): IdentifiedInteraction[] {
    const interactions: IdentifiedInteraction[] = [];
    let index = 1;

    for (const candidate of candidates) {
      const element = candidate.element;
      const type = candidate.typeHint || this.classifyInteraction(element);
      const confidence = this.computeConfidence(element, type, candidate.hasText);

      const identifiers = this.getElementIdentifiers(element);
      if (!identifiers.text && !identifiers.resourceId && !identifiers.contentDescription && type !== "scroll") {
        continue;
      }

      const interaction: IdentifiedInteraction = {
        id: `int_${index++}`,
        type,
        description: this.buildDescription(type, identifiers),
        confidence
      };

      if (includeSuggestedParams) {
        const suggestedToolCall = this.buildSuggestedToolCall(type, identifiers);
        if (suggestedToolCall) {
          interaction.suggestedToolCall = suggestedToolCall;
        }
      }

      if (includeElementDetails) {
        interaction.element = {
          resourceId: identifiers.resourceId,
          text: identifiers.text,
          contentDescription: identifiers.contentDescription,
          className: identifiers.className,
          bounds: element.bounds
        };
      }

      if (navigationEdges.length > 0 && currentScreen) {
        const predictedOutcome = this.matchNavigationOutcome(
          identifiers,
          navigationEdges,
          currentScreen
        );
        if (predictedOutcome) {
          interaction.predictedOutcome = predictedOutcome;
        }
      }

      interactions.push(interaction);
    }

    return interactions;
  }

  private applyFilters(
    interactions: IdentifiedInteraction[],
    filter?: IdentifyInteractionsOptions["filter"]
  ): IdentifiedInteraction[] {
    let filtered = [...interactions];

    if (filter?.types && filter.types.length > 0) {
      const allowed = new Set(filter.types);
      filtered = filtered.filter(interaction => allowed.has(interaction.type));
    }

    if (typeof filter?.minConfidence === "number") {
      filtered = filtered.filter(interaction => interaction.confidence >= filter.minConfidence!);
    }

    if (typeof filter?.limit === "number" && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  private buildSummary(interactions: IdentifiedInteraction[]): IdentifyInteractionsResult["summary"] {
    const byType: Record<string, number> = {};
    let navigationOptions = 0;
    let inputFields = 0;

    for (const interaction of interactions) {
      byType[interaction.type] = (byType[interaction.type] || 0) + 1;
      if (interaction.type === "navigation") {
        navigationOptions += 1;
      }
      if (interaction.type === "input") {
        inputFields += 1;
      }
    }

    return {
      totalInteractable: interactions.length,
      byType,
      navigationOptions,
      inputFields
    };
  }

  private buildElementKey(element: Element): string {
    const bounds = element.bounds;
    const boundsKey = bounds ? `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}` : "";
    return [
      element["resource-id"] || "",
      element.text || "",
      element["content-desc"] || "",
      element.className || element["class"] || "",
      boundsKey
    ].join("|");
  }

  private getElementIdentifiers(element: Element): {
    resourceId?: string;
    text?: string;
    contentDescription?: string;
    className: string;
  } {
    return {
      resourceId: element["resource-id"] ? String(element["resource-id"]) : undefined,
      text: element.text ? String(element.text) : undefined,
      contentDescription: element["content-desc"] ? String(element["content-desc"]) : undefined,
      className: (element.className || element["class"] || "Unknown") as string
    };
  }

  private getElementText(element: Element): string | undefined {
    return element.text || element["content-desc"];
  }

  private getTypeHint(element: Element): InteractionType | undefined {
    if (this.isInputElement(element)) {
      return "input";
    }
    if (this.isToggleElement(element)) {
      return "toggle";
    }
    return undefined;
  }

  private classifyInteraction(element: Element): InteractionType {
    if (this.isInputElement(element)) {
      return "input";
    }
    if (this.isToggleElement(element)) {
      return "toggle";
    }
    if (this.isScrollableElement(element)) {
      return "scroll";
    }
    if (this.isLikelyNavigation(element)) {
      return "navigation";
    }
    return "action";
  }

  private isInputElement(element: Element): boolean {
    const className = this.getClassName(element);
    const inputKeywords = [
      "edittext",
      "textfield",
      "textinput",
      "text field",
      "searchfield",
      "securetext",
      "xcuielementtypetextfield",
      "xcuielementtypesecuretextfield",
      "xcuielementtypesearchfield",
      "xcuielementtypetextview"
    ];

    if (inputKeywords.some(keyword => className.includes(keyword))) {
      return true;
    }

    if (element.password === "true" || element.password === true) {
      return true;
    }

    if (element.focusable === "true" || element.focusable === true) {
      return Boolean(element.text || element["content-desc"] || element["resource-id"]);
    }

    return false;
  }

  private isToggleElement(element: Element): boolean {
    const className = this.getClassName(element);
    const toggleKeywords = [
      "switch",
      "checkbox",
      "toggle",
      "radiobutton",
      "xcuielementtypeswitch",
      "xcuielementtypecheckbox",
      "xcuielementtyperadiobutton"
    ];

    if (toggleKeywords.some(keyword => className.includes(keyword))) {
      return true;
    }

    if (element.checkable === "true" || element.checkable === true) {
      return true;
    }

    return false;
  }

  private isScrollableElement(element: Element): boolean {
    return element.scrollable === "true" || element.scrollable === true;
  }

  private isLikelyNavigation(element: Element): boolean {
    const text = `${element.text || ""} ${element["content-desc"] || ""} ${element["resource-id"] || ""}`
      .toLowerCase();

    const navKeywords = [
      "menu",
      "settings",
      "profile",
      "home",
      "back",
      "next",
      "continue",
      "tab",
      "nav",
      "navigation",
      "search",
      "login",
      "sign",
      "account",
      "more"
    ];

    return navKeywords.some(keyword => text.includes(keyword));
  }

  private getClassName(element: Element): string {
    return (element.className || element["class"] || "").toLowerCase();
  }

  private computeConfidence(element: Element, type: InteractionType, hasText: boolean): number {
    let score = 0.4;

    if (element.clickable === "true" || element.clickable === true) {
      score += 0.2;
    }
    if (element.scrollable === "true" || element.scrollable === true) {
      score += 0.15;
    }
    if (hasText) {
      score += 0.15;
    }
    if (element["resource-id"]) {
      score += 0.1;
    }
    if (element["content-desc"]) {
      score += 0.05;
    }

    switch (type) {
      case "input":
        score = Math.max(score, 0.85);
        break;
      case "toggle":
        score = Math.max(score, 0.8);
        break;
      case "scroll":
        score = Math.max(score, 0.7);
        break;
      case "navigation":
        score = Math.max(score, 0.75);
        if (this.isLikelyNavigation(element)) {
          score += 0.1;
        }
        break;
      case "action":
        score = Math.max(score, 0.6);
        break;
    }

    return Math.min(0.99, Math.max(0.1, Number(score.toFixed(2))));
  }

  private buildDescription(type: InteractionType, identifiers: ReturnType<IdentifyInteractions["getElementIdentifiers"]>): string {
    const label = identifiers.text || identifiers.contentDescription || identifiers.resourceId;

    switch (type) {
      case "input":
        return label ? `${label} input field` : "Input field";
      case "toggle":
        return label ? `${label} toggle` : "Toggle";
      case "scroll":
        return label ? `Scrollable area (${label})` : "Scrollable area";
      case "navigation":
        return label ? `${label} navigation` : "Navigation option";
      case "action":
      default:
        return label ? `${label} action` : "Action";
    }
  }

  private buildSuggestedToolCall(
    type: InteractionType,
    identifiers: ReturnType<IdentifyInteractions["getElementIdentifiers"]>
  ): IdentifiedInteraction["suggestedToolCall"] | undefined {
    if (type === "scroll") {
      const container = identifiers.resourceId
        ? { elementId: identifiers.resourceId }
        : identifiers.text || identifiers.contentDescription
          ? { text: identifiers.text || identifiers.contentDescription }
          : undefined;

      return {
        tool: "swipeOn",
        params: {
          direction: "up", // finger swipes up to reveal content below
          ...(container ? { container } : {})
        }
      };
    }

    const targetText = identifiers.text || identifiers.contentDescription;

    if (identifiers.resourceId) {
      return {
        tool: "tapOn",
        params: {
          id: identifiers.resourceId,
          action: type === "input" ? "focus" : "tap"
        }
      };
    }

    if (targetText) {
      return {
        tool: "tapOn",
        params: {
          text: targetText,
          action: type === "input" ? "focus" : "tap"
        }
      };
    }

    return undefined;
  }

  private matchNavigationOutcome(
    identifiers: ReturnType<IdentifyInteractions["getElementIdentifiers"]>,
    navigationEdges: NavigationEdge[],
    currentScreen: string
  ): IdentifiedInteraction["predictedOutcome"] | undefined {
    let bestMatch: { edge: NavigationEdge; score: number } | null = null;

    for (const edge of navigationEdges) {
      if (!edge.interaction) {
        continue;
      }

      const score = this.scoreEdgeMatch(identifiers, edge);
      if (score <= 0) {
        continue;
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { edge, score };
      }
    }

    if (!bestMatch || bestMatch.score < 0.6) {
      return undefined;
    }

    const edge = bestMatch.edge;
    const destinationChanged = edge.to !== currentScreen;
    const dialogOpened = this.isDialogTransition(edge);

    if (destinationChanged) {
      return {
        type: "screen_change",
        destination: edge.to,
        confidence: Number(bestMatch.score.toFixed(2))
      };
    }

    if (dialogOpened) {
      return {
        type: "dialog",
        confidence: Number(bestMatch.score.toFixed(2))
      };
    }

    return {
      type: "unknown",
      confidence: Number(bestMatch.score.toFixed(2))
    };
  }

  private scoreEdgeMatch(
    identifiers: ReturnType<IdentifyInteractions["getElementIdentifiers"]>,
    edge: NavigationEdge
  ): number {
    const args = edge.interaction?.args || {};
    const edgeText = typeof args.text === "string" ? args.text : undefined;
    const edgeId = typeof args.elementId === "string"
      ? args.elementId
      : typeof args.id === "string"
        ? args.id
        : undefined;

    let score = 0;

    if (edge.interaction?.toolName === "tapOn") {
      if (edgeId && identifiers.resourceId && edgeId === identifiers.resourceId) {
        score = Math.max(score, 0.95);
      }

      if (edgeText && this.textMatches(edgeText, identifiers.text, identifiers.contentDescription)) {
        score = Math.max(score, 0.85);
      }
    }

    const selectedElements = edge.interaction?.uiState?.selectedElements || [];
    if (selectedElements.length > 0) {
      for (const selected of selectedElements) {
        if (selected.resourceId && identifiers.resourceId && selected.resourceId === identifiers.resourceId) {
          score = Math.max(score, 0.8);
        }
        if (selected.text && this.textMatches(selected.text, identifiers.text, identifiers.contentDescription)) {
          score = Math.max(score, 0.75);
        }
        if (selected.contentDesc && this.textMatches(selected.contentDesc, identifiers.text, identifiers.contentDescription)) {
          score = Math.max(score, 0.7);
        }
      }
    }

    return score;
  }

  private textMatches(a: string, b?: string, c?: string): boolean {
    const needle = a.trim().toLowerCase();
    if (!needle) {
      return false;
    }
    const haystacks = [b, c].filter(Boolean).map(value => value!.toLowerCase());
    return haystacks.some(value => value === needle);
  }

  private isDialogTransition(edge: NavigationEdge): boolean {
    const fromCount = edge.fromModalStack?.length ?? 0;
    const toCount = edge.toModalStack?.length ?? 0;
    return toCount > fromCount;
  }
}
