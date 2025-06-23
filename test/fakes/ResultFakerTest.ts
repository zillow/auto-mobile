import { assert } from "chai";
import { ResultFaker } from "./ResultFaker";

describe("ResultFaker", () => {
  it("should generate fake element bounds", () => {
    const bounds = ResultFaker.elementBounds();
    assert.isNumber(bounds.left);
    assert.isNumber(bounds.top);
    assert.isNumber(bounds.right);
    assert.isNumber(bounds.bottom);
  });

  it("should generate fake elements", () => {
    const element = ResultFaker.element();
    assert.isObject(element);
    assert.isObject(element.bounds);
  });

  it("should generate fake active window info with proper capitalization", () => {
    const info = ResultFaker.activeWindowInfo();
    assert.isString(info.appId);
    assert.isString(info.activityName);

    // Validate the activity name format
    assert.match(info.activityName, /^com\..*\.activities\.[A-Z].*Activity$/);
  });

  it("should respect overrides in activeWindowInfo", () => {
    const customPackage = "com.custom.package";
    const customActivity = "com.custom.package.CustomActivity";

    const info = ResultFaker.activeWindowInfo({
      appId: customPackage,
      activityName: customActivity
    });

    assert.equal(info.appId, customPackage);
    assert.equal(info.activityName, customActivity);
  });
});
