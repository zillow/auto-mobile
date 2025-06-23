import crypto from "crypto";

/**
 * Centralized crypto utilities for AutoMobile MCP
 *
 * SECURITY NOTE: MD5 is only used for cache key generation and non-security purposes.
 * For all security-sensitive operations, use SHA-256 or stronger algorithms.
 */
export class CryptoUtils {

  /**
   * Generate MD5 hash for cache key purposes only
   * WARNING: MD5 is cryptographically broken and should NEVER be used for:
   * - Password hashing
   * - Security-sensitive data
   * - Digital signatures
   * - Any security-critical operations
   *
   * This method is ONLY for generating cache keys where collision resistance
   * is not critical and backward compatibility is required.
   *
   * @param data - Data to hash (string or Buffer)
   * @returns MD5 hash as hex string
   */
  static generateCacheKey(data: string | Buffer): string {
    return crypto.createHash("md5").update(data).digest("hex");
  }

  /**
   * Verify buffer checksum using SHA-256
   *
   * @param buffer - Buffer to verify
   * @param expectedChecksum - Expected SHA-256 checksum
   * @returns True if checksums match
   */
  static verifyChecksum(buffer: Buffer, expectedChecksum: string): boolean {
    const actualChecksum = crypto.createHash("sha256").update(buffer).digest("hex");
    return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
  }
}
