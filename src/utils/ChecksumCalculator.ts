import { execFile } from "child_process";
import { createReadStream } from "fs";
import crypto from "crypto";
import { promisify } from "util";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

export type Sha256Source = "sha256sum" | "shasum" | "node";

export interface ChecksumCalculator {
  computeFileSha256(filePath: string): Promise<{ checksum: string; source: Sha256Source }>;
}

export class DefaultChecksumCalculator implements ChecksumCalculator {
  public async computeFileSha256(filePath: string): Promise<{ checksum: string; source: Sha256Source }> {
    const sha256sum = await this.tryChecksumCommand([filePath], "sha256sum");
    if (sha256sum) {
      return { checksum: sha256sum, source: "sha256sum" };
    }

    const shasum = await this.tryChecksumCommand(["-a", "256", filePath], "shasum");
    if (shasum) {
      return { checksum: shasum, source: "shasum" };
    }

    const hash = crypto.createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.on("data", chunk => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve());
    });
    return { checksum: hash.digest("hex"), source: "node" };
  }

  private async tryChecksumCommand(args: string[], tool: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(tool, args, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024
      });
      const checksum = stdout.trim().split(/\s+/)[0];
      if (!checksum) {
        logger.warn("[ChecksumCalculator] checksum tool returned no output", { tool });
        return null;
      }
      return checksum;
    } catch (error) {
      logger.info("[ChecksumCalculator] checksum tool unavailable, falling back", {
        tool,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
}
