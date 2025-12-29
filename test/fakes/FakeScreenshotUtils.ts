import { ScreenshotUtils } from "../../src/utils/interfaces/ScreenshotUtils";

/**
 * Fake implementation of ScreenshotUtils for testing
 * Allows configuring responses for each method and asserting method calls
 */
export class FakeScreenshotUtils implements ScreenshotUtils {
  // Configuration state
  private cachedScreenshots: Map<string, { buffer: Buffer; hash: string }> = new Map();
  private perceptualHashes: Map<string, string> = new Map();
  private pngDetectionResult: boolean = true;
  private convertToPngResult: Buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  private imageDimensions: { width: number; height: number } = { width: 1080, height: 2400 };
  private resizeImageResult: Buffer | null = null;
  private compareImagesResult: { similarity: number; pixelDifference: number; totalPixels: number } = {
    similarity: 100,
    pixelDifference: 0,
    totalPixels: 2592000 // 1080 * 2400
  };
  private screenshotFiles: string[] = [];
  private batchCompareResult: Array<{ filePath: string; similarity: number; matchFound: boolean }> = [];
  private optimizedBatchCompareResult: Array<{ filePath: string; similarity: number; matchFound: boolean }> = [];
  private findSimilarScreenshotsResult: { filePath: string; similarity: number; matchFound: boolean } = {
    filePath: "",
    similarity: 0,
    matchFound: false
  };
  private extractHashResult: string = "1234567890";
  private generateImageHashResult: string = "abcdef0123456789abcdef0123456789";

  // Call tracking
  private methodCalls: Map<string, Array<Record<string, unknown>>> = new Map();

  /**
   * Configure cached screenshot to return
   */
  setCachedScreenshot(filePath: string, buffer: Buffer, hash: string): void {
    this.cachedScreenshots.set(filePath, { buffer, hash });
  }

  /**
   * Configure perceptual hash for a buffer
   */
  setPerceptualHash(bufferId: string, hash: string): void {
    this.perceptualHashes.set(bufferId, hash);
  }

  /**
   * Configure PNG detection result
   */
  setPngDetectionResult(result: boolean): void {
    this.pngDetectionResult = result;
  }

  /**
   * Configure PNG conversion result
   */
  setConvertToPngResult(buffer: Buffer): void {
    this.convertToPngResult = buffer;
  }

  /**
   * Configure image dimensions
   */
  setImageDimensions(width: number, height: number): void {
    this.imageDimensions = { width, height };
  }

  /**
   * Configure resize result
   */
  setResizeImageResult(buffer: Buffer): void {
    this.resizeImageResult = buffer;
  }

  /**
   * Configure comparison result
   */
  setCompareImagesResult(result: { similarity: number; pixelDifference: number; totalPixels: number }): void {
    this.compareImagesResult = result;
  }

  /**
   * Configure screenshot files list
   */
  setScreenshotFiles(files: string[]): void {
    this.screenshotFiles = files;
  }

  /**
   * Configure batch compare result
   */
  setBatchCompareResult(result: Array<{ filePath: string; similarity: number; matchFound: boolean }>): void {
    this.batchCompareResult = result;
  }

  /**
   * Configure optimized batch compare result
   */
  setOptimizedBatchCompareResult(result: Array<{ filePath: string; similarity: number; matchFound: boolean }>): void {
    this.optimizedBatchCompareResult = result;
  }

  /**
   * Configure find similar screenshots result
   */
  setFindSimilarScreenshotsResult(result: { filePath: string; similarity: number; matchFound: boolean }): void {
    this.findSimilarScreenshotsResult = result;
  }

  /**
   * Configure extract hash result
   */
  setExtractHashResult(hash: string): void {
    this.extractHashResult = hash;
  }

  /**
   * Configure generate image hash result
   */
  setGenerateImageHashResult(hash: string): void {
    this.generateImageHashResult = hash;
  }

  /**
   * Get list of method calls for a specific method (for test assertions)
   */
  getMethodCalls(methodName: string): Array<Record<string, unknown>> {
    return this.methodCalls.get(methodName) || [];
  }

  /**
   * Check if a method was called
   */
  wasMethodCalled(methodName: string): boolean {
    const calls = this.methodCalls.get(methodName);
    return calls ? calls.length > 0 : false;
  }

  /**
   * Get count of method calls
   */
  getMethodCallCount(methodName: string): number {
    const calls = this.methodCalls.get(methodName);
    return calls ? calls.length : 0;
  }

  /**
   * Clear all call history
   */
  clearCallHistory(): void {
    this.methodCalls.clear();
  }

  /**
   * Record a method call with parameters
   */
  private recordCall(methodName: string, params: Record<string, unknown>): void {
    if (!this.methodCalls.has(methodName)) {
      this.methodCalls.set(methodName, []);
    }
    this.methodCalls.get(methodName)!.push(params);
  }

  // Implementation of ScreenshotUtils interface

  async getCachedScreenshot(filePath: string): Promise<{ buffer: Buffer; hash: string }> {
    this.recordCall("getCachedScreenshot", { filePath });
    const cached = this.cachedScreenshots.get(filePath);
    if (cached) {
      return cached;
    }
    // Default behavior: return a fake buffer and hash
    return {
      buffer: Buffer.from("fake screenshot data"),
      hash: "1111111111111111111111111111111111111111111111111111111111111111"
    };
  }

  async generatePerceptualHash(buffer: Buffer): Promise<string> {
    const bufferId = buffer.toString("hex").slice(0, 16);
    this.recordCall("generatePerceptualHash", { bufferLength: buffer.length });

    const cached = this.perceptualHashes.get(bufferId);
    if (cached) {
      return cached;
    }
    // Default: return a valid 64-character hash
    return "1111111111111111111111111111111111111111111111111111111111111111";
  }

  calculateHammingDistance(hash1: string, hash2: string): number {
    this.recordCall("calculateHammingDistance", { hash1Length: hash1.length, hash2Length: hash2.length });
    if (hash1.length !== hash2.length) {
      return Math.max(hash1.length, hash2.length);
    }
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }
    return distance;
  }

  getPerceptualSimilarity(hash1: string, hash2: string): number {
    this.recordCall("getPerceptualSimilarity", { hash1Length: hash1.length, hash2Length: hash2.length });
    const distance = this.calculateHammingDistance(hash1, hash2);
    const maxDistance = Math.max(hash1.length, hash2.length);
    return ((maxDistance - distance) / maxDistance) * 100;
  }

  isPngBuffer(buffer: Buffer): boolean {
    this.recordCall("isPngBuffer", { bufferLength: buffer.length });
    return this.pngDetectionResult;
  }

  async convertToPng(buffer: Buffer): Promise<Buffer> {
    this.recordCall("convertToPng", { bufferLength: buffer.length });
    return this.convertToPngResult;
  }

  async getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    this.recordCall("getImageDimensions", { bufferLength: buffer.length });
    return this.imageDimensions;
  }

  async resizeImageIfNeeded(
    buffer: Buffer,
    targetWidth: number,
    targetHeight: number
  ): Promise<Buffer> {
    this.recordCall("resizeImageIfNeeded", { bufferLength: buffer.length, targetWidth, targetHeight });
    if (this.resizeImageResult) {
      return this.resizeImageResult;
    }
    // Default: return original buffer if no custom result set
    return buffer;
  }

  async compareImages(
    buffer1: Buffer,
    buffer2: Buffer,
    threshold: number = 0.1,
    fastMode: boolean = false
  ): Promise<{ similarity: number; pixelDifference: number; totalPixels: number; filePath?: string }> {
    this.recordCall("compareImages", {
      buffer1Length: buffer1.length,
      buffer2Length: buffer2.length,
      threshold,
      fastMode
    });
    return this.compareImagesResult;
  }

  async getScreenshotFiles(cacheDir: string): Promise<string[]> {
    this.recordCall("getScreenshotFiles", { cacheDir });
    return this.screenshotFiles;
  }

  async batchCompareScreenshots(
    targetBuffer: Buffer,
    screenshotPaths: string[],
    tolerancePercent: number = 0.2,
    fastMode: boolean = true
  ): Promise<Array<{ filePath: string; similarity: number; matchFound: boolean }>> {
    this.recordCall("batchCompareScreenshots", {
      targetBufferLength: targetBuffer.length,
      screenshotPathsCount: screenshotPaths.length,
      tolerancePercent,
      fastMode
    });
    return this.batchCompareResult;
  }

  async optimizedBatchCompareScreenshots(
    targetBuffer: Buffer,
    screenshotPaths: string[],
    tolerancePercent: number = 0.2,
    fastMode: boolean = true
  ): Promise<Array<{ filePath: string; similarity: number; matchFound: boolean }>> {
    this.recordCall("optimizedBatchCompareScreenshots", {
      targetBufferLength: targetBuffer.length,
      screenshotPathsCount: screenshotPaths.length,
      tolerancePercent,
      fastMode
    });
    return this.optimizedBatchCompareResult;
  }

  async findSimilarScreenshots(
    targetBuffer: Buffer,
    cacheDir: string,
    tolerancePercent: number = 0.2,
    maxComparisons: number = 10
  ): Promise<{ filePath: string; similarity: number; matchFound: boolean }> {
    this.recordCall("findSimilarScreenshots", {
      targetBufferLength: targetBuffer.length,
      cacheDir,
      tolerancePercent,
      maxComparisons
    });
    return this.findSimilarScreenshotsResult;
  }

  extractHashFromFilename(filePath: string): string {
    this.recordCall("extractHashFromFilename", { filePath });
    return this.extractHashResult;
  }

  generateImageHash(buffer: Buffer): string {
    this.recordCall("generateImageHash", { bufferLength: buffer.length });
    return this.generateImageHashResult;
  }
}
