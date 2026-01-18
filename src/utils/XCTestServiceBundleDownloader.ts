import { execFile } from "child_process";
import { createWriteStream } from "fs";
import * as fs from "fs/promises";
import http from "http";
import https from "https";
import * as path from "path";
import { promisify } from "util";
import AdmZip from "adm-zip";
import crypto from "crypto";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

export type Sha256Source = "sha256sum" | "shasum" | "node";

export interface XCTestServiceBundleDownloader {
  download(url: string, destination: string): Promise<void>;
  computeFileSha256(filePath: string): Promise<{ checksum: string; source: Sha256Source }>;
  extractBundle(bundlePath: string, destination: string): Promise<void>;
}

export class DefaultXCTestServiceBundleDownloader implements XCTestServiceBundleDownloader {
  public async download(url: string, destination: string): Promise<void> {
    try {
      await this.downloadWithCurl(url, destination);
      return;
    } catch (error) {
      if (!this.isCommandUnavailable(error, "curl")) {
        throw error;
      }
      logger.warn("[XCTestServiceDownloader] curl unavailable, falling back to wget", {
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
      logger.warn("[XCTestServiceDownloader] wget unavailable, falling back to Node HTTP", {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    await this.downloadWithNodeHttp(url, destination, 0);
  }

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
    const fileBuffer = await fs.readFile(filePath);
    hash.update(fileBuffer);
    return { checksum: hash.digest("hex"), source: "node" };
  }

  public async extractBundle(bundlePath: string, destination: string): Promise<void> {
    await fs.rm(destination, { recursive: true, force: true });
    await fs.mkdir(destination, { recursive: true });

    const zip = new AdmZip(bundlePath);
    zip.extractAllTo(destination, true);
  }

  private async downloadWithCurl(url: string, destination: string): Promise<void> {
    await this.execFile("curl", [
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
    ]);
  }

  private async downloadWithWget(url: string, destination: string): Promise<void> {
    await this.execFile("wget", [
      "--tries=3",
      "--timeout=30",
      "-O",
      destination,
      url
    ]);
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
            reject(new Error(`Failed to download ${url}. Status: ${statusCode}`));
            return;
          }

          const fileStream = createWriteStream(destination);
          response.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close();
            resolve();
          });
          fileStream.on("error", error => {
            fileStream.close();
            reject(error);
          });
        }
      );

      request.on("error", error => {
        reject(error);
      });
    });
  }

  private isCommandUnavailable(error: unknown, command: string): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes(`${command}: command not found`) || message.includes(`not found: ${command}`);
  }

  private async tryChecksumCommand(command: string[], tool: string): Promise<string | null> {
    try {
      const { stdout } = await this.execFile(tool, command);
      const checksum = stdout.trim().split(/\s+/)[0];
      if (!checksum) {
        logger.warn("[XCTestServiceDownloader] checksum tool returned no output", { tool });
        return null;
      }
      return checksum;
    } catch (error) {
      logger.info("[XCTestServiceDownloader] checksum tool unavailable, falling back", {
        tool,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private async execFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(command, args, {
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024
    });
  }
}
