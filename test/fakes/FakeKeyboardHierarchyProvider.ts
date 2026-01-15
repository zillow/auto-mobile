import { KeyboardHierarchyProvider } from "../../src/features/action/Keyboard";
import { ViewHierarchyResult } from "../../src/models";

export class FakeKeyboardHierarchyProvider implements KeyboardHierarchyProvider {
  private results: Array<ViewHierarchyResult | null> = [];
  private defaultResult: ViewHierarchyResult | null = null;
  private callCount: number = 0;

  setResults(results: Array<ViewHierarchyResult | null>): void {
    this.results = [...results];
  }

  setDefaultResult(result: ViewHierarchyResult | null): void {
    this.defaultResult = result;
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.results = [];
    this.defaultResult = null;
    this.callCount = 0;
  }

  async getViewHierarchy(): Promise<ViewHierarchyResult | null> {
    this.callCount += 1;
    if (this.results.length > 0) {
      return this.results.shift() ?? null;
    }
    return this.defaultResult;
  }
}
