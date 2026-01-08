import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../logger";

/**
 * Result of plan validation
 */
export interface PlanValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: string[];
}

/**
 * Structured validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  line?: number;
  column?: number;
}

/**
 * Validates AutoMobile test plan YAML files against JSON schema
 */
export class PlanSchemaValidator {
  private ajv: Ajv;
  private schema: any;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false
    });
    addFormats(this.ajv);
  }

  /**
   * Load the JSON schema for test plans
   */
  async loadSchema(): Promise<void> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    logger.info(`[PlanSchemaValidator] Loading schema from: ${__dirname}`);
    logger.info(`[PlanSchemaValidator] Current working directory: ${process.cwd()}`);
    logger.info(`[PlanSchemaValidator] GITHUB_WORKSPACE: ${process.env.GITHUB_WORKSPACE || "not set"}`);

    // Try multiple paths to support different execution contexts:
    const possiblePaths = [
      // From source: src/utils/plan/PlanSchemaValidator.ts -> schemas/
      path.join(__dirname, "../../../schemas/test-plan.schema.json"),
      // From dist: dist/src/utils/plan/PlanSchemaValidator.js -> dist/schemas/
      path.join(__dirname, "../../../../schemas/test-plan.schema.json"),
      // From cwd (project root)
      path.join(process.cwd(), "schemas/test-plan.schema.json"),
      // From cwd/dist
      path.join(process.cwd(), "dist/schemas/test-plan.schema.json"),
      // From subdirectory - traverse up to find project root
      path.join(process.cwd(), "../../schemas/test-plan.schema.json"),
      path.join(process.cwd(), "../../../schemas/test-plan.schema.json"),
      path.join(process.cwd(), "../../../../schemas/test-plan.schema.json"),
      // From GitHub Actions workspace
      path.join(process.env.GITHUB_WORKSPACE || "", "schemas/test-plan.schema.json"),
      // From package root (when installed as npm package)
      path.join(__dirname, "../../../../../schemas/test-plan.schema.json"),
    ];

    let schemaContent: string | null = null;
    let schemaPath: string | null = null;
    const attemptedPaths: string[] = [];

    for (const tryPath of possiblePaths) {
      try {
        const resolvedPath = path.resolve(tryPath);
        attemptedPaths.push(resolvedPath);
        schemaContent = await fs.readFile(resolvedPath, "utf-8");
        schemaPath = resolvedPath;
        logger.info(`[PlanSchemaValidator] ✓ Schema found at: ${schemaPath}`);
        break;
      } catch (error: any) {
        logger.debug(`[PlanSchemaValidator] ✗ Schema not found at: ${path.resolve(tryPath)} (${error.code})`);
        // Try next path
      }
    }

    if (!schemaContent || !schemaPath) {
      const errorMessage = [
        "Could not find test-plan.schema.json.",
        `Current working directory: ${process.cwd()}`,
        `Module directory: ${__dirname}`,
        `GITHUB_WORKSPACE: ${process.env.GITHUB_WORKSPACE || "not set"}`,
        "Tried paths:",
        ...attemptedPaths.map(p => `  - ${p}`)
      ].join("\n");

      logger.error(`[PlanSchemaValidator] ${errorMessage}`);
      throw new Error(errorMessage);
    }

    this.schema = JSON.parse(schemaContent);

    // Add schema to ajv
    this.ajv.addSchema(this.schema);
  }

  /**
   * Validate YAML content against the test plan schema
   * @param yamlContent YAML string to validate
   * @returns Validation result with errors if invalid
   */
  validateYaml(yamlContent: string): PlanValidationResult {
    // First, try to parse YAML
    let parsed: any;
    try {
      parsed = yaml.load(yamlContent);
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          field: "root",
          message: `YAML parsing failed: ${error.message}`,
          line: error.mark?.line,
          column: error.mark?.column
        }]
      };
    }

    // Validate against schema
    const validate = this.ajv.compile(this.schema);
    const valid = validate(parsed);

    if (valid) {
      return { valid: true };
    }

    // Format validation errors
    const errors = this.formatErrors(validate.errors || []);

    return {
      valid: false,
      errors
    };
  }

  /**
   * Validate a YAML file
   * @param filePath Path to YAML file
   * @returns Validation result
   */
  async validateFile(filePath: string): Promise<PlanValidationResult> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return this.validateYaml(content);
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          field: "file",
          message: `Failed to read file: ${error.message}`
        }]
      };
    }
  }

  /**
   * Format AJV errors into structured validation errors
   */
  private formatErrors(ajvErrors: ErrorObject[]): ValidationError[] {
    return ajvErrors.map(err => {
      let field = err.instancePath || "root";

      // Remove leading slash
      if (field.startsWith("/")) {
        field = field.substring(1);
      }

      // Replace /steps/0 with steps[0]
      field = field.replace(/\/(\d+)/g, "[$1]").replace(/\//g, ".");

      let message = err.message || "Validation error";

      // Enhanced error messages
      if (err.keyword === "additionalProperties") {
        const prop = (err.params as any).additionalProperty;
        message = `Unknown property '${prop}'. This might be a legacy field - check the migration guide.`;
      } else if (err.keyword === "required") {
        const missing = (err.params as any).missingProperty;
        message = `Missing required property '${missing}'`;
      } else if (err.keyword === "enum") {
        const allowed = (err.params as any).allowedValues;
        message = `Must be one of: ${allowed.join(", ")}`;
      }

      return {
        field: field || "root",
        message
      };
    });
  }
}
