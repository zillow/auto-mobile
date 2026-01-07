import { ScreenshotCapturer } from "../../src/features/navigation/SelectionStateTracker";

export class FakeScreenshotCapturer implements ScreenshotCapturer {
  private paths: Array<string | null> = [];
  private calls = 0;

  setPaths(paths: Array<string | null>): void {
    this.paths = paths;
    this.calls = 0;
  }

  getCallCount(): number {
    return this.calls;
  }

  async capture(): Promise<string | null> {
    const path = this.paths[this.calls] ?? null;
    this.calls += 1;
    return path;
  }
}
