/**
 * Fake crypto utils implementation for testing
 * Allows configuration of hash results and verification behavior
 */
import { CryptoService } from "../../src/utils/crypto";

export class FakeCryptoUtils implements CryptoService {
  private cacheKeyMap: Map<string, string> = new Map();
  private checksumResults: Map<string, boolean> = new Map();
  private defaultCacheKey: string = "fake-cache-key-abc123def456";
  private defaultChecksumResult: boolean = true;

  /**
   * Generate MD5 hash for cache key purposes only
   * @param data - Data to hash (string or Buffer)
   * @returns MD5 hash as hex string
   */
  generateCacheKey(data: string | Buffer): string {
    const key = data instanceof Buffer ? data.toString("hex") : data;
    const cached = this.cacheKeyMap.get(key);
    if (cached !== undefined) {
      return cached;
    }
    return this.defaultCacheKey;
  }

  /**
   * Verify buffer checksum using SHA-256
   * @param buffer - Buffer to verify
   * @param expectedChecksum - Expected SHA-256 checksum
   * @returns True if checksums match
   */
  verifyChecksum(buffer: Buffer, expectedChecksum: string): boolean {
    const key = expectedChecksum;
    const result = this.checksumResults.get(key);
    if (result !== undefined) {
      return result;
    }
    return this.defaultChecksumResult;
  }

  // Configuration methods

  /**
   * Set the cache key to return for a specific input
   */
  setCacheKey(data: string | Buffer, cacheKey: string): void {
    const key = data instanceof Buffer ? data.toString("hex") : data;
    this.cacheKeyMap.set(key, cacheKey);
  }

  /**
   * Set the checksum verification result for a specific checksum
   */
  setChecksumResult(expectedChecksum: string, result: boolean): void {
    this.checksumResults.set(expectedChecksum, result);
  }

  /**
   * Set the default cache key to return
   */
  setDefaultCacheKey(cacheKey: string): void {
    this.defaultCacheKey = cacheKey;
  }

  /**
   * Set the default checksum result
   */
  setDefaultChecksumResult(result: boolean): void {
    this.defaultChecksumResult = result;
  }

  /**
   * Clear all configured cache keys
   */
  clearCacheKeys(): void {
    this.cacheKeyMap.clear();
  }

  /**
   * Clear all configured checksum results
   */
  clearChecksumResults(): void {
    this.checksumResults.clear();
  }

  /**
   * Clear all configurations
   */
  clearAllConfigs(): void {
    this.clearCacheKeys();
    this.clearChecksumResults();
  }

  /**
   * Resets the fake to initial state
   */
  reset(): void {
    this.clearAllConfigs();
    this.defaultCacheKey = "fake-cache-key-abc123def456";
    this.defaultChecksumResult = true;
  }
}
