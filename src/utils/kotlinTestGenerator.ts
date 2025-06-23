import * as fs from "fs/promises";
import { logger } from "./logger";
import { SourceMapper } from "./sourceMapper";
import { KotlinPoetBridge } from "./kotlinPoetBridge";
import {
  KotlinTestGenerationResult,
  TestGenerationOptions,
  TestPlan
} from "../models";

export class KotlinTestGenerator {
  private sourceMapper: SourceMapper;
  private kotlinPoetVersion: string;
  private kotlinPoetJarPath?: string;
  private static instance: KotlinTestGenerator;

  private constructor() {
    this.sourceMapper = SourceMapper.getInstance();
    this.kotlinPoetVersion = process.env.KOTLINPOET_VERSION || "2.2.0";
    this.kotlinPoetJarPath = process.env.KOTLINPOET_JAR_PATH;
  }

  public static getInstance(): KotlinTestGenerator {
    if (!KotlinTestGenerator.instance) {
      KotlinTestGenerator.instance = new KotlinTestGenerator();
    }
    return KotlinTestGenerator.instance;
  }

  /**
   * Generate Kotlin test class from a test plan
   */
  public async generateTestFromPlan(
    planPath: string,
    options: TestGenerationOptions = {}
  ): Promise<KotlinTestGenerationResult> {
    try {
      logger.info(`Generating Kotlin test from plan: ${planPath}`);

      // Load and parse the test plan
      const plan = await this.loadTestPlan(planPath);
      if (!plan) {
        return {
          success: false,
          message: "Failed to load test plan"
        };
      }

      // Create a new KotlinPoetBridge instance for this generation
      const kotlinPoetBridge = new KotlinPoetBridge(this.kotlinPoetVersion, this.kotlinPoetJarPath);

      // Use native KotlinPoet for generation
      logger.info("Using native KotlinPoet for test generation");
      const result = await kotlinPoetBridge.generateTest(planPath, options, plan);

      if (!result.success) {
        logger.error(`KotlinPoet generation failed: ${result.message}`);
      }

      return result;

    } catch (error) {
      logger.error(`Failed to generate Kotlin test: ${error}`);
      return {
        success: false,
        message: `Failed to generate Kotlin test: ${error}`
      };
    }
  }

  /**
   * Check if native KotlinPoet is available
   */
  public async isKotlinPoetAvailable(): Promise<boolean> {
    const kotlinPoetBridge = new KotlinPoetBridge(this.kotlinPoetVersion, this.kotlinPoetJarPath);
    return await kotlinPoetBridge.isAvailable();
  }

  /**
   * Set custom KotlinPoet JAR path
   */
  public setKotlinPoetJarPath(jarPath: string): void {
    this.kotlinPoetJarPath = jarPath;
  }

  /**
   * Set KotlinPoet version
   */
  public setKotlinPoetVersion(version: string): void {
    this.kotlinPoetVersion = version;
  }

  /**
   * Get current KotlinPoet version
   */
  public getKotlinPoetVersion(): string {
    return this.kotlinPoetVersion;
  }

  /**
   * Load test plan from YAML file
   */
  private async loadTestPlan(planPath: string): Promise<TestPlan | null> {
    try {
      const content = await fs.readFile(planPath, "utf8");
      const yamlContent = this.parseSimpleYaml(content);
      return yamlContent as TestPlan;
    } catch (error) {
      logger.error(`Failed to load test plan: ${error}`);
      return null;
    }
  }

  /**
   * Simple YAML parser for test plans
   */
  private parseSimpleYaml(content: string): any {
    const result: any = {};
    const lines = content.split("\n");
    let currentSection: string | null = null;
    let currentStep: any = null;
    const steps: any[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {continue;}

      if (trimmed.startsWith("name:")) {
        result.name = trimmed.split("name:")[1].trim().replace(/"/g, "");
      } else if (trimmed.startsWith("description:")) {
        result.description = trimmed.split("description:")[1].trim().replace(/"/g, "");
      } else if (trimmed.startsWith("appId:")) {
        result.appId = trimmed.split("appId:")[1].trim().replace(/"/g, "");
      } else if (trimmed.startsWith("generated:")) {
        result.generated = trimmed.split("generated:")[1].trim().replace(/"/g, "");
      } else if (trimmed === "steps:") {
        currentSection = "steps";
      } else if (currentSection === "steps" && trimmed.startsWith("- tool:")) {
        if (currentStep) {
          steps.push(currentStep);
        }
        currentStep = {
          tool: trimmed.split("- tool:")[1].trim().replace(/"/g, ""),
          params: {}
        };
      } else if (currentSection === "steps" && trimmed.startsWith("params:")) {
        // Skip params: line
      } else if (currentSection === "steps" && trimmed.match(/^\s+\w+:/)) {
        if (currentStep) {
          const [key, value] = trimmed.split(":");
          currentStep.params[key.trim()] = JSON.parse(value.trim());
        }
      }
    }

    if (currentStep) {
      steps.push(currentStep);
    }

    result.steps = steps;
    return result;
  }
}
