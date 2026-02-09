import { execFile } from "child_process";
import { createWriteStream } from "fs";
import * as fs from "fs/promises";
import http from "http";
import https from "https";
import * as path from "path";
import { promisify } from "util";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

export interface FileDownloader {
  download(url: string, destination: string): Promise<void>;
}

export class DefaultFileDownloader implements FileDownloader {
  public async download(url: string, destination: string): Promise<void> {
    try {
      await this.downloadWithCurl(url, destination);
      return;
    } catch (error) {
      if (!this.isCommandUnavailable(error, "curl")) {
        throw error;
      }
      logger.warn("[FileDownloader] curl unavailable, falling back to wget", {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      await this.downloadWithWget(url, destination);
      return;
    } catch (error) {
      if (!this.isCommandUnavailable(error, "wget")) {
        throw error;
      }
      logger.warn("[FileDownloader] wget unavailable, falling back to Node HTTP", {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    await this.downloadWithNodeHttp(url, destination, 0);
  }

  private async downloadWithCurl(url: string, destination: string): Promise<void> {
    await execFileAsync("curl", [
      "--fail",
      "--location",
      "--retry",
      "3",
      "--retry-delay",
      "1",
      "--silent",
      "--show-error",
      "-o",
      destination,
      url
    ], { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
  }

  private async downloadWithWget(url: string, destination: string): Promise<void> {
    await execFileAsync("wget", [
      "--tries=3",
      "--timeout=30",
      "-O",
      destination,
      url
    ], { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
  }

  private async downloadWithNodeHttp(url: string, destination: string, redirectCount: number): Promise<void> {
    if (redirectCount > 5) {
      throw new Error(`Too many redirects while downloading ${url}`);
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const transport = url.startsWith("https:") ? https : http;
      const request = transport.get(
        url,
        { headers: { "User-Agent": "auto-mobile" } },
        response => {
          const statusCode = response.statusCode ?? 0;
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            response.resume();
            const redirectedUrl = new URL(response.headers.location, url).toString();
            void this.downloadWithNodeHttp(redirectedUrl, destination, redirectCount + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            response.resume();
            reject(new Error(`Download failed with status ${statusCode} from ${url}`));
            return;
          }

          const fileStream = createWriteStream(destination);
          response.pipe(fileStream);
          fileStream.on("finish", () => fileStream.close(() => resolve()));
          fileStream.on("error", err => {
            fileStream.close();
            reject(err);
          });
        }
      );

      request.setTimeout(30000, () => {
        request.destroy(new Error(`Download request timed out for ${url}`));
      });
      request.on("error", reject);
    });
  }

  private isCommandUnavailable(error: unknown, command: string): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const err = error as NodeJS.ErrnoException & { stderr?: string };
    const numericCode = typeof err.code === "number" ? err.code : Number(err.code);
    if (err.code === "ENOENT" || (!Number.isNaN(numericCode) && numericCode === 127)) {
      return true;
    }

    const combinedMessage = `${err.message ?? ""} ${err.stderr ?? ""}`.toLowerCase();
    if (combinedMessage.includes("command not found") ||
      combinedMessage.includes("not recognized as an internal or external command") ||
      combinedMessage.includes(`${command}: not found`) ||
      combinedMessage.includes(`not found: ${command}`)) {
      return true;
    }

    return false;
  }
}
