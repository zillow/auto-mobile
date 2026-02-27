import { describe, it, expect } from "bun:test";
import { resolveSwipeDirection, SCROLL_TO_FINGER_DIRECTION } from "../../src/utils/swipeOnUtils";
import { SwipeDirection } from "../../src/models";

describe("SCROLL_TO_FINGER_DIRECTION", () => {
  it("maps all four scroll directions to their finger-swipe inverses", () => {
    expect(SCROLL_TO_FINGER_DIRECTION.up).toBe("down");
    expect(SCROLL_TO_FINGER_DIRECTION.down).toBe("up");
    expect(SCROLL_TO_FINGER_DIRECTION.left).toBe("right");
    expect(SCROLL_TO_FINGER_DIRECTION.right).toBe("left");
  });
});

describe("resolveSwipeDirection", () => {
  describe("missing direction", () => {
    it("returns an error when direction is undefined", () => {
      const result = resolveSwipeDirection({ direction: undefined });
      expect(result.error).toBe("direction is required");
      expect(result.direction).toBeUndefined();
    });
  });

  describe("swipeFingerTowardsDirection (default)", () => {
    it("returns direction unchanged when no gestureType provided", () => {
      const result = resolveSwipeDirection({ direction: "up" });
      expect(result.direction).toBe("up");
      expect(result.error).toBeUndefined();
      expect(result.message).toContain("up");
      expect(result.message).toContain("finger");
    });

    it("returns direction unchanged for explicit swipeFingerTowardsDirection", () => {
      const directions: SwipeDirection[] = ["up", "down", "left", "right"];
      for (const direction of directions) {
        const result = resolveSwipeDirection({ direction, gestureType: "swipeFingerTowardsDirection" });
        expect(result.direction).toBe(direction);
        expect(result.error).toBeUndefined();
      }
    });
  });

  describe("scrollTowardsDirection", () => {
    it("inverts 'up' to 'down' (scroll content up → finger moves down)", () => {
      const result = resolveSwipeDirection({ direction: "up", gestureType: "scrollTowardsDirection" });
      expect(result.direction).toBe("down");
      expect(result.error).toBeUndefined();
      expect(result.message).toContain("above");
    });

    it("inverts 'down' to 'up' (scroll content down → finger moves up)", () => {
      const result = resolveSwipeDirection({ direction: "down", gestureType: "scrollTowardsDirection" });
      expect(result.direction).toBe("up");
      expect(result.error).toBeUndefined();
      expect(result.message).toContain("below");
    });

    it("inverts 'left' to 'right' (scroll content left → finger moves right)", () => {
      const result = resolveSwipeDirection({ direction: "left", gestureType: "scrollTowardsDirection" });
      expect(result.direction).toBe("right");
      expect(result.error).toBeUndefined();
      expect(result.message).toContain("from left");
    });

    it("inverts 'right' to 'left' (scroll content right → finger moves left)", () => {
      const result = resolveSwipeDirection({ direction: "right", gestureType: "scrollTowardsDirection" });
      expect(result.direction).toBe("left");
      expect(result.error).toBeUndefined();
      expect(result.message).toContain("from right");
    });

    it("includes the original scroll direction in the message", () => {
      const result = resolveSwipeDirection({ direction: "up", gestureType: "scrollTowardsDirection" });
      expect(result.message).toContain("up");
    });
  });

  describe("regression: object API required (not positional args)", () => {
    it("returns error when direction field is missing from options object", () => {
      // The old call site used resolveSwipeDirection(args.direction, args.gestureType) with
      // positional args. The function signature requires an options object. Passing a string
      // as the options object results in direction being undefined inside the function.
      const stringAsOptions = "up" as any;
      const result = resolveSwipeDirection(stringAsOptions);
      expect(result.error).toBe("direction is required");
    });
  });
});
