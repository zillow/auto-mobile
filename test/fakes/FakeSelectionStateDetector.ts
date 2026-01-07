import { SelectionDetectionContext, SelectionStateDetectorLike } from "../../src/features/navigation/SelectionStateDetector";
import { SelectedElement } from "../../src/utils/interfaces/NavigationGraph";

export class FakeSelectionStateDetector implements SelectionStateDetectorLike {
  private result: SelectedElement[] = [];
  private contexts: SelectionDetectionContext[] = [];

  setResult(result: SelectedElement[]): void {
    this.result = result;
  }

  getContexts(): SelectionDetectionContext[] {
    return this.contexts;
  }

  async detectSelectedElements(context: SelectionDetectionContext): Promise<SelectedElement[]> {
    this.contexts.push(context);
    return this.result;
  }
}
