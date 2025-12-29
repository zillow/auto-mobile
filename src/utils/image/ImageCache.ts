/**
 * Cache for processed images to avoid redundant processing
 * Implements a least-recently-used (LRU) eviction policy
 */
export class ImageCache {
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
