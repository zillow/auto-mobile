import sharp from "sharp";
import { logger } from "./logger";
import { CryptoUtils } from "./crypto";

const DEFAULT_JPEG_QUALITY = 75;

export interface ImageOptions {
  format?: "jpg" | "png" | "webp";
  quality?: number; // 1-100, for jpg and webp
  lossless?: boolean;
  nearLossless?: boolean;
  resize?: {
    width?: number;
    height?: number;
    maintainAspectRatio?: boolean;
  };
  crop?: {
    width: number;
    height: number;
    x: number;
    y: number;
  };
  rotate?: number; // degrees
  flip?: "horizontal" | "vertical" | "both";
  blur?: number; // radius
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  colorSpace?: string;
  hasAlpha?: boolean;
  exif?: Record<string, any>;
}

// Cache for processed images to avoid redundant processing
class ImageCache {
  private static instance: ImageCache;
  private cache: Map<string, Buffer> = new Map();
  private maxSize: number = 50 * 1024 * 1024; // 50MB default
  private currentSize: number = 0;

  private constructor() {}

  public static getInstance(): ImageCache {
    if (!ImageCache.instance) {
      ImageCache.instance = new ImageCache();
    }
    return ImageCache.instance;
  }

  public setMaxSize(bytes: number): void {
    this.maxSize = bytes;
    this.cleanup();
  }

  public get(key: string): Buffer | undefined {
    const item = this.cache.get(key);
    if (item) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  public set(key: string, buffer: Buffer): void {
    if (buffer.length > this.maxSize) {
      // Don't cache items larger than max cache size
      return;
    }

    // Make room if needed
    if (this.currentSize + buffer.length > this.maxSize) {
      this.cleanup(buffer.length);
    }

    // Store in cache
    this.cache.set(key, buffer);
    this.currentSize += buffer.length;
  }

  private cleanup(requiredSpace: number = 0): void {
    // If we can't fit the new item regardless, don't try
    if (requiredSpace > this.maxSize) {
      return;
    }

    // Remove oldest entries until we have enough space
    const entries = Array.from(this.cache.entries());
    while (this.currentSize + requiredSpace > this.maxSize && entries.length > 0) {
      const [key, buffer] = entries.shift()!;
      this.cache.delete(key);
      this.currentSize -= buffer.length;
    }
  }

  public clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }
}

export class SharpImageTransformer {
  private sharpInstance: sharp.Sharp;
  private options: ImageOptions = {};
  private cacheKey: string | null = null;
  private useCache: boolean = true;

  constructor(private buffer: Buffer) {
    this.sharpInstance = sharp(buffer);
  }

  private generateCacheKey(): string {
    // Create a unique key based on buffer content hash and options
    const optionsStr = JSON.stringify(this.options);
    const bufferHash = CryptoUtils.generateCacheKey(this.buffer);
    return `${bufferHash}_${optionsStr}`;
  }

  public disableCache(): SharpImageTransformer {
    this.useCache = false;
    return this;
  }

  public resize(width: number, height?: number, maintainAspectRatio = true): SharpImageTransformer {
    if (width <= 0) {
      throw new Error("Width must be a positive number");
    }

    const resizeOptions: sharp.ResizeOptions = { width };

    if (height !== undefined) {
      if (height <= 0) {
        throw new Error("Height must be a positive number");
      }
      resizeOptions.height = height;
    }

    if (!maintainAspectRatio) {
      resizeOptions.fit = "fill";
    }

    this.options.resize = {
      width,
      height,
      maintainAspectRatio
    };

    this.sharpInstance = this.sharpInstance.resize(resizeOptions);
    return this;
  }

  public crop(width: number, height: number, x = 0, y = 0): SharpImageTransformer {
    if (width <= 0 || height <= 0) {
      throw new Error("Crop dimensions must be positive numbers");
    }

    this.options.crop = { width, height, x, y };
    this.sharpInstance = this.sharpInstance.extract({ width, height, left: x, top: y });
    return this;
  }

  public rotate(degrees: number): SharpImageTransformer {
    this.options.rotate = degrees;
    this.sharpInstance = this.sharpInstance.rotate(degrees);
    return this;
  }

  public flip(direction: "horizontal" | "vertical" | "both"): SharpImageTransformer {
    this.options.flip = direction;

    switch (direction) {
      case "horizontal":
        this.sharpInstance = this.sharpInstance.flop();
        break;
      case "vertical":
        this.sharpInstance = this.sharpInstance.flip();
        break;
      case "both":
        this.sharpInstance = this.sharpInstance.flip().flop();
        break;
    }

    return this;
  }

  public blur(radius: number): SharpImageTransformer {
    if (radius < 0) {
      throw new Error("Blur radius must be a non-negative number");
    }

    this.options.blur = radius;
    this.sharpInstance = this.sharpInstance.blur(radius);
    return this;
  }

  public jpeg(options?: { quality: number }): SharpImageTransformer {
    const quality = options?.quality || DEFAULT_JPEG_QUALITY;

    if (quality < 1 || quality > 100) {
      throw new Error("JPEG quality must be between 1 and 100");
    }

    this.options.format = "jpg";
    this.options.quality = quality;
    this.sharpInstance = this.sharpInstance.jpeg({ quality });
    return this;
  }

  public png(): SharpImageTransformer {
    this.options.format = "png";
    this.sharpInstance = this.sharpInstance.png();
    return this;
  }

  /**
   * Convert image to WebP format
   * @param options Configuration options
   * @param options.quality Quality from 1-100 (defaults to 75)
   * @param options.lossless Whether to use lossless compression
   * @param options.nearLossless Whether to use near-lossless compression
   */
  public webp(options?: { quality?: number; lossless?: boolean; nearLossless?: boolean }): SharpImageTransformer {
    const quality = options?.quality || DEFAULT_JPEG_QUALITY;

    if (quality < 1 || quality > 100) {
      throw new Error("WebP quality must be between 1 and 100");
    }

    this.options.format = "webp";
    this.options.quality = quality;
    this.options.lossless = options?.lossless;
    this.options.nearLossless = options?.nearLossless;

    const webpOptions: sharp.WebpOptions = { quality };

    if (options?.lossless) {
      webpOptions.lossless = true;
    }

    if (options?.nearLossless) {
      webpOptions.nearLossless = true;
    }

    this.sharpInstance = this.sharpInstance.webp(webpOptions);
    return this;
  }

  public async toBuffer(): Promise<Buffer> {
    const startTime = Date.now();
    const formatInfo = this.options.format || "unknown";
    logger.debug(`[IMAGE] Starting image processing (format: ${formatInfo})`);

    // Check cache first if cache is enabled
    if (this.useCache) {
      const cacheStartTime = Date.now();
      this.cacheKey = this.generateCacheKey();
      const cachedBuffer = ImageCache.getInstance().get(this.cacheKey);
      const cacheDuration = Date.now() - cacheStartTime;

      if (cachedBuffer) {
        const totalDuration = Date.now() - startTime;
        logger.info(`[IMAGE] Cache hit in ${cacheDuration}ms, total: ${totalDuration}ms (${cachedBuffer.length} bytes)`);
        return cachedBuffer;
      }

      logger.debug(`[IMAGE] Cache miss in ${cacheDuration}ms`);
    }

    try {
      const processStartTime = Date.now();
      const resultBuffer = await this.sharpInstance.toBuffer();
      const processDuration = Date.now() - processStartTime;

      // Store result in cache if caching is enabled
      if (this.useCache && this.cacheKey) {
        const cacheStoreStartTime = Date.now();
        ImageCache.getInstance().set(this.cacheKey, resultBuffer);
        const cacheStoreDuration = Date.now() - cacheStoreStartTime;
        logger.debug(`[IMAGE] Cache store took ${cacheStoreDuration}ms`);
      }

      const totalDuration = Date.now() - startTime;
      logger.info(`[IMAGE] Processing completed in ${processDuration}ms, total: ${totalDuration}ms (${this.buffer.length} -> ${resultBuffer.length} bytes)`);
      return resultBuffer;
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      logger.warn(`[IMAGE] Processing failed after ${totalDuration}ms: ${(error as Error).message}`);
      throw new Error(`Sharp image processing error: ${(error as Error).message}`);
    }
  }
}

export class Image {
  constructor(private buffer: Buffer) {}

  public static fromBuffer(buffer: Buffer): Image {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error("Input must be a Buffer");
    }
    return new Image(buffer);
  }

  public getOriginalBuffer(): Buffer {
    return Buffer.from(this.buffer);
  }

  public resize(width: number, height?: number, maintainAspectRatio = true): SharpImageTransformer {
    return new SharpImageTransformer(this.buffer).resize(width, height, maintainAspectRatio);
  }

  public crop(width: number, height: number, x = 0, y = 0): SharpImageTransformer {
    return new SharpImageTransformer(this.buffer).crop(width, height, x, y);
  }

  public rotate(degrees: number): SharpImageTransformer {
    return new SharpImageTransformer(this.buffer).rotate(degrees);
  }

  public flip(direction: "horizontal" | "vertical" | "both"): SharpImageTransformer {
    return new SharpImageTransformer(this.buffer).flip(direction);
  }

  public blur(radius: number): SharpImageTransformer {
    return new SharpImageTransformer(this.buffer).blur(radius);
  }

  public jpeg(options?: { quality: number }): SharpImageTransformer {
    return new SharpImageTransformer(this.buffer).jpeg(options);
  }

  public png(): SharpImageTransformer {
    return new SharpImageTransformer(this.buffer).png();
  }

  /**
   * Convert the image to WebP format
   */
  public webp(options?: { quality?: number; lossless?: boolean; nearLossless?: boolean }): SharpImageTransformer {
    return new SharpImageTransformer(this.buffer).webp(options);
  }

  public transform(): SharpImageTransformer {
    return new SharpImageTransformer(this.buffer);
  }

  /**
   * Get metadata for the image
   */
  public async getMetadata(): Promise<ImageMetadata> {
    try {
      const { width, height, format, space, hasAlpha, exif } = await sharp(this.buffer).metadata();

      return {
        width: width || 0,
        height: height || 0,
        format: format || "",
        size: this.buffer.length,
        colorSpace: space,
        hasAlpha: hasAlpha || false,
        exif: exif ? {} : undefined
      };
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to get image metadata: ${errorMessage}`);
    }
  }

  /**
   * Extract EXIF metadata if available
   */
  public async getExifMetadata(): Promise<Record<string, any>> {
    try {
      const { exif } = await sharp(this.buffer).metadata();
      return exif ? {} : {};
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to get EXIF metadata: ${errorMessage}`);
    }
  }

  // Enhanced utility methods

  public static clearCache(): void {
    ImageCache.getInstance().clear();
  }

  public static setCacheSize(megabytes: number): void {
    ImageCache.getInstance().setMaxSize(megabytes * 1024 * 1024);
  }
}

/**
 * Batch process multiple images with the same transformations
 */
export class ImageBatch {
  private buffers: Buffer[] = [];

  constructor(buffers: Buffer[] = []) {
    this.buffers = buffers;
  }

  public add(buffer: Buffer): ImageBatch {
    this.buffers.push(buffer);
    return this;
  }

  public async process(transform: (image: Image) => SharpImageTransformer): Promise<Buffer[]> {
    const tasks = this.buffers.map(async buffer => {
      const image = new Image(buffer);
      const transformer = transform(image);
      return transformer.toBuffer();
    });

    return Promise.all(tasks);
  }
}
