import { randomUUID } from "node:crypto";
import * as path from "path";
import * as fs from "fs/promises";
import { AppLifecycleMonitor, AppLifecycleEvent } from "./appLifecycleMonitor";
import { ConfigurationManager } from "./configurationManager";
import { KotlinTestGenerator } from "./kotlinTestGenerator";
import { logger } from "./logger";
import {
  ActionableError,
  TestAuthoringSession,
  LoggedToolCall,
  TestPlan,
  StartTestAuthoringResult,
  StopTestAuthoringResult,
  TestGenerationOptions, AppConfig, BootedDevice
} from "../models";

export class TestAuthoringManager {
  private currentSession?: TestAuthoringSession;
  private appMonitor: AppLifecycleMonitor;
  private configManager: ConfigurationManager;
  private kotlinTestGenerator: KotlinTestGenerator;
  private static instance: TestAuthoringManager;

  private constructor() {
    this.appMonitor = AppLifecycleMonitor.getInstance();
    this.configManager = ConfigurationManager.getInstance();
    this.kotlinTestGenerator = KotlinTestGenerator.getInstance();

    // Set up app lifecycle event handlers
    this.setupAppLifecycleHandlers();
  }

  public static getInstance(): TestAuthoringManager {
    if (!TestAuthoringManager.instance) {
      TestAuthoringManager.instance = new TestAuthoringManager();
    }
    return TestAuthoringManager.instance;
  }

  /**
   * Start a test authoring session
   */
  public async startAuthoringSession(device: BootedDevice, appId: string, description: string): Promise<StartTestAuthoringResult> {
    try {
      if (this.currentSession?.isActive) {
        logger.warn("Test authoring session is already active");
        return {
          success: false,
          message: "Test authoring session is already active",
          sessionId: this.currentSession.sessionId
        };
      }

      const sessionId = randomUUID();
      this.currentSession = {
        sessionId,
        startTime: new Date(),
        deviceId: device.deviceId,
        appId,
        description,
        toolCalls: [],
        analysis: [],
        isActive: true
      };

      // Track the specific app if provided
      this.appMonitor.trackPackage(device, appId);
      logger.info(`[TEST-AUTHORING] Now tracking package for lifecycle events: ${appId}`);

      logger.info(`[TEST-AUTHORING] Test authoring session started: ${sessionId}`);

      return {
        success: true,
        message: "Test authoring session started successfully",
        sessionId
      };
    } catch (error) {
      logger.error("Failed to start test authoring session:", error);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
      return {
        success: false,
        message: `Failed to start test authoring session: ${error}`
      };
    }
  }

  /**
   * Stop the current test authoring session
   */
  public async stopAuthoringSession(device: BootedDevice): Promise<StopTestAuthoringResult> {
    if (!this.currentSession || !this.currentSession.isActive) {
      logger.warn("No active test authoring session to stop");
      return {
        success: false,
        message: "No active test authoring session to stop"
      };
    }

    const config = this.configManager.getConfigForApp(this.currentSession.appId);
    if (!config || !config.appId) {
      throw new ActionableError("App configuration not found or incomplete");
    }

    const session = this.currentSession;
    session.endTime = new Date();
    session.isActive = false;

    logger.info(`[TEST-AUTHORING] Stopping test authoring session: ${session.sessionId}`);

    // Stop tracking the app if we were tracking one
    if (session.appId) {
      await this.appMonitor.untrackPackage(device, session.appId);
      logger.info(`[TEST-AUTHORING] Stopped tracking package: ${session.appId}`);
    }

    let kotlinTestPath: string | undefined;

    const planPath = await this.generateTestPlan(session);

    // Generate Kotlin test if plan generation was successful
    if (planPath && await this.shouldGenerateKotlinTest(config, session)) {
      const kotlinResult = await this.generateKotlinTest(planPath, config, session);
      kotlinTestPath = kotlinResult.testFilePath;
    }

    this.currentSession = undefined;

    return {
      success: true,
      message: "Test authoring session stopped successfully",
      planPath,
      kotlinTestPath
    };
  }

  /**
   * Log a tool call to the current session
   */
  public async logToolCall(device: BootedDevice, toolName: string, parameters: any, result: any): Promise<void> {
    if (!this.currentSession || !this.currentSession.isActive) {
      return;
    }

    // result.data = JSON.parse(result.data);

    const loggedCall: LoggedToolCall = {
      timestamp: new Date(),
      toolName,
      parameters,
      result
    };

    this.currentSession.toolCalls.push(loggedCall);
    logger.info(`[TEST-AUTHORING] Logged tool call: ${toolName}`);

    // Check for app lifecycle changes after logging the tool call
    await this.appMonitor.checkForChanges(device);

    // Handle special tool calls
    if (toolName === "launchApp" && parameters.appId) {
      // Start tracking the app that was launched
      await this.appMonitor.trackPackage(device, parameters.appId);
      logger.info(`[TEST-AUTHORING] Now tracking launched app: ${parameters.appId}`);
    }

    // Try to get the most recent cached observe result
    const { ObserveScreen } = await import("../features/observe/ObserveScreen");
    const { SourceMapper } = await import("./sourceMapper");

    logger.info("Using cached observe result for intelligent test plan placement");

    const observeScreen = new ObserveScreen(device);
    const cachedResult = await observeScreen.getMostRecentCachedObserveResult();

    if (cachedResult && cachedResult.activeWindow && cachedResult.activeWindow.appId && cachedResult.viewHierarchy && !cachedResult.error) {
      this.currentSession.analysis.push(SourceMapper.getInstance().analyzeViewHierarchy(
        cachedResult.activeWindow.appId,
        cachedResult.viewHierarchy
      ));
    }
  }

  /**
   * Check if test authoring is currently active
   */
  public isActive(): boolean {
    return Boolean(this.currentSession?.isActive);
  }

  /**
   * Handle app termination for automatic plan generation
   */
  public async onAppTerminated(device: BootedDevice, appId: string): Promise<void> {
    if (!this.currentSession || !this.currentSession.isActive) {
      return;
    }

    // Check if this is the app we're testing
    if (this.currentSession.appId && this.currentSession.appId !== appId) {
      return;
    }

    logger.info(`[TEST-AUTHORING] App terminated during test authoring: ${appId}`);

    // Automatically stop the session and generate plan
    await this.stopAuthoringSession(device);
  }

  /**
   * Generate Kotlin test from test plan
   */
  public async generateKotlinTest(
    planPath: string,
    config: AppConfig,
    session?: TestAuthoringSession
  ): Promise<{ testFilePath?: string }> {
    try {

      // Determine test generation options
      const options = this.buildTestGenerationOptions(config, session, planPath);

      // Generate the Kotlin test
      const result = await this.kotlinTestGenerator.generateTestFromPlan(planPath, options);

      if (result.testFilePath) {
        logger.info(`[TEST-AUTHORING] Kotlin test generated: ${result.testFilePath}`);
        return {
          testFilePath: result.testFilePath
        };
      } else {
        logger.warn(`Kotlin test generation failed: ${result.message}`);
        return {};
      }
    } catch (error) {
      logger.error("Failed to generate Kotlin test:", error);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
      return {};
    }
  }

  /**
   * Check if Kotlin test generation should be performed
   */
  private async shouldGenerateKotlinTest(config: any, session?: TestAuthoringSession): Promise<boolean> {
    // Check if we have a source directory configuration for the app
    const { SourceMapper } = await import("./sourceMapper");
    const appConfig = session?.appId ? SourceMapper.getInstance().getMatchingAppConfig(session.appId) : undefined;

    // Only generate Kotlin tests if we have source directory configuration
    if (!appConfig || !appConfig.sourceDir) {
      logger.info("[TEST-AUTHORING] Kotlin test generation skipped - no source directory configuration");
      return false;
    }

    // Check if all required conditions are met
    return config.androidProjectPath && config.androidAppId && config.mode === "testAuthoring";
  }

  /**
   * Build test generation options from configuration and session
   */
  private buildTestGenerationOptions(
    config: AppConfig,
    session: TestAuthoringSession | undefined,
    planPath: string
  ): TestGenerationOptions {
    const options: TestGenerationOptions = {
      generateKotlinTest: true,
      useParameterizedTests: false,
      assertionStyle: "junit4"
    };

    // Determine output path based on project structure
    if (config.sourceDir) {
      // Use the same directory structure as the test plan but for Kotlin tests
      const planDir = path.dirname(planPath);
      const relativePlanDir = path.relative(config.sourceDir, planDir);

      // Convert test-plans directory to kotlin test directory
      const kotlinTestDir = relativePlanDir.replace("test-plans", "").replace("resources", "kotlin");
      options.kotlinTestOutputPath = path.join(config.sourceDir, "src", "test", kotlinTestDir);
    }

    // Generate test class name from plan name
    const planName = path.basename(planPath, ".yaml");
    options.testClassName = this.generateTestClassName(planName);

    // Determine package name from app ID
    if (session?.appId || config.appId) {
      // Use app ID to generate package name
      const appId = session?.appId || config.appId;
      const appIdParts = appId.split(".");
      if (appIdParts.length >= 2) {
        options.testPackage = `${appIdParts.slice(0, 2).join(".")}.tests`;
      }
    }

    return options;
  }

  /**
   * Generate test class name from plan name
   */
  private generateTestClassName(planName: string): string {
    // Convert kebab-case to PascalCase
    const words = planName
      .replace(/[-_]/g, " ")
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");

    return words.endsWith("Test") ? words : `${words}Test`;
  }

  /**
   * Set up app lifecycle event handlers
   */
  private setupAppLifecycleHandlers(): void {
    this.appMonitor.addEventListener("terminate", async (event: AppLifecycleEvent) => {
      await this.onAppTerminated(event.device, event.appId);
    });

    this.appMonitor.addEventListener("launch", async (event: AppLifecycleEvent) => {
      // If we don't have an app ID set, use the launched app and start tracking it
      if (this.currentSession?.isActive && !this.currentSession.appId) {
        this.currentSession.appId = event.appId;
        // The package is already being tracked since the launch event fired
        logger.info(`[TEST-AUTHORING] Test authoring session now tracking app: ${event.appId}`);
      } else if (this.currentSession?.isActive) {
        // Track any app that gets launched during the session for potential lifecycle events
        logger.info(`[TEST-AUTHORING] App launched during session: ${event.appId}`);
      }
    });
  }

  /**
   * Generate a test plan from the current session
   */
  private async generateTestPlan(session: TestAuthoringSession): Promise<string> {
    const planName = this.generatePlanName(session);
    logger.info(`[TEST-AUTHORING] Generating test plan: ${planName}`);
    const targetDirectory = await this.determineTargetDirectory(session);

    // Create the test plan directory if it doesn't exist
    await fs.mkdir(targetDirectory, { recursive: true });

    const planPath = path.join(targetDirectory, `${planName}.yaml`);

    // Generate the plan content
    const plan = this.createTestPlanFromSession(session, planName);
    const yamlContent = this.convertPlanToYaml(plan);

    // Write the plan to disk
    await fs.writeFile(planPath, yamlContent, "utf8");

    logger.info(`[TEST-AUTHORING] Test plan generated: ${planPath}`);

    return planPath;
  }

  /**
   * Generate a descriptive plan name
   */
  private generatePlanName(session: TestAuthoringSession): string {
    const timestamp = session.startTime.toISOString().slice(0, 16).replace(/[:.]/g, "-");
    const appName = session.appId ? session.appId : "unknown-app";
    return `auto-generated-${appName}-${timestamp}`;
  }

  /**
   * Determine the target directory for the test plan
   */
  async determineTargetDirectory(session: TestAuthoringSession): Promise<string> {

    const fallbackDir = path.join("/tmp", "auto-mobile", "test-authoring", session.appId);
    const { SourceMapper } = await import("./sourceMapper");
    const appConfig = SourceMapper.getInstance().getMatchingAppConfig(session.appId);
    if (!appConfig || !appConfig.sourceDir) {
      // Fallback for apps without source directory configuration
      // This allows test authoring for production apps we don't have source code for
      await fs.mkdir(fallbackDir, { recursive: true });
      logger.info(`[TEST-AUTHORING] Using fallback directory for app without source config: ${fallbackDir}`);
      return fallbackDir;
    }

    if (appConfig.platform !== "android") {
      throw new ActionableError(`[TEST-AUTHORING] Only Android platform is supported for test authoring at this time.`);
    }

    const lastAnalysis = session.analysis.reverse().find(a => a.appId === appConfig.appId);
    if (lastAnalysis) {
      const placementResult = await SourceMapper.getInstance().determineTestPlanLocation(lastAnalysis, appConfig.appId);

      if (placementResult.success) {
        logger.info(`[TEST-AUTHORING] Source mapping selected module: ${placementResult.moduleName} (confidence: ${placementResult.confidence.toFixed(2)})`);
        return placementResult.targetDirectory;
      }
    }

    throw new ActionableError("Failed to determine test plan location, source mapping could not find a suitable location.");
  }

  /**
   * Create a test plan from the session data
   */
  private createTestPlanFromSession(session: TestAuthoringSession, planName: string): TestPlan {
    const plan: TestPlan = {
      name: planName,
      description: session.description || `Automatically generated test plan for ${session.appId || "unknown app"}`,
      generated: session.startTime.toISOString(),
      appId: session.appId,
      metadata: {
        duration: session.endTime ? session.endTime.getTime() - session.startTime.getTime() : 0
      },
      steps: []
    };

    // Convert logged tool calls to test steps
    for (const toolCall of session.toolCalls) {
      // Filter out non-essential tool calls
      if (this.shouldIncludeToolCall(toolCall)) {
        plan.steps.push({
          tool: toolCall.toolName,
          params: toolCall.parameters,
        });
      }
    }

    return plan;
  }

  /**
   * Determine if a tool call should be included in the test plan
   */
  private shouldIncludeToolCall(toolCall: LoggedToolCall): boolean {
    // Exclude certain tool calls that are not relevant for test plans
    const excludedTools = [
      "observe",
      "getConfig",
      "config",
      "listDevices",
      "setActiveDevice"
    ];

    return !excludedTools.includes(toolCall.toolName);
  }

  /**
   * Convert test plan to YAML format
   */
  private convertPlanToYaml(plan: TestPlan): string {
    // Simple YAML conversion - could be enhanced with a proper YAML library
    let yaml = `name: "${plan.name}"\n`;
    if (plan.description) {
      yaml += `description: "${plan.description}"\n`;
    }

    if (plan.metadata) {
      yaml += "metadata:\n";
      for (const [key, value] of Object.entries(plan.metadata)) {
        yaml += `  ${key}: ${JSON.stringify(value)}\n`;
      }
    }

    yaml += "steps:\n";
    for (const step of plan.steps) {
      yaml += `  - tool: "${step.tool}"\n`;
      for (const [key, value] of Object.entries(step.params)) {
        yaml += `    ${key}: ${JSON.stringify(value)}\n`;
      }
    }

    return yaml;
  }
}
