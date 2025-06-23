import { assert } from "chai";
import { PinchToZoom } from "../../../src/features/action/PinchToZoom";
import { FingerPath } from "../../../src/models/FingerPath";

describe("PinchToZoom", () => {
  let pinchToZoom: PinchToZoom;

  beforeEach(() => {
    pinchToZoom = new PinchToZoom();
  });

  describe("calculateMagnitudes", () => {
    it("should calculate correct magnitudes for pinch out", () => {
      const magnitude = 200;
      const direction = "out";

      // Access private method for testing
      const result = (pinchToZoom as any).calculateMagnitudes(direction, magnitude);

      assert.equal(result.endingMagnitude, magnitude);
      assert.equal(result.startingMagnitude, Math.max(50, magnitude * 0.3));
      assert.isTrue(result.startingMagnitude < result.endingMagnitude);
    });

    it("should calculate correct magnitudes for pinch in", () => {
      const magnitude = 200;
      const direction = "in";

      const result = (pinchToZoom as any).calculateMagnitudes(direction, magnitude);

      assert.equal(result.startingMagnitude, magnitude);
      assert.equal(result.endingMagnitude, Math.max(50, magnitude * 0.3));
      assert.isTrue(result.startingMagnitude > result.endingMagnitude);
    });

    it("should respect minimum magnitude of 50 for small values", () => {
      const magnitude = 100; // 30% would be 30, but minimum is 50
      const directionOut = "out";
      const directionIn = "in";

      const resultOut = (pinchToZoom as any).calculateMagnitudes(directionOut, magnitude);
      const resultIn = (pinchToZoom as any).calculateMagnitudes(directionIn, magnitude);

      assert.equal(resultOut.startingMagnitude, 50);
      assert.equal(resultIn.endingMagnitude, 50);
    });

    it("should handle large magnitude values", () => {
      const magnitude = 1000;
      const direction = "out";

      const result = (pinchToZoom as any).calculateMagnitudes(direction, magnitude);

      assert.equal(result.endingMagnitude, 1000);
      assert.equal(result.startingMagnitude, 300); // 30% of 1000
    });
  });

  describe("createFingerPaths", () => {
    it("should create two finger paths with correct structure", () => {
      const centerX = 500;
      const centerY = 800;
      const startingMagnitude = 100;
      const endingMagnitude = 200;

      const result: FingerPath[] = (pinchToZoom as any).createFingerPaths(
        centerX,
        centerY,
        startingMagnitude,
        endingMagnitude
      );

      assert.lengthOf(result, 2);
      assert.equal(result[0].finger, 0);
      assert.equal(result[1].finger, 1);
      assert.lengthOf(result[0].points, 2);
      assert.lengthOf(result[1].points, 2);
    });

    it("should position fingers vertically around center point", () => {
      const centerX = 500;
      const centerY = 800;
      const startingMagnitude = 100;
      const endingMagnitude = 200;

      const result: FingerPath[] = (pinchToZoom as any).createFingerPaths(
        centerX,
        centerY,
        startingMagnitude,
        endingMagnitude
      );

      const finger1 = result[0];
      const finger2 = result[1];

      // Check starting positions
      assert.equal(finger1.points[0].x, centerX);
      assert.equal(finger2.points[0].x, centerX);
      assert.equal(finger1.points[0].y, centerY - startingMagnitude / 2);
      assert.equal(finger2.points[0].y, centerY + startingMagnitude / 2);

      // Check ending positions
      assert.equal(finger1.points[1].x, centerX);
      assert.equal(finger2.points[1].x, centerX);
      assert.equal(finger1.points[1].y, centerY - endingMagnitude / 2);
      assert.equal(finger2.points[1].y, centerY + endingMagnitude / 2);
    });

    it("should create symmetric finger paths", () => {
      const centerX = 400;
      const centerY = 600;
      const startingMagnitude = 80;
      const endingMagnitude = 160;

      const result: FingerPath[] = (pinchToZoom as any).createFingerPaths(
        centerX,
        centerY,
        startingMagnitude,
        endingMagnitude
      );

      const finger1 = result[0];
      const finger2 = result[1];

      // Check that fingers are symmetric around center
      const startDiff1 = Math.abs(finger1.points[0].y - centerY);
      const startDiff2 = Math.abs(finger2.points[0].y - centerY);
      assert.equal(startDiff1, startDiff2);

      const endDiff1 = Math.abs(finger1.points[1].y - centerY);
      const endDiff2 = Math.abs(finger2.points[1].y - centerY);
      assert.equal(endDiff1, endDiff2);
    });

    it("should handle zero magnitude correctly", () => {
      const centerX = 300;
      const centerY = 400;
      const startingMagnitude = 0;
      const endingMagnitude = 100;

      const result: FingerPath[] = (pinchToZoom as any).createFingerPaths(
        centerX,
        centerY,
        startingMagnitude,
        endingMagnitude
      );

      // With zero starting magnitude, both fingers should start at center
      assert.equal(result[0].points[0].y, centerY);
      assert.equal(result[1].points[0].y, centerY);
    });

    it("should handle edge case coordinates", () => {
      const centerX = 0;
      const centerY = 0;
      const startingMagnitude = 40;
      const endingMagnitude = 80;

      const result: FingerPath[] = (pinchToZoom as any).createFingerPaths(
        centerX,
        centerY,
        startingMagnitude,
        endingMagnitude
      );

      // Should work even with zero center coordinates
      assert.equal(result[0].points[0].x, 0);
      assert.equal(result[1].points[0].x, 0);
      assert.equal(result[0].points[0].y, -20); // centerY - startingMagnitude/2
      assert.equal(result[1].points[0].y, 20);  // centerY + startingMagnitude/2
    });
  });
});
