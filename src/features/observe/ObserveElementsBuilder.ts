import { Element, ObserveResult, ViewHierarchyResult } from "../../models";
import { ElementUtils } from "../utility/ElementUtils";

export interface ElementUtilsLike {
  findClickableElements(viewHierarchy: ViewHierarchyResult): Element[];
  findScrollableElements(viewHierarchy: ViewHierarchyResult): Element[];
  flattenViewHierarchy(
    viewHierarchy: ViewHierarchyResult
  ): Array<{ element: Element; text?: string }>;
}

export class ObserveElementsBuilder {
  private elementUtils: ElementUtilsLike;

  constructor(elementUtils: ElementUtilsLike = new ElementUtils()) {
    this.elementUtils = elementUtils;
  }

  build(viewHierarchy: ViewHierarchyResult): ObserveResult["elements"] {
    const clickable = this.elementUtils.findClickableElements(viewHierarchy);
    const scrollable = this.elementUtils.findScrollableElements(viewHierarchy);
    const text = this.elementUtils
      .flattenViewHierarchy(viewHierarchy)
      .filter(entry => typeof entry.text === "string" && entry.text.trim().length > 0)
      .map(entry => entry.element);

    return { clickable, scrollable, text };
  }
}
