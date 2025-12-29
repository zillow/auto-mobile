import sharp from "sharp";
import { logger } from "../logger";

export class PerceptualHasher {
  /**
   * Generate a perceptual hash from image buffer for fast similarity checking
   * @param buffer Image buffer
   * @returns Promise with perceptual hash string
   */
  static async generatePerceptualHash(buffer: Buffer): Promise<string> {
    try {
      // Resize to small standard size for consistent hashing
      const hashBuffer = await sharp(buffer)
        .resize(8, 8, { fit: "fill", kernel: "nearest" })
        .greyscale()
        .raw()
        .toBuffer();

      // Convert to binary hash using average pixel value
      const totalPixels = 64; // 8x8
      const averageValue = hashBuffer.reduce((sum, pixel) => sum + pixel, 0) / totalPixels;

      let hash = "";
      for (let i = 0; i < totalPixels; i++) {
        hash += hashBuffer[i] > averageValue ? "1" : "0";
      }

      return hash;
    } catch (error) {
      logger.warn(`Failed to generate perceptual hash: ${(error as Error).message}`);
      return "";
    }
  }

  /**
   * Calculate Hamming distance between two perceptual hashes
   * @param hash1 First perceptual hash
   * @param hash2 Second perceptual hash
   * @returns Hamming distance (lower = more similar)
   */
  static calculateHammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      return Math.max(hash1.length, hash2.length); // Maximum possible distance
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }
    return distance;
  }

  /**
   * Fast similarity check using perceptual hashes
   * @param hash1 First perceptual hash
   * @param hash2 Second perceptual hash
   * @returns Similarity percentage (0-100)
   */
  static getPerceptualSimilarity(hash1: string, hash2: string): number {
    const distance = PerceptualHasher.calculateHammingDistance(hash1, hash2);
    const maxDistance = Math.max(hash1.length, hash2.length);
    return ((maxDistance - distance) / maxDistance) * 100;
  }
}
