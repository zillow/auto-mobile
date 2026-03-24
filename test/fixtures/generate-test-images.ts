/**
 * Generates test PNG images with known color combinations for contrast testing
 * Run with: bunx tsx test/fixtures/generate-test-images.ts
 */

import { Jimp, rgbaToInt } from "jimp";
import * as path from "path";

const OUTPUT_DIR = path.join(__dirname, "screenshots");

interface TestImage {
  filename: string;
  width: number;
  height: number;
  textColor: number; // Jimp hex color
  backgroundColor: number;
  description: string;
  render?: (image: Jimp) => Promise<void>;
  textInset?: number;
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
  {
    filename: "gradient-contrast-fail.png",
    width: 120,
    height: 60,
    textColor: 0x333333ff,
    backgroundColor: 0xffffffff,
    description: "Dark text over a light-to-dark vertical gradient",
    render: async (image: Jimp) => {
      const { width, height } = image.bitmap;
      for (let y = 0; y < height; y++) {
        const t = y / (height - 1);
        const shade = Math.round(255 - t * 180); // 255 -> 75
        const color = rgbaToInt(shade, shade, shade, 255);
        for (let x = 0; x < width; x++) {
          image.setPixelColor(color, x, y);
        }
      }
    },
  },
  {
    filename: "overlay-scrim.png",
    width: 120,
    height: 60,
    textColor: 0x000000ff,
    backgroundColor: 0x101010ff,
    description: "Semi-transparent overlay over dark base with opaque text",
    textInset: 24,
    render: async (image: Jimp) => {
      const overlayColor = 0xffffff80; // 50% white overlay
      const overlayLeft = 20;
      const overlayTop = 10;
      const overlayRight = 100;
      const overlayBottom = 50;
      for (let x = overlayLeft; x < overlayRight; x++) {
        for (let y = overlayTop; y < overlayBottom; y++) {
          image.setPixelColor(overlayColor, x, y);
        }
      }
    },
  },
  {
    filename: "overlay-fullscreen.png",
    width: 120,
    height: 60,
    textColor: 0x000000ff,
    backgroundColor: 0x000000ff,
    description: "Full-screen semi-transparent overlay with no opaque pixels",
    textInset: 24,
    render: async (image: Jimp) => {
      const overlayColor = 0xffffff80; // 50% white overlay
      for (let x = 0; x < image.bitmap.width; x++) {
        for (let y = 0; y < image.bitmap.height; y++) {
          image.setPixelColor(overlayColor, x, y);
        }
      }
    },
  },
  {
    filename: "shadowed-text.png",
    width: 120,
    height: 60,
    textColor: 0x7a7a7aff,
    backgroundColor: 0xf5f5f5ff,
    description: "Low-contrast text with a dark shadow halo",
    textInset: 18,
    render: async (image: Jimp) => {
      const shadowColor = 0x222222ff;
      const shadowInset = 16;
      for (let x = shadowInset - 2; x < image.bitmap.width - shadowInset + 2; x++) {
        image.setPixelColor(shadowColor, x, shadowInset - 2);
        image.setPixelColor(shadowColor, x, image.bitmap.height - shadowInset + 1);
      }
      for (let y = shadowInset - 2; y < image.bitmap.height - shadowInset + 2; y++) {
        image.setPixelColor(shadowColor, shadowInset - 2, y);
        image.setPixelColor(shadowColor, image.bitmap.width - shadowInset + 1, y);
      }
    },
  },
];

async function generateTestImages(): Promise<void> {
  console.log(`Generating ${testImages.length} test images...`);

  for (const img of testImages) {
    // Create image with background color using the new Jimp API
    const image = new Jimp({ width: img.width, height: img.height, color: img.backgroundColor });

    if (img.render) {
      await img.render(image);
    }

    const margin = img.textInset ?? 8;
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
