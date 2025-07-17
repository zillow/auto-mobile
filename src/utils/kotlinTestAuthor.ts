import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import * as https from "https";
import { createWriteStream } from "fs";
import { logger } from "./logger";
import {
  KotlinTestGenerationResult,
  TestGenerationOptions,
  TestPlan
} from "../models";

export interface KotlinPoetRequest {
  planPath: string;
  options: TestGenerationOptions;
  plan?: TestPlan;
}

export interface KotlinPoetResponse {
  success: boolean;
  message?: string;
  sourceCode?: string;
  className?: string;
  testFilePath?: string;
  testMethods?: string[];
}

export class KotlinTestAuthor {
  private kotlinTestAuthorJarPath: string;
  private kotlinTestAuthorVersion: string;

  constructor(version?: string, jarPath?: string) {
    // Initialize version from parameter, environment, or use default
    this.kotlinTestAuthorVersion = version || process.env.KOTLINPOET_VERSION || "2.2.0";

    // Initialize jar path - can be configured via parameter, environment variable, or default
    this.kotlinTestAuthorJarPath = jarPath || process.env.KOTLINPOET_JAR_PATH ||
      path.join("/tmp", "auto-mobile", "kotlinpoet", `kotlinpoet-jvm-${this.kotlinTestAuthorVersion}.jar`);
  }

  /**
   * Set KotlinPoet version
   */
  public setVersion(version: string): void {
    this.kotlinTestAuthorVersion = version;
    // Update jar path to reflect new version if using default path
    if (!process.env.KOTLINPOET_JAR_PATH) {
      this.kotlinTestAuthorJarPath = path.join("/tmp", "auto-mobile", "kotlinpoet", `kotlinpoet-jvm-${version}.jar`);
    }
  }

  /**
   * Get current KotlinPoet version
   */
  public getVersion(): string {
    return this.kotlinTestAuthorVersion;
  }

  /**
   * Download KotlinPoet JAR from Maven Central
   */
  private async downloadKotlinPoet(): Promise<void> {
    if (!this.kotlinTestAuthorJarPath) {
      throw new Error("KotlinPoet JAR path not configured");
    }

    const kotlinTestAuthorDir = path.dirname(this.kotlinTestAuthorJarPath);
    await fs.mkdir(kotlinTestAuthorDir, { recursive: true });

    const downloadUrl = this.kotlinTestAuthorVersion === "LATEST"
      ? "https://search.maven.org/remote_content?g=com.squareup&a=kotlinpoet-jvm&v=LATEST"
      : `https://search.maven.org/remote_content?g=com.squareup&a=kotlinpoet-jvm&v=${this.kotlinTestAuthorVersion}`;

    logger.info(`Downloading KotlinPoet ${this.kotlinTestAuthorVersion} from Maven Central...`);

    return new Promise((resolve, reject) => {
      const file = createWriteStream(this.kotlinTestAuthorJarPath);

      https.get(downloadUrl, response => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          https.get(response.headers.location!, redirectResponse => {
            if (redirectResponse.statusCode !== 200) {
              reject(new Error(`Failed to download KotlinPoet: HTTP ${redirectResponse.statusCode}`));
              return;
            }
            redirectResponse.pipe(file);
          });
        } else if (response.statusCode === 200) {
          response.pipe(file);
        } else {
          reject(new Error(`Failed to download KotlinPoet: HTTP ${response.statusCode}`));
          return;
        }
      }).on("error", reject);

      file.on("finish", () => {
        file.close();
        logger.info(`KotlinPoet ${this.kotlinTestAuthorVersion} downloaded successfully`);
        resolve();
      });

      file.on("error", (err: Error) => {
        fs.unlink(this.kotlinTestAuthorJarPath).catch(() => {
        }); // Delete incomplete file
        reject(err);
      });
    });
  }

  /**
   * Check if KotlinPoet JAR is available, download if not
   */
  public async ensureAvailable(): Promise<boolean> {
    // if (!this.kotlinTestAuthorJarPath) {
    //   return false;
    // }

    // Hard coded to skip downloading - assume JAR is available if path is configured
    logger.info(`Using KotlinPoet JAR at: ${this.kotlinTestAuthorJarPath}`);
    return true;
  }

  /**
   * Check if KotlinPoet JAR is available (without downloading)
   */
  public async isAvailable(): Promise<boolean> {
    if (!this.kotlinTestAuthorJarPath) {
      return false;
    }

    try {
      await fs.access(this.kotlinTestAuthorJarPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate Kotlin test using native KotlinPoet
   */
  public async generateTest(
    planPath: string,
    options: TestGenerationOptions,
    plan?: TestPlan
  ): Promise<KotlinTestGenerationResult> {
    try {
      // Ensure KotlinPoet is available (download if needed)
      if (!await this.ensureAvailable()) {
        return {
          success: false,
          message: "KotlinPoet JAR not available and could not be downloaded"
        };
      }

      logger.info(`Generating Kotlin test with native KotlinPoet: ${planPath}`);

      // Prepare the request
      const request: KotlinPoetRequest = {
        planPath,
        options,
        plan
      };

      // Call the Kotlin/JVM process
      const response = await this.callKotlinPoetProcess(request);

      if (!response.success) {
        return {
          success: false,
          message: response.message || "KotlinPoet generation failed"
        };
      }

      return {
        success: true,
        message: "Kotlin test generated successfully with KotlinPoet",
        sourceCode: response.sourceCode,
        className: response.className,
        testFilePath: response.testFilePath,
        testMethods: response.testMethods
      };

    } catch (error) {
      logger.error(`KotlinPoet generation failed: ${error}`);
      return {
        success: false,
        message: `KotlinPoet generation failed: ${error}`
      };
    }
  }

  /**
   * Call the Kotlin/JVM process for code generation
   */
  private async callKotlinPoetProcess(request: KotlinPoetRequest): Promise<KotlinPoetResponse> {
    return new Promise((resolve, reject) => {
      const args = [
        "-jar",
        this.kotlinTestAuthorJarPath,
        "--plan", request.planPath,
        "--mode", "json" // Request JSON response
      ];

      // Add optional parameters
      if (request.options.testClassName) {
        args.push("--class", request.options.testClassName);
      }
      if (request.options.testPackage) {
        args.push("--package", request.options.testPackage);
      }
      if (request.options.kotlinTestOutputPath) {
        args.push("--output", request.options.kotlinTestOutputPath);
      }
      if (request.options.useParameterizedTests) {
        args.push("--parameterized", "true");
      }
      if (request.options.assertionStyle) {
        args.push("--assertion-style", request.options.assertionStyle);
      }

      logger.debug(`Executing KotlinPoet: java ${args.join(" ")}`);

      const kotlinProcess = spawn("java", args, {
        env: { ...process.env, JAVA_TOOL_OPTIONS: "-Dfile.encoding=UTF-8" }
      });

      let stdout = "";
      let stderr = "";

      kotlinProcess.stdout.on("data", data => {
        stdout += data.toString();
      });

      kotlinProcess.stderr.on("data", data => {
        stderr += data.toString();
      });

      kotlinProcess.on("error", error => {
        logger.error(`Failed to spawn KotlinPoet process: ${error}`);
        reject(new Error(`Failed to spawn KotlinPoet process: ${error}`));
      });

      kotlinProcess.on("close", code => {
        if (code !== 0) {
          logger.error(`KotlinPoet process exited with code ${code}: ${stderr}`);
          resolve({
            success: false,
            message: `KotlinPoet process failed: ${stderr}`
          });
          return;
        }

        try {
          // Parse JSON response
          const response = JSON.parse(stdout) as KotlinPoetResponse;
          resolve(response);
        } catch (error) {
          logger.error(`Failed to parse KotlinPoet response: ${error}`);
          resolve({
            success: false,
            message: `Failed to parse KotlinPoet response: ${error}`
          });
        }
      });
    });
  }

  /**
   * Set custom KotlinPoet JAR path
   */
  public setJarPath(jarPath: string): void {
    this.kotlinTestAuthorJarPath = jarPath;
  }

  /**
   * Get current KotlinPoet JAR path
   */
  public getJarPath(): string | undefined {
    return this.kotlinTestAuthorJarPath;
  }
}
