import { expect, describe, it } from "bun:test";
import { ResultFaker } from "./ResultFaker";

describe("ResultFaker", () => {
  it("should generate fake element bounds", () => {
    const bounds = ResultFaker.elementBounds();
    expect(bounds.left).toBeTypeOf("number");
    expect(bounds.top).toBeTypeOf("number");
    expect(bounds.right).toBeTypeOf("number");
    expect(bounds.bottom).toBeTypeOf("number");
  });

  it("should generate fake elements", () => {
    const element = ResultFaker.element();
    expect(element).toBeTypeOf("object");
    expect(element.bounds).toBeTypeOf("object");
  });

  it("should generate fake active window info with proper capitalization", () => {
    const info = ResultFaker.activeWindowInfo();
    expect(info.appId).toBeTypeOf("string");
    expect(info.activityName).toBeTypeOf("string");

    // Validate the activity name format
    expect(info.activityName).toMatch(/^com\..*\.activities\.[A-Z].*Activity$/);
  });

  it("should respect overrides in activeWindowInfo", () => {
    const customPackage = "com.custom.package";
    const customActivity = "com.custom.package.CustomActivity";

    const info = ResultFaker.activeWindowInfo({
      appId: customPackage,
      activityName: customActivity
    });

    expect(info.appId).toBe(customPackage);
    expect(info.activityName).toBe(customActivity);
  });
});
