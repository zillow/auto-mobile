import fs from "fs-extra";
import path from "path";
import { logger } from "../logger";
import { readFileAsync } from "../io";
import { DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT } from "../constants";
import { ScreenshotComparator } from "./ScreenshotComparator";
import { PerceptualHasher } from "./PerceptualHasher";
import { ScreenshotCache } from "./ScreenshotCache";

export interface SimilarScreenshotResult {
  filePath: string;
  similarity: number;
  matchFound: boolean;
}

export class ScreenshotMatcher {
  /**
   * Batch compare multiple screenshots in parallel for better performance
   * @param targetBuffer Target screenshot buffer to compare against
   * @param screenshotPaths Array of screenshot file paths to compare
   * @param tolerancePercent Similarity tolerance percentage (e.g., 0.2 for 0.2%)
   * @param fastMode Enable fast mode for bulk comparisons
   * @returns Promise with array of comparison results
   */
  static async batchCompareScreenshots(
    targetBuffer: Buffer,
    screenshotPaths: string[],
    tolerancePercent: number = DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
    fastMode: boolean = true
  ): Promise<Array<{ filePath: string; similarity: number; matchFound: boolean }>> {
    const batchStart = Date.now();
    const minSimilarity = 100 - tolerancePercent;

    logger.info(`Starting batch comparison of ${screenshotPaths.length} screenshots (fast mode: ${fastMode})`);

    try {
      const comparisonPromises = screenshotPaths.map(async filePath => {
        try {
          const cachedBuffer = await readFileAsync(filePath);
          const comparisonResult = await ScreenshotComparator.compareImages(targetBuffer, cachedBuffer, 0.1, fastMode);

          return {
            filePath,
            similarity: comparisonResult.similarity,
            matchFound: comparisonResult.similarity >= minSimilarity
          };
        } catch (error) {
          logger.debug(`Failed to compare ${path.basename(filePath)}: ${(error as Error).message}`);
          return {
            filePath,
            similarity: 0,
            matchFound: false
          };
        }
      });

      const results = await Promise.all(comparisonPromises);
      const batchTime = Date.now() - batchStart;

      const matches = results.filter(r => r.matchFound);
      logger.info(`Batch comparison completed in ${batchTime}ms: ${matches.length}/${results.length} matches found`);

      return results;
    } catch (error) {
      const batchTime = Date.now() - batchStart;
      logger.warn(`Batch comparison failed after ${batchTime}ms: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Two-stage batch comparison: fast perceptual hash filtering + precise pixel comparison
   * @param targetBuffer Target screenshot buffer to compare against
   * @param screenshotPaths Array of screenshot file paths to compare
   * @param tolerancePercent Similarity tolerance percentage (e.g., 0.2 for 0.2%)
   * @param fastMode Enable fast mode for bulk comparisons
   * @returns Promise with array of comparison results
   */
  static async optimizedBatchCompareScreenshots(
    targetBuffer: Buffer,
    screenshotPaths: string[],
    tolerancePercent: number = DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
    fastMode: boolean = true
  ): Promise<Array<{ filePath: string; similarity: number; matchFound: boolean }>> {
    const batchStart = Date.now();
    const minSimilarity = 100 - tolerancePercent;

    logger.info(`Starting optimized two-stage batch comparison of ${screenshotPaths.length} screenshots`);

    try {
      // Stage 1: Fast perceptual hash filtering
      const targetPerceptualHash = await PerceptualHasher.generatePerceptualHash(targetBuffer);
      logger.debug(`Target perceptual hash: ${targetPerceptualHash}`);

      // Load all screenshots and their perceptual hashes in parallel
      const stage1Results = await Promise.all(
        screenshotPaths.map(async filePath => {
          try {
            const { buffer, hash } = await ScreenshotCache.getCachedScreenshot(filePath);
            const perceptualSimilarity = PerceptualHasher.getPerceptualSimilarity(targetPerceptualHash, hash);

            return {
              filePath,
              buffer,
              perceptualSimilarity,
              isCandidate: perceptualSimilarity >= (minSimilarity - 10) // 10% buffer for perceptual hash
            };
          } catch (error) {
            logger.debug(`Failed to process ${path.basename(filePath)}: ${(error as Error).message}`);
            return null;
          }
        })
      );

      const candidates = stage1Results
        .filter((result): result is NonNullable<typeof result> => result !== null && result.isCandidate);

      const stage1Time = Date.now() - batchStart;
      logger.info(`Stage 1 (perceptual hash) completed in ${stage1Time}ms: ${candidates.length}/${screenshotPaths.length} candidates selected`);

      if (candidates.length === 0) {
        return screenshotPaths.map(filePath => ({
          filePath,
          similarity: 0,
          matchFound: false
        }));
      }

      // Stage 2: Precise pixel comparison for candidates only
      const stage2Start = Date.now();
      const preciseResults = await Promise.all(
        candidates.map(async candidate => {
          try {
            const comparisonResult = await ScreenshotComparator.compareImages(
              targetBuffer,
              candidate.buffer,
              0.1,
              fastMode
            );

            return {
              filePath: candidate.filePath,
              similarity: comparisonResult.similarity,
              matchFound: comparisonResult.similarity >= minSimilarity
            };
          } catch (error) {
            logger.debug(`Stage 2 failed for ${path.basename(candidate.filePath)}: ${(error as Error).message}`);
            return {
              filePath: candidate.filePath,
              similarity: 0,
              matchFound: false
            };
          }
        })
      );

      // Fill in results for non-candidates
      const finalResults = screenshotPaths.map(filePath => {
        const preciseResult = preciseResults.find(r => r.filePath === filePath);
        if (preciseResult) {
          return preciseResult;
        }

        // For non-candidates, use perceptual similarity as approximate result
        const stage1Result = stage1Results.find(r => r?.filePath === filePath);
        return {
          filePath,
          similarity: stage1Result?.perceptualSimilarity || 0,
          matchFound: false
        };
      });

      const stage2Time = Date.now() - stage2Start;
      const totalTime = Date.now() - batchStart;
      const matches = finalResults.filter(r => r.matchFound);

      logger.info(`Stage 2 (pixel comparison) completed in ${stage2Time}ms for ${candidates.length} candidates`);
      logger.info(`Optimized batch comparison completed in ${totalTime}ms: ${matches.length}/${screenshotPaths.length} matches found`);

      return finalResults;
    } catch (error) {
      const totalTime = Date.now() - batchStart;
      logger.warn(`Optimized batch comparison failed after ${totalTime}ms: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Find similar screenshots in cache directory within tolerance
   * @param targetBuffer Target screenshot buffer to compare against
   * @param cacheDir Cache directory to search
   * @param tolerancePercent Similarity tolerance percentage (e.g., 0.2 for 0.2%)
   * @param maxComparisons Maximum number of files to compare (default 10)
   * @returns Promise with similar screenshot result
   */
  static async findSimilarScreenshots(
    targetBuffer: Buffer,
    cacheDir: string,
    tolerancePercent: number = DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
    maxComparisons: number = 10
  ): Promise<SimilarScreenshotResult> {
    const searchStart = Date.now();
    const minSimilarity = 100 - tolerancePercent;

    logger.info(`Searching for screenshots with ≥${minSimilarity}% similarity (tolerance: ${tolerancePercent}%) in ${cacheDir}`);

    try {
      const screenshotFiles = await ScreenshotCache.getScreenshotFiles(cacheDir);

      if (screenshotFiles.length === 0) {
        logger.info("No screenshot files found in cache directory");
        return {
          filePath: "",
          similarity: 0,
          matchFound: false
        };
      }

      // Sort files by modification time (newest first) to check recent screenshots first
      const filesWithStats = await Promise.all(
        screenshotFiles.map(async filePath => {
          const stats = await fs.stat(filePath);
          return { filePath, mtime: stats.mtime.getTime() };
        })
      );

      filesWithStats.sort((a, b) => b.mtime - a.mtime);
      const filesToCheck = filesWithStats.slice(0, maxComparisons);

      logger.info(`Comparing against ${filesToCheck.length} most recent screenshots (max: ${maxComparisons})`);

      let bestMatch: SimilarScreenshotResult = {
        filePath: "",
        similarity: 0,
        matchFound: false
      };

      for (const { filePath } of filesToCheck) {
        try {
          logger.debug(`Comparing against: ${path.basename(filePath)}`);

          const cachedBuffer = await readFileAsync(filePath);
          const comparisonResult = await ScreenshotComparator.compareImages(targetBuffer, cachedBuffer, 0.1, true);

          logger.info(`${path.basename(filePath)}: ${comparisonResult.similarity.toFixed(2)}% similarity (${comparisonResult.pixelDifference}/${comparisonResult.totalPixels} different pixels)`);

          if (comparisonResult.similarity > bestMatch.similarity) {
            bestMatch = {
              filePath,
              similarity: comparisonResult.similarity,
              matchFound: comparisonResult.similarity >= minSimilarity
            };
          }

          // If we found a match within tolerance, we can stop searching
          if (comparisonResult.similarity >= minSimilarity) {
            logger.info(`✓ Found matching screenshot: ${path.basename(filePath)} (${comparisonResult.similarity.toFixed(2)}% similarity)`);
            break;
          }
        } catch (error) {
          logger.warn(`Failed to compare against ${path.basename(filePath)}: ${(error as Error).message}`);
        }
      }

      const searchTime = Date.now() - searchStart;

      if (bestMatch.matchFound) {
        logger.info(`Screenshot search completed in ${searchTime}ms: Found match with ${bestMatch.similarity.toFixed(2)}% similarity`);
      } else {
        logger.info(`Screenshot search completed in ${searchTime}ms: No match found (best: ${bestMatch.similarity.toFixed(2)}%)`);
      }

      return bestMatch;
    } catch (error) {
      const searchTime = Date.now() - searchStart;
      logger.warn(`Screenshot search failed after ${searchTime}ms: ${(error as Error).message}`);

      return {
        filePath: "",
        similarity: 0,
        matchFound: false
      };
    }
  }
}
