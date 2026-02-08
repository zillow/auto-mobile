import { ObserveResult, ViewHierarchyResult } from "../../models";
import type { ElementFinder } from "../../utils/interfaces/ElementFinder";
import type { ElementParser } from "../../utils/interfaces/ElementParser";
import { DefaultElementFinder } from "../utility/ElementFinder";
import { DefaultElementParser } from "../utility/ElementParser";

export class ObserveElementsBuilder {
  private finder: ElementFinder;
  private parser: ElementParser;

  constructor(
    finder: ElementFinder = new DefaultElementFinder(),
    parser: ElementParser = new DefaultElementParser()
  ) {
    this.finder = finder;
    this.parser = parser;
  }

  build(viewHierarchy: ViewHierarchyResult): ObserveResult["elements"] {
    const clickable = this.finder.findClickableElements(viewHierarchy);
    const scrollable = this.finder.findScrollableElements(viewHierarchy);
    const text = this.parser
      .flattenViewHierarchy(viewHierarchy, { includeWindows: true, windowOrder: "topmost-first" })
      .filter(entry => typeof entry.text === "string" && entry.text.trim().length > 0)
      .map(entry => entry.element);

    return { clickable, scrollable, text };
  }
}
