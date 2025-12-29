import { ImageUtils } from "../../src/utils/interfaces/ImageUtils";

/**
 * Fake implementation of ImageUtils for testing
 * Allows configuring responses for each method and asserting method calls
 */
export class FakeImageUtils implements ImageUtils {
  // Configuration state
  private originalBufferResult: Buffer = Buffer.from("original buffer data");
  private resizeResult: Buffer = Buffer.from("resized buffer data");
  private cropResult: Buffer = Buffer.from("cropped buffer data");
  private rotateResult: Buffer = Buffer.from("rotated buffer data");
  private flipResult: Buffer = Buffer.from("flipped buffer data");
  private blurResult: Buffer = Buffer.from("blurred buffer data");
  private jpegResult: Buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG magic bytes
  private pngResult: Buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG magic bytes
  private webpResult: Buffer = Buffer.from("RIFF");
  private metadataResult = {
    width: 1080,
    height: 2400,
    format: "png",
    size: 1024000,
    colorSpace: "srgb",
    hasAlpha: false,
    exif: undefined
  };
  private exifMetadataResult: Record<string, any> = {};
  private batchProcessResult: Buffer[] = [];

  // Error injection
  private shouldThrowOnGetOriginalBuffer: boolean = false;
  private shouldThrowOnResize: boolean = false;
  private shouldThrowOnCrop: boolean = false;
  private shouldThrowOnRotate: boolean = false;
  private shouldThrowOnFlip: boolean = false;
  private shouldThrowOnBlur: boolean = false;
  private shouldThrowOnToJpeg: boolean = false;
  private shouldThrowOnToPng: boolean = false;
  private shouldThrowOnToWebp: boolean = false;
  private shouldThrowOnGetMetadata: boolean = false;
  private shouldThrowOnGetExifMetadata: boolean = false;
  private shouldThrowOnBatchProcess: boolean = false;

  // Call tracking
  private methodCalls: Map<string, Array<Record<string, unknown>>> = new Map();

  /**
   * Configure original buffer result
   */
  setOriginalBufferResult(buffer: Buffer): void {
    this.originalBufferResult = buffer;
  }

  /**
   * Configure resize result
   */
  setResizeResult(buffer: Buffer): void {
    this.resizeResult = buffer;
  }

  /**
   * Configure crop result
   */
  setCropResult(buffer: Buffer): void {
    this.cropResult = buffer;
  }

  /**
   * Configure rotate result
   */
  setRotateResult(buffer: Buffer): void {
    this.rotateResult = buffer;
  }

  /**
   * Configure flip result
   */
  setFlipResult(buffer: Buffer): void {
    this.flipResult = buffer;
  }

  /**
   * Configure blur result
   */
  setBlurResult(buffer: Buffer): void {
    this.blurResult = buffer;
  }

  /**
   * Configure JPEG result
   */
  setJpegResult(buffer: Buffer): void {
    this.jpegResult = buffer;
  }

  /**
   * Configure PNG result
   */
  setPngResult(buffer: Buffer): void {
    this.pngResult = buffer;
  }

  /**
   * Configure WebP result
   */
  setWebpResult(buffer: Buffer): void {
    this.webpResult = buffer;
  }

  /**
   * Configure metadata result
   */
  setMetadataResult(metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
    colorSpace?: string;
    hasAlpha?: boolean;
    exif?: Record<string, any>;
  }): void {
    this.metadataResult = metadata;
  }

  /**
   * Configure EXIF metadata result
   */
  setExifMetadataResult(exif: Record<string, any>): void {
    this.exifMetadataResult = exif;
  }

  /**
   * Configure batch process result
   */
  setBatchProcessResult(buffers: Buffer[]): void {
    this.batchProcessResult = buffers;
  }

  /**
   * Enable error throwing for getOriginalBuffer
   */
  setShouldThrowOnGetOriginalBuffer(shouldThrow: boolean): void {
    this.shouldThrowOnGetOriginalBuffer = shouldThrow;
  }

  /**
   * Enable error throwing for resize
   */
  setShouldThrowOnResize(shouldThrow: boolean): void {
    this.shouldThrowOnResize = shouldThrow;
  }

  /**
   * Enable error throwing for crop
   */
  setShouldThrowOnCrop(shouldThrow: boolean): void {
    this.shouldThrowOnCrop = shouldThrow;
  }

  /**
   * Enable error throwing for rotate
   */
  setShouldThrowOnRotate(shouldThrow: boolean): void {
    this.shouldThrowOnRotate = shouldThrow;
  }

  /**
   * Enable error throwing for flip
   */
  setShouldThrowOnFlip(shouldThrow: boolean): void {
    this.shouldThrowOnFlip = shouldThrow;
  }

  /**
   * Enable error throwing for blur
   */
  setShouldThrowOnBlur(shouldThrow: boolean): void {
    this.shouldThrowOnBlur = shouldThrow;
  }

  /**
   * Enable error throwing for toJpeg
   */
  setShouldThrowOnToJpeg(shouldThrow: boolean): void {
    this.shouldThrowOnToJpeg = shouldThrow;
  }

  /**
   * Enable error throwing for toPng
   */
  setShouldThrowOnToPng(shouldThrow: boolean): void {
    this.shouldThrowOnToPng = shouldThrow;
  }

  /**
   * Enable error throwing for toWebp
   */
  setShouldThrowOnToWebp(shouldThrow: boolean): void {
    this.shouldThrowOnToWebp = shouldThrow;
  }

  /**
   * Enable error throwing for getMetadata
   */
  setShouldThrowOnGetMetadata(shouldThrow: boolean): void {
    this.shouldThrowOnGetMetadata = shouldThrow;
  }

  /**
   * Enable error throwing for getExifMetadata
   */
  setShouldThrowOnGetExifMetadata(shouldThrow: boolean): void {
    this.shouldThrowOnGetExifMetadata = shouldThrow;
  }

  /**
   * Enable error throwing for batchProcess
   */
  setShouldThrowOnBatchProcess(shouldThrow: boolean): void {
    this.shouldThrowOnBatchProcess = shouldThrow;
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

  // Implementation of ImageUtils interface

  getOriginalBuffer(buffer: Buffer): Buffer {
    this.recordCall("getOriginalBuffer", { bufferLength: buffer.length });
    if (this.shouldThrowOnGetOriginalBuffer) {
      throw new Error("Simulated error in getOriginalBuffer");
    }
    return this.originalBufferResult;
  }

  async resize(
    buffer: Buffer,
    width: number,
    height?: number,
    maintainAspectRatio = true
  ): Promise<Buffer> {
    this.recordCall("resize", { bufferLength: buffer.length, width, height, maintainAspectRatio });
    if (this.shouldThrowOnResize) {
      throw new Error("Simulated error in resize");
    }
    return this.resizeResult;
  }

  async crop(
    buffer: Buffer,
    width: number,
    height: number,
    x = 0,
    y = 0
  ): Promise<Buffer> {
    this.recordCall("crop", { bufferLength: buffer.length, width, height, x, y });
    if (this.shouldThrowOnCrop) {
      throw new Error("Simulated error in crop");
    }
    return this.cropResult;
  }

  async rotate(buffer: Buffer, degrees: number): Promise<Buffer> {
    this.recordCall("rotate", { bufferLength: buffer.length, degrees });
    if (this.shouldThrowOnRotate) {
      throw new Error("Simulated error in rotate");
    }
    return this.rotateResult;
  }

  async flip(
    buffer: Buffer,
    direction: "horizontal" | "vertical" | "both"
  ): Promise<Buffer> {
    this.recordCall("flip", { bufferLength: buffer.length, direction });
    if (this.shouldThrowOnFlip) {
      throw new Error("Simulated error in flip");
    }
    return this.flipResult;
  }

  async blur(buffer: Buffer, radius: number): Promise<Buffer> {
    this.recordCall("blur", { bufferLength: buffer.length, radius });
    if (this.shouldThrowOnBlur) {
      throw new Error("Simulated error in blur");
    }
    return this.blurResult;
  }

  async toJpeg(buffer: Buffer, quality = 75): Promise<Buffer> {
    this.recordCall("toJpeg", { bufferLength: buffer.length, quality });
    if (this.shouldThrowOnToJpeg) {
      throw new Error("Simulated error in toJpeg");
    }
    return this.jpegResult;
  }

  async toPng(buffer: Buffer): Promise<Buffer> {
    this.recordCall("toPng", { bufferLength: buffer.length });
    if (this.shouldThrowOnToPng) {
      throw new Error("Simulated error in toPng");
    }
    return this.pngResult;
  }

  async toWebp(
    buffer: Buffer,
    options?: {
      quality?: number;
      lossless?: boolean;
      nearLossless?: boolean;
    }
  ): Promise<Buffer> {
    this.recordCall("toWebp", {
      bufferLength: buffer.length,
      quality: options?.quality,
      lossless: options?.lossless,
      nearLossless: options?.nearLossless
    });
    if (this.shouldThrowOnToWebp) {
      throw new Error("Simulated error in toWebp");
    }
    return this.webpResult;
  }

  async getMetadata(buffer: Buffer): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
    colorSpace?: string;
    hasAlpha?: boolean;
    exif?: Record<string, any>;
  }> {
    this.recordCall("getMetadata", { bufferLength: buffer.length });
    if (this.shouldThrowOnGetMetadata) {
      throw new Error("Simulated error in getMetadata");
    }
    return this.metadataResult;
  }

  async getExifMetadata(buffer: Buffer): Promise<Record<string, any>> {
    this.recordCall("getExifMetadata", { bufferLength: buffer.length });
    if (this.shouldThrowOnGetExifMetadata) {
      throw new Error("Simulated error in getExifMetadata");
    }
    return this.exifMetadataResult;
  }

  clearCache(): void {
    this.recordCall("clearCache", {});
  }

  setCacheSize(megabytes: number): void {
    this.recordCall("setCacheSize", { megabytes });
  }

  async batchProcess(
    buffers: Buffer[],
    transform: (buffer: Buffer) => Promise<Buffer>
  ): Promise<Buffer[]> {
    this.recordCall("batchProcess", { bufferCount: buffers.length });
    if (this.shouldThrowOnBatchProcess) {
      throw new Error("Simulated error in batchProcess");
    }
    if (this.batchProcessResult.length > 0) {
      return this.batchProcessResult;
    }
    // Default: apply transform to each buffer
    return Promise.all(buffers.map(buffer => transform(buffer)));
  }
}
