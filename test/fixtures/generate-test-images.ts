/**
 * Generates test PNG images with known color combinations for contrast testing
 * Run with: npx tsx test/fixtures/generate-test-images.ts
 */

import { Jimp } from "jimp";
import * as path from "path";

const OUTPUT_DIR = path.join(__dirname, "screenshots");

interface TestImage {
  filename: string;
  width: number;
  height: number;
  textColor: number; // Jimp hex color
  backgroundColor: number;
  description: string;
}

const testImages: TestImage[] = [
  {
    filename: "black-on-white.png",
    width: 100,
    height: 50,
    textColor: 0x000000ff, // Black
    backgroundColor: 0xffffffff, // White
    description: "Perfect contrast (21:1)",
  },
  {
    filename: "white-on-black.png",
    width: 100,
    height: 50,
    textColor: 0xffffffff, // White
    backgroundColor: 0x000000ff, // Black
    description: "Perfect contrast inverted (21:1)",
  },
  {
    filename: "wcag-aa-minimum.png",
    width: 100,
    height: 50,
    textColor: 0x767676ff, // Gray 118 gives 4.54:1 contrast on white
    backgroundColor: 0xffffffff, // White
    description: "WCAG AA minimum for normal text (4.5:1)",
  },
  {
    filename: "wcag-aa-fail.png",
    width: 100,
    height: 50,
    textColor: 0xaaaaaaff, // Gray 170 gives 2.32:1 contrast (fails AA)
    backgroundColor: 0xffffffff, // White
    description: "Fails WCAG AA (2.5:1)",
  },
  {
    filename: "wcag-aa-large-text.png",
    width: 100,
    height: 50,
    textColor: 0x949494ff, // Gray 148 gives 3.00:1 contrast on white
    backgroundColor: 0xffffffff, // White
    description: "WCAG AA minimum for large text (3:1)",
  },
  {
    filename: "wcag-aaa-normal.png",
    width: 100,
    height: 50,
    textColor: 0x595959ff, // Gray 89 gives 7.005:1 contrast
    backgroundColor: 0xffffffff, // White
    description: "WCAG AAA for normal text (7:1)",
  },
  {
    filename: "blue-on-yellow.png",
    width: 100,
    height: 50,
    textColor: 0x0000ffff, // Blue
    backgroundColor: 0xffff00ff, // Yellow
    description: "Colored text on colored background",
  },
  {
    filename: "small-element.png",
    width: 20,
    height: 10,
    textColor: 0x000000ff,
    backgroundColor: 0xffffffff,
    description: "Small element for size threshold testing",
  },
];

async function generateTestImages(): Promise<void> {
  console.log(`Generating ${testImages.length} test images...`);

  for (const img of testImages) {
    // Create image with background color using the new Jimp API
    const image = new Jimp({ width: img.width, height: img.height, color: img.backgroundColor });

    // Create a text region in the center
    // Make it smaller to ensure edges have background color for sampling
    // ContrastChecker samples from edges (2px border) so we need margin
    const margin = 5; // Leave 5px margin on all sides for background sampling
    const centerStartX = margin;
    const centerEndX = img.width - margin;
    const centerStartY = margin;
    const centerEndY = img.height - margin;

    // Fill center region with text color (excluding margins)
    for (let x = centerStartX; x < centerEndX; x++) {
      for (let y = centerStartY; y < centerEndY; y++) {
        image.setPixelColor(img.textColor, x, y);
      }
    }

    const outputPath = path.join(OUTPUT_DIR, img.filename);
    await image.write(outputPath);
    console.log(`✓ ${img.filename} - ${img.description}`);
  }

  console.log("\nAll test images generated successfully!");
}

generateTestImages().catch(error => {
  console.error("Failed to generate test images:", error);
  process.exit(1);
});
