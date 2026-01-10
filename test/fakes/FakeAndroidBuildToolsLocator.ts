import { AndroidBuildToolsLocator, AaptToolLocation } from "../../src/utils/android-cmdline-tools/AndroidBuildToolsLocator";

/**
 * Fake build tools locator for testing
 */
export class FakeAndroidBuildToolsLocator implements AndroidBuildToolsLocator {
  private tool: AaptToolLocation | null = null;

  setTool(tool: AaptToolLocation | null): void {
    this.tool = tool;
  }

  async findAaptTool(): Promise<AaptToolLocation | null> {
    return this.tool;
  }
}
