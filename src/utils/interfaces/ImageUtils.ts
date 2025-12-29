/**
 * Interface for image utilities
 * Provides image manipulation, transformation, and metadata extraction capabilities
 *
 * @deprecated This interface has been moved to ../image-utils.ts
 * Import from there instead for better co-location with implementation
 */
export interface ImageUtils {
  /**
   * Get the original buffer from an image
   * @param buffer Image buffer
   * @returns Copy of the original buffer
   */
  getOriginalBuffer(buffer: Buffer): Buffer;

  /**
   * Resize an image
   * @param buffer Image buffer
   * @param width Target width
   * @param height Optional target height
   * @param maintainAspectRatio Whether to maintain aspect ratio (default true)
   * @returns Promise with resized buffer
   */
  resize(
    buffer: Buffer,
    width: number,
    height?: number,
    maintainAspectRatio?: boolean
  ): Promise<Buffer>;

  /**
   * Crop an image
   * @param buffer Image buffer
   * @param width Crop width
   * @param height Crop height
   * @param x X coordinate to start crop (default 0)
   * @param y Y coordinate to start crop (default 0)
   * @returns Promise with cropped buffer
   */
  crop(
    buffer: Buffer,
    width: number,
    height: number,
    x?: number,
    y?: number
  ): Promise<Buffer>;

  /**
   * Rotate an image
   * @param buffer Image buffer
   * @param degrees Rotation degrees
   * @returns Promise with rotated buffer
   */
  rotate(buffer: Buffer, degrees: number): Promise<Buffer>;

  /**
   * Flip an image
   * @param buffer Image buffer
   * @param direction Flip direction (horizontal, vertical, or both)
   * @returns Promise with flipped buffer
   */
  flip(
    buffer: Buffer,
    direction: "horizontal" | "vertical" | "both"
  ): Promise<Buffer>;

  /**
   * Blur an image
   * @param buffer Image buffer
   * @param radius Blur radius
   * @returns Promise with blurred buffer
   */
  blur(buffer: Buffer, radius: number): Promise<Buffer>;

  /**
   * Convert image to JPEG format
   * @param buffer Image buffer
   * @param quality JPEG quality (1-100, default 75)
   * @returns Promise with JPEG buffer
   */
  toJpeg(buffer: Buffer, quality?: number): Promise<Buffer>;

  /**
   * Convert image to PNG format
   * @param buffer Image buffer
   * @returns Promise with PNG buffer
   */
  toPng(buffer: Buffer): Promise<Buffer>;

  /**
   * Convert image to WebP format
   * @param buffer Image buffer
   * @param options WebP options (quality, lossless, nearLossless)
   * @returns Promise with WebP buffer
   */
  toWebp(
    buffer: Buffer,
    options?: {
      quality?: number;
      lossless?: boolean;
      nearLossless?: boolean;
    }
  ): Promise<Buffer>;

  /**
   * Get metadata for an image
   * @param buffer Image buffer
   * @returns Promise with image metadata
   */
  getMetadata(
    buffer: Buffer
  ): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
    colorSpace?: string;
    hasAlpha?: boolean;
    exif?: Record<string, any>;
  }>;

  /**
   * Get EXIF metadata from an image
   * @param buffer Image buffer
   * @returns Promise with EXIF metadata
   */
  getExifMetadata(buffer: Buffer): Promise<Record<string, any>>;

  /**
   * Clear the image cache
   */
  clearCache(): void;

  /**
   * Set the maximum cache size in megabytes
   * @param megabytes Cache size in MB
   */
  setCacheSize(megabytes: number): void;

  /**
   * Process multiple images with the same transformations
   * @param buffers Array of image buffers
   * @param transform Transform function to apply to each image
   * @returns Promise with array of transformed buffers
   */
  batchProcess(
    buffers: Buffer[],
    transform: (buffer: Buffer) => Promise<Buffer>
  ): Promise<Buffer[]>;
}
