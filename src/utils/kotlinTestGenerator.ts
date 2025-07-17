import * as fs from "fs/promises";
import { logger } from "./logger";
import { SourceMapper } from "./sourceMapper";
import { KotlinTestAuthor } from "./kotlinTestAuthor";
import {
  KotlinTestGenerationResult,
  TestGenerationOptions,
  TestPlan
} from "../models";

export class KotlinTestGenerator {
  private sourceMapper: SourceMapper;
  private kotlinTestAuthorVersion: string;
  private kotlinTestAuthorJarPath?: string;
  private static instance: KotlinTestGenerator;

  private constructor() {
    this.sourceMapper = SourceMapper.getInstance();
    this.kotlinTestAuthorVersion = process.env.KOTLINPOET_VERSION || "2.2.0";
    this.kotlinTestAuthorJarPath = process.env.KOTLINPOET_JAR_PATH;
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
    logger.info(`Generating Kotlin test from plan: ${planPath}`);

    // Load and parse the test plan
    const plan = await this.loadTestPlan(planPath);
    if (!plan) {
      return {
        success: false,
        message: "Failed to load test plan"
      };
    }

    // Get an instance of KotlinTestAuthor
    // generate the Kotlin JVM JUnitTest

    return {
      success: false,
      message: "Not yet implemented"
    };
  }

  /**
   * Check if native KotlinPoet is available
   */
  public async isKotlinTestAuthorAvailable(): Promise<boolean> {
    const kotlinTestAuthor = new KotlinTestAuthor(this.kotlinTestAuthorVersion, this.kotlinTestAuthorJarPath);
    return await kotlinTestAuthor.isAvailable();
  }

  /**
   * Set custom KotlinPoet JAR path
   */
  public setKotlinTestAuthorJarPath(jarPath: string): void {
    this.kotlinTestAuthorJarPath = jarPath;
  }

  /**
   * Set KotlinPoet version
   */
  public setKotlinTestAuthorVersion(version: string): void {
    this.kotlinTestAuthorVersion = version;
  }

  /**
   * Get current KotlinPoet version
   */
  public getKotlinTestAuthorVersion(): string {
    return this.kotlinTestAuthorVersion;
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
