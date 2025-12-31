// Re-export from new location for backward compatibility
export {
  Image,
  ImageBatch,
  SharpImageTransformer,
} from "./image/ImageTransformer";
export type { ImageOptions, ImageMetadata } from "./image/ImageTransformer";
export { ImageCache } from "./image/ImageCache";

// Import for the interface implementation
import { Image, ImageMetadata } from "./image/ImageTransformer";
import { ImageUtils as ImageUtilsInterface } from "./interfaces/ImageUtils";

const DEFAULT_JPEG_QUALITY = 75;

/**
 * Sharp-based implementation for image utilities
 * Provides a functional API for common image operations using the Sharp library
 */
export class SharpImageUtils implements ImageUtilsInterface {
  public getOriginalBuffer(buffer: Buffer): Buffer {
    return Buffer.from(buffer);
  }

  public async resize(
    buffer: Buffer,
    width: number,
    height?: number,
    maintainAspectRatio = true
  ): Promise<Buffer> {
    const image = Image.fromBuffer(buffer);
    return image.resize(width, height, maintainAspectRatio).toBuffer();
  }

  public async crop(
    buffer: Buffer,
    width: number,
    height: number,
    x = 0,
    y = 0
  ): Promise<Buffer> {
    const image = Image.fromBuffer(buffer);
    return image.crop(width, height, x, y).toBuffer();
  }

  public async rotate(buffer: Buffer, degrees: number): Promise<Buffer> {
    const image = Image.fromBuffer(buffer);
    return image.rotate(degrees).toBuffer();
  }

  public async flip(
    buffer: Buffer,
    direction: "horizontal" | "vertical" | "both"
  ): Promise<Buffer> {
    const image = Image.fromBuffer(buffer);
    return image.flip(direction).toBuffer();
  }

  public async blur(buffer: Buffer, radius: number): Promise<Buffer> {
    const image = Image.fromBuffer(buffer);
    return image.blur(radius).toBuffer();
  }

  public async toJpeg(buffer: Buffer, quality = DEFAULT_JPEG_QUALITY): Promise<Buffer> {
    const image = Image.fromBuffer(buffer);
    return image.jpeg({ quality }).toBuffer();
  }

  public async toPng(buffer: Buffer): Promise<Buffer> {
    const image = Image.fromBuffer(buffer);
    return image.png().toBuffer();
  }

  public async toWebp(
    buffer: Buffer,
    options?: {
      quality?: number;
      lossless?: boolean;
      nearLossless?: boolean;
    }
  ): Promise<Buffer> {
    const image = Image.fromBuffer(buffer);
    return image.webp(options).toBuffer();
  }

  public async getMetadata(buffer: Buffer): Promise<ImageMetadata> {
    const image = Image.fromBuffer(buffer);
    return image.getMetadata();
  }

  public async getExifMetadata(buffer: Buffer): Promise<Record<string, any>> {
    const image = Image.fromBuffer(buffer);
    return image.getExifMetadata();
  }

  public clearCache(): void {
    Image.clearCache();
  }

  public setCacheSize(megabytes: number): void {
    Image.setCacheSize(megabytes);
  }

  public async batchProcess(
    buffers: Buffer[],
    transform: (buffer: Buffer) => Promise<Buffer>
  ): Promise<Buffer[]> {
    const tasks = buffers.map(buffer => transform(buffer));
    return Promise.all(tasks);
  }
}
