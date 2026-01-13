import { describe, expect, test } from "bun:test";
import { ElementGeometry } from "../../../src/features/utility/ElementGeometry";

describe("ElementGeometry getSwipeWithinBounds", () => {
  test("uses element height for vertical swipe padding", () => {
    const geometry = new ElementGeometry();
    const bounds = { left: 0, top: 378, right: 1000, bottom: 513 };

    const swipe = geometry.getSwipeWithinBounds("down", bounds);

    expect(swipe.startX).toBe(500);
    expect(swipe.endX).toBe(500);
    expect(swipe.startY).toBeCloseTo(391.5, 3);
    expect(swipe.endY).toBeCloseTo(499.5, 3);
  });

  test("uses element width for horizontal swipe padding", () => {
    const geometry = new ElementGeometry();
    const bounds = { left: 800, top: 200, right: 1200, bottom: 600 };

    const swipe = geometry.getSwipeWithinBounds("left", bounds);

    expect(swipe.startY).toBe(400);
    expect(swipe.endY).toBe(400);
    expect(swipe.startX).toBe(1160);
    expect(swipe.endX).toBe(840);
  });
});
