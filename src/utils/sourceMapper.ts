import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import { glob } from "glob";
import { logger } from "./logger";
import {
  ModuleMapping,
  SourceAnalysis,
  ViewHierarchyAnalysis,
  TestPlanPlacementResult,
  ModuleDiscoveryResult
} from "../models/SourceMapping";
import {
  AndroidAppConfig,
  ActivityInfo,
  FragmentInfo,
  ViewInfo,
  SourceIndexResult
} from "../models/SourceIndexing";

export class SourceMapper {
  private static instance: SourceMapper;
  private moduleCache: Map<string, ModuleMapping[]> = new Map();
  private appConfigs: Map<string, AndroidAppConfig> = new Map();
  private sourceIndex: Map<string, SourceIndexResult> = new Map();
  private configFilePath: string;
  private cacheDir: string;

  private constructor() {
    this.configFilePath = path.join(process.env.HOME || "/tmp", ".mcp-adb", "app-configs.json");
    this.cacheDir = path.join(process.env.HOME || "/tmp", ".mcp-adb", "source-cache");
    this.ensureDirectoriesExist();
  }

  public static getInstance(): SourceMapper {
    if (!SourceMapper.instance) {
      SourceMapper.instance = new SourceMapper();
    }
    return SourceMapper.instance;
  }

  // ===========================================
  // App Configuration Management
  // ===========================================

  private ensureDirectoriesExist(): void {
    const baseDir = path.dirname(this.configFilePath);
    if (!require("fs").existsSync(baseDir)) {
      require("fs").mkdirSync(baseDir, { recursive: true });
    }
    if (!require("fs").existsSync(this.cacheDir)) {
      require("fs").mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
     * Load app configurations from disk on startup
     */
  public async loadAppConfigs(): Promise<void> {
    try {
      if (require("fs").existsSync(this.configFilePath)) {
        const configData = await fs.readFile(this.configFilePath, "utf8");
        const configs: AndroidAppConfig[] = JSON.parse(configData);

        for (const config of configs) {
          this.appConfigs.set(config.appId, config);
        }

        logger.info(`[SOURCE] Loaded ${configs.length} app configurations from disk`);
      }
    } catch (error) {
      logger.warn(`Failed to load app configurations: ${error}`);
    }
  }

  /**
     * Save app configurations to disk
     */
  public async saveAppConfigs(): Promise<void> {
    try {
      const configs = Array.from(this.appConfigs.values());
      await fs.writeFile(this.configFilePath, JSON.stringify(configs, null, 2));
      logger.info(`[SOURCE] Saved ${configs.length} app configurations to disk`);
    } catch (error) {
      logger.warn(`Failed to save app configurations: ${error}`);
    }
  }

  /**
     * Add or update an app configuration
     */
  public async addAppConfig(appId: string, sourceDir: string): Promise<void> {
    if (!require("fs").existsSync(sourceDir)) {
      throw new Error(`Source directory does not exist: ${sourceDir}`);
    }

    this.appConfigs.set(appId, { appId, sourceDir });
    await this.saveAppConfigs();

    // Clear existing cache for this app
    this.sourceIndex.delete(appId);

    logger.info(`[SOURCE] Added app configuration: ${appId} -> ${sourceDir}`);
  }

  /**
     * Get all app configurations
     */
  public getAppConfigs(): AndroidAppConfig[] {
    return Array.from(this.appConfigs.values());
  }

  /**
     * Get source directory for an app ID
     */
  public getSourceDir(appId: string): string | null {
    const config = this.appConfigs.get(appId);
    return config ? config.sourceDir : null;
  }

  // ===========================================
  // Module Discovery
  // ===========================================

  /**
     * Discover all Android modules in a project
     */
  public async discoverModules(projectRoot: string): Promise<ModuleDiscoveryResult> {
    try {
      // Check cache first
      if (this.moduleCache.has(projectRoot)) {
        const modules = this.moduleCache.get(projectRoot)!;
        return {
          modules,
          mainModule: modules.find(m => m.moduleName === "app"),
          totalModules: modules.length
        };
      }

      logger.info(`[SOURCE] Discovering Android modules in: ${projectRoot}`);

      const modules: ModuleMapping[] = [];

      // Find all build.gradle files that indicate modules
      const buildGradleFiles = await glob("**/build.gradle{,.kts}", {
        cwd: projectRoot,
        ignore: ["**/build/**", "**/node_modules/**"]
      });

      for (const buildGradlePath of buildGradleFiles) {
        const moduleDir = path.dirname(buildGradlePath);
        const moduleName = path.basename(moduleDir);

        // Skip root build.gradle
        if (moduleName === path.basename(projectRoot)) {
          continue;
        }

        const fullModulePath = path.join(projectRoot, moduleDir);
        const fullBuildGradlePath = path.join(projectRoot, buildGradlePath);

        // Check if this is an Android module by looking for android block
        const isAndroidModule = await this.isAndroidModule(fullBuildGradlePath);
        if (!isAndroidModule) {
          continue;
        }

        // Discover source and test directories
        const sourceDirectory = path.join(fullModulePath, "src", "main", "java");
        const testDirectory = path.join(fullModulePath, "src", "test");

        // Extract package prefix from source files
        const packagePrefix = await this.extractPackagePrefix(sourceDirectory);

        // Find activities and fragments
        const { activities, fragments } = await this.findActivitiesAndFragments(sourceDirectory);

        const moduleMapping: ModuleMapping = {
          moduleName,
          sourceDirectory,
          testDirectory,
          packagePrefix,
          activities,
          fragments,
          buildGradlePath: fullBuildGradlePath
        };

        modules.push(moduleMapping);
        logger.info(`[SOURCE] Discovered module: ${moduleName} with ${activities.length} activities, ${fragments.length} fragments`);
      }

      // Cache the results
      this.moduleCache.set(projectRoot, modules);

      const mainModule = modules.find(m => m.moduleName === "app");
      logger.info(`[SOURCE] Discovered ${modules.length} Android modules`);

      return {
        modules,
        mainModule,
        totalModules: modules.length
      };
    } catch (error) {
      logger.error(`Failed to discover modules: ${error}`);
      return {
        modules: [],
        totalModules: 0
      };
    }
  }

  /**
     * Check if a build.gradle file represents an Android module
     */
  private async isAndroidModule(buildGradlePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(buildGradlePath, "utf8");
      return content.includes("android {") ||
        content.includes("apply plugin: 'com.android") ||
        content.includes('id("com.android') ||
        content.includes('apply(plugin = "com.android');
    } catch (error) {
      return false;
    }
  }

  /**
     * Extract package prefix from source directory
     */
  private async extractPackagePrefix(sourceDirectory: string): Promise<string> {
    try {
      // Look for the first Java/Kotlin file and extract its package
      const javaFiles = await glob("**/*.{java,kt}", {
        cwd: sourceDirectory
      });

      // Only check first few files to avoid performance issues
      const filesToCheck = javaFiles.slice(0, 5);

      for (const javaFile of filesToCheck) {
        const filePath = path.join(sourceDirectory, javaFile);
        const content = await fs.readFile(filePath, "utf8");
        const packageMatch = content.match(/package\s+([^\s;]+)/);
        if (packageMatch) {
          return packageMatch[1];
        }
      }
    } catch (error) {
      logger.info(`[SOURCE] Failed to extract package prefix: ${error}`);
    }

    return "";
  }

  /**
     * Find activities and fragments in source directory
     */
  private async findActivitiesAndFragments(sourceDirectory: string): Promise<{
        activities: string[];
        fragments: string[];
    }> {
    const activities: string[] = [];
    const fragments: string[] = [];

    try {
      // Find all Java/Kotlin files
      const sourceFiles = await glob("**/*.{java,kt}", {
        cwd: sourceDirectory
      });

      for (const sourceFile of sourceFiles) {
        const filePath = path.join(sourceDirectory, sourceFile);
        const content = await fs.readFile(filePath, "utf8");

        // Extract package and class name
        const packageMatch = content.match(/package\s+([^\s;]+)/);
        const classMatch = content.match(/(?:class|object)\s+(\w+)/);

        if (packageMatch && classMatch) {
          const fullClassName = `${packageMatch[1]}.${classMatch[1]}`;

          // Check if it's an Activity
          if (content.includes("Activity") && (sourceFile.includes("Activity") || content.includes("extends.*Activity") || content.includes(": .*Activity"))) {
            activities.push(fullClassName);
          }

          // Check if it's a Fragment
          if (content.includes("Fragment") && (sourceFile.includes("Fragment") || content.includes("extends.*Fragment") || content.includes(": .*Fragment"))) {
            fragments.push(fullClassName);
          }
        }
      }
    } catch (error) {
      logger.info(`[SOURCE] Failed to find activities and fragments: ${error}`);
    }

    return { activities, fragments };
  }

  // ===========================================
  // View Hierarchy Analysis
  // ===========================================

  /**
     * Analyze view hierarchy to extract source mapping information
     */
  public analyzeViewHierarchy(viewHierarchyXml: string): ViewHierarchyAnalysis {
    const analysis: ViewHierarchyAnalysis = {
      activityClasses: [],
      fragmentClasses: [],
      packageHints: [],
      resourceIds: [],
      customViews: []
    };

    try {
      // Extract activity class names
      const activityMatches = viewHierarchyXml.match(/mCurrentFocus.*?Activity.*?(\w+\.\w+\.\w+\.\w+Activity)/g);
      if (activityMatches) {
        analysis.activityClasses = activityMatches
          .map(match => {
            const classMatch = match.match(/(\w+(?:\.\w+)*\..*Activity)/);
            return classMatch ? classMatch[1] : null;
          })
          .filter(Boolean) as string[];
      }

      // Extract fragment class names from hierarchy
      const fragmentMatches = viewHierarchyXml.match(/class="([^"]*Fragment[^"]*)"/g);
      if (fragmentMatches) {
        analysis.fragmentClasses = fragmentMatches
          .map(match => {
            const classMatch = match.match(/class="([^"]*)"/);
            return classMatch ? classMatch[1] : null;
          })
          .filter(Boolean) as string[];
      }

      // Extract resource IDs
      const resourceMatches = viewHierarchyXml.match(/resource-id="([^"]+)"/g);
      if (resourceMatches) {
        analysis.resourceIds = resourceMatches
          .map(match => {
            const idMatch = match.match(/resource-id="([^"]+)"/);
            return idMatch ? idMatch[1] : null;
          })
          .filter(Boolean) as string[];
      }

      // Extract package hints from class names and resource IDs
      const allClasses = [...analysis.activityClasses, ...analysis.fragmentClasses];
      analysis.packageHints = this.extractPackageHints(allClasses, analysis.resourceIds);

      // Extract custom view components
      const customViewMatches = viewHierarchyXml.match(/class="([^"]*\.[A-Z][^"]*View[^"]*)"/g);
      if (customViewMatches) {
        analysis.customViews = customViewMatches
          .map(match => {
            const classMatch = match.match(/class="([^"]*)"/);
            return classMatch ? classMatch[1] : null;
          })
          .filter(Boolean) as string[];
      }

      logger.info(`[SOURCE] View hierarchy analysis found: ${analysis.activityClasses.length} activities, ${analysis.fragmentClasses.length} fragments`);
    } catch (error) {
      logger.warn(`Failed to analyze view hierarchy: ${error}`);
    }

    return analysis;
  }

  /**
     * Map view hierarchy analysis to source modules
     */
  public async mapViewHierarchyToModule(
    analysis: ViewHierarchyAnalysis,
    projectRoot: string
  ): Promise<SourceAnalysis> {
    const moduleDiscovery = await this.discoverModules(projectRoot);
    const modules = moduleDiscovery.modules;

    let bestMatch: ModuleMapping | undefined;
    let confidence = 0;
    const reasoningParts: string[] = [];

    // Score each module based on the analysis
    for (const module of modules) {
      let moduleScore = 0;
      const moduleReasons: string[] = [];

      // Check activity matches
      for (const activity of analysis.activityClasses) {
        if (module.activities.some(a => a.includes(activity) || activity.includes(a))) {
          moduleScore += 50; // High weight for activity matches
          moduleReasons.push(`activity match: ${activity}`);
        }
      }

      // Check fragment matches
      for (const fragment of analysis.fragmentClasses) {
        if (module.fragments.some(f => f.includes(fragment) || fragment.includes(f))) {
          moduleScore += 30; // Medium weight for fragment matches
          moduleReasons.push(`fragment match: ${fragment}`);
        }
      }

      // Check package prefix matches
      for (const packageHint of analysis.packageHints) {
        if (packageHint.startsWith(module.packagePrefix) || module.packagePrefix.startsWith(packageHint)) {
          moduleScore += 20; // Lower weight for package matches
          moduleReasons.push(`package match: ${packageHint}`);
        }
      }

      // Prefer main app module if no clear winner
      if (module.moduleName === "app" && moduleScore === 0) {
        moduleScore = 5;
        moduleReasons.push("fallback to main app module");
      }

      if (moduleScore > confidence) {
        confidence = moduleScore;
        bestMatch = module;
        reasoningParts.length = 0;
        reasoningParts.push(...moduleReasons);
      }
    }

    // Normalize confidence to 0-1 scale
    const normalizedConfidence = Math.min(confidence / 100, 1);

    const sourceAnalysis: SourceAnalysis = {
      primaryActivity: analysis.activityClasses[0],
      fragments: analysis.fragmentClasses,
      packageHints: analysis.packageHints,
      confidence: normalizedConfidence,
      suggestedModule: bestMatch?.moduleName,
      resourceReferences: analysis.resourceIds
    };

    logger.info(`[SOURCE] Source analysis completed: module=${bestMatch?.moduleName}, confidence=${normalizedConfidence.toFixed(2)}`);

    return sourceAnalysis;
  }

  /**
     * Extract package hints from class names and resource IDs
     */
  private extractPackageHints(classNames: string[], resourceIds: string[]): string[] {
    const packageHints = new Set<string>();

    // Extract from class names
    for (const className of classNames) {
      const parts = className.split(".");
      if (parts.length >= 3) {
        // Add various package combinations
        packageHints.add(parts.slice(0, -1).join(".")); // Full package
        packageHints.add(parts.slice(0, -2).join(".")); // Parent package
        if (parts.length >= 4) {
          packageHints.add(parts.slice(0, 3).join(".")); // Base package
        }
      }
    }

    // Extract from resource IDs (e.g., com.example.app:id/button)
    for (const resourceId of resourceIds) {
      const parts = resourceId.split(":");
      if (parts.length >= 2) {
        packageHints.add(parts[0]);
      }
    }

    return Array.from(packageHints);
  }

  // ===========================================
  // Test Plan Placement
  // ===========================================

  /**
     * Determine the best location for a test plan
     */
  public async determineTestPlanLocation(
    analysis: SourceAnalysis,
    projectRoot: string
  ): Promise<TestPlanPlacementResult> {
    const moduleDiscovery = await this.discoverModules(projectRoot);
    const modules = moduleDiscovery.modules;

    // Find the suggested module or fallback to main
    let targetModule = modules.find(m => m.moduleName === analysis.suggestedModule);
    if (!targetModule) {
      targetModule = moduleDiscovery.mainModule || modules[0];
    }

    if (!targetModule) {
      return {
        success: false,
        targetDirectory: path.join(projectRoot, "test-plans"),
        moduleName: "unknown",
        confidence: 0,
        reasoning: "No Android modules found in project"
      };
    }

    // Ensure test plan directory exists
    const testPlanDir = path.join(targetModule.testDirectory, "resources", "test-plans");

    try {
      await fs.mkdir(testPlanDir, { recursive: true });
    } catch (error) {
      logger.warn(`Failed to create test plan directory: ${error}`);
    }

    return {
      success: true,
      targetDirectory: testPlanDir,
      moduleName: targetModule.moduleName,
      confidence: analysis.confidence,
      reasoning: `Selected module '${targetModule.moduleName}' based on source analysis`
    };
  }

  // ===========================================
  // Source File Indexing
  // ===========================================

  /**
     * Execute ripgrep search with timeout
     */
  private async executeRipgrep(pattern: string, directory: string, timeout: number = 10000): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const rg = spawn("rg", [
        "--type", "java",
        "--type", "kotlin",
        "--files-with-matches",
        "--no-heading",
        "--case-sensitive",
        pattern,
        directory
      ]);

      let output = "";
      let errorOutput = "";

      const timer = setTimeout(() => {
        rg.kill();
        reject(new Error(`Ripgrep search timed out after ${timeout}ms`));
      }, timeout);

      rg.stdout.on("data", data => {
        output += data.toString();
      });

      rg.stderr.on("data", data => {
        errorOutput += data.toString();
      });

      rg.on("close", code => {
        clearTimeout(timer);

        if (code === 0) {
          const files = output.trim().split("\n").filter(line => line.length > 0);
          resolve(files);
        } else if (code === 1) {
          // No matches found - this is normal
          resolve([]);
        } else {
          reject(new Error(`Ripgrep failed with code ${code}: ${errorOutput}`));
        }
      });

      rg.on("error", error => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
     * Determine which source file to prioritize based on build variant
     */
  private prioritizeSourceFile(files: string[]): string {
    if (files.length === 1) {
      return files[0];
    }

    // Priority order for build variants (debug is most important)
    const variantPriority = ["debug", "main", "release"];

    for (const variant of variantPriority) {
      const variantFile = files.find(file => file.includes(`src/${variant}/`));
      if (variantFile) {
        return variantFile;
      }
    }

    // If no specific variant found, return the first file
    return files[0];
  }

  /**
   * Index source files for activities, fragments, and views
   */
  private async indexSourceFiles(appId: string, sourceDir: string): Promise<SourceIndexResult> {
    const activities = new Map<string, ActivityInfo>();
    const fragments = new Map<string, FragmentInfo>();
    const views = new Map<string, ViewInfo>();

    logger.info(`[SOURCE] Starting source indexing for app: ${appId}`);

    try {
      // Find all Java/Kotlin files that contain "Activity" class definitions
      const activityPattern = "class\\s+\\w*Activity";
      const activityFiles = await this.executeRipgrep(activityPattern, sourceDir);

      for (const file of activityFiles) {
        try {
          const content = await fs.readFile(file, "utf8");
          const packageMatch = content.match(/package\s+([a-zA-Z][a-zA-Z0-9._]*)/);
          const classMatch = content.match(/class\s+(\w*Activity)/);

          if (packageMatch && classMatch) {
            const packageName = packageMatch[1];
            const className = classMatch[1];
            const fullClassName = `${packageName}.${className}`;

            activities.set(fullClassName, {
              className,
              packageName,
              fullClassName,
              sourceFile: file
            });

            logger.info(`[SOURCE] Indexed activity: ${fullClassName} -> ${file}`);
          }
        } catch (error) {
          logger.warn(`Failed to process activity file ${file}: ${error}`);
        }
      }

      // Find all Java/Kotlin files that contain "Fragment" class definitions
      const fragmentPattern = "class\\s+\\w*Fragment";
      const fragmentFiles = await this.executeRipgrep(fragmentPattern, sourceDir);

      for (const file of fragmentFiles) {
        try {
          const content = await fs.readFile(file, "utf8");
          const packageMatch = content.match(/package\s+([a-zA-Z][a-zA-Z0-9._]*)/);
          const classMatch = content.match(/class\s+(\w*Fragment)/);

          if (packageMatch && classMatch) {
            const packageName = packageMatch[1];
            const className = classMatch[1];
            const fullClassName = `${packageName}.${className}`;

            fragments.set(fullClassName, {
              className,
              packageName,
              fullClassName,
              sourceFile: file
            });

            logger.info(`[SOURCE] Indexed fragment: ${fullClassName} -> ${file}`);
          }
        } catch (error) {
          logger.warn(`Failed to process fragment file ${file}: ${error}`);
        }
      }

      // Find all Java/Kotlin files that contain "View" class definitions
      const viewPattern = "class\\s+\\w*View";
      const viewFiles = await this.executeRipgrep(viewPattern, sourceDir);

      for (const file of viewFiles) {
        try {
          const content = await fs.readFile(file, "utf8");
          const packageMatch = content.match(/package\s+([a-zA-Z][a-zA-Z0-9._]*)/);
          const classMatch = content.match(/class\s+(\w*View)/);

          if (packageMatch && classMatch) {
            const packageName = packageMatch[1];
            const className = classMatch[1];
            const fullClassName = `${packageName}.${className}`;

            views.set(fullClassName, {
              className,
              packageName,
              fullClassName,
              sourceFile: file
            });

            logger.info(`[SOURCE] Indexed view: ${fullClassName} -> ${file}`);
          }
        } catch (error) {
          logger.warn(`Failed to process view file ${file}: ${error}`);
        }
      }

      logger.info(`[SOURCE] Source indexing completed: ${activities.size} activities, ${fragments.size} fragments, ${views.size} views`);
    } catch (error) {
      logger.warn(`Error during source indexing: ${error}`);
    }

    return {
      activities,
      fragments,
      views,
      lastIndexed: Date.now()
    };
  }

  /**
   * Get or create source index for an app
   */
  public async getSourceIndex(appId: string): Promise<SourceIndexResult | null> {
    const sourceDir = this.getSourceDir(appId);
    if (!sourceDir) {
      logger.warn(`No source directory configured for app: ${appId}`);
      return null;
    }

    // Check if we have a cached index
    let sourceIndex: SourceIndexResult | undefined = this.sourceIndex.get(appId);
    const cacheFile = path.join(this.cacheDir, `${appId}-index.json`);

    // Try to load from disk cache if not in memory
    if (!sourceIndex && require("fs").existsSync(cacheFile)) {
      const loadedIndex = await this.loadSourceIndexFromDisk(cacheFile, appId);
      if (loadedIndex) {
        sourceIndex = loadedIndex;
      }
    }

    // Check if index is stale (older than 1 hour)
    const indexAge = sourceIndex ? Date.now() - sourceIndex.lastIndexed : Infinity;
    const maxAge = 60 * 60 * 1000; // 1 hour

    if (!sourceIndex || indexAge > maxAge) {
      logger.info(`[SOURCE] Creating fresh source index for app: ${appId}`);
      sourceIndex = await this.createFreshSourceIndex(appId, sourceDir, cacheFile);
    }

    return sourceIndex;
  }

  /**
   * Load source index from disk cache
   */
  private async loadSourceIndexFromDisk(cacheFile: string, appId: string): Promise<SourceIndexResult | null> {
    try {
      const cacheData = await fs.readFile(cacheFile, "utf8");
      const parsedData = JSON.parse(cacheData);

      // Convert plain objects back to Maps with proper typing
      const sourceIndex: SourceIndexResult = {
        activities: new Map(Object.entries(parsedData.activities as Record<string, ActivityInfo>)),
        fragments: new Map(Object.entries(parsedData.fragments as Record<string, FragmentInfo>)),
        views: new Map(Object.entries(parsedData.views as Record<string, ViewInfo>)),
        lastIndexed: parsedData.lastIndexed as number
      };

      this.sourceIndex.set(appId, sourceIndex);
      logger.info(`[SOURCE] Loaded source index from cache for app: ${appId}`);
      return sourceIndex;
    } catch (error) {
      logger.warn(`Failed to load source index cache: ${error}`);
      return null;
    }
  }

  /**
   * Create a fresh source index and save to cache
   */
  private async createFreshSourceIndex(appId: string, sourceDir: string, cacheFile: string): Promise<SourceIndexResult> {
    try {
      const sourceIndex = await this.indexSourceFiles(appId, sourceDir);
      this.sourceIndex.set(appId, sourceIndex);

      // Save to disk cache (don't fail the whole operation if this fails)
      await this.saveSourceIndexToDisk(sourceIndex, cacheFile, appId);

      return sourceIndex;
    } catch (error) {
      logger.warn(`Failed to index source files for app ${appId}: ${error}`);
      // Return a default structure even if indexing fails
      const defaultIndex = {
        activities: new Map(),
        fragments: new Map(),
        views: new Map(),
        lastIndexed: Date.now()
      };
      this.sourceIndex.set(appId, defaultIndex);
      return defaultIndex;
    }
  }

  /**
   * Save source index to disk cache
   */
  private async saveSourceIndexToDisk(sourceIndex: SourceIndexResult, cacheFile: string, appId: string): Promise<void> {
    try {
      const cacheData = {
        activities: Object.fromEntries(sourceIndex.activities),
        fragments: Object.fromEntries(sourceIndex.fragments),
        views: Object.fromEntries(sourceIndex.views),
        lastIndexed: sourceIndex.lastIndexed
      };
      await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
      logger.info(`[SOURCE] Saved source index to cache for app: ${appId}`);
    } catch (error) {
      logger.warn(`Failed to save source index cache: ${error}`);
    }
  }

  // ===========================================
  // Source File Finding
  // ===========================================

  /**
     * Find activity info by package name from view hierarchy
     */
  public async findActivityInfo(appId: string, activityPackageName: string): Promise<ActivityInfo | null> {
    const sourceIndex = await this.getSourceIndex(appId);
    if (!sourceIndex) {
      return null;
    }

    // Look for exact match first
    const exactMatch = sourceIndex.activities.get(activityPackageName);
    if (exactMatch) {
      return exactMatch;
    }

    // Look for partial matches (in case the package name is truncated)
    for (const [fullClassName, activityInfo] of sourceIndex.activities) {
      if (fullClassName.includes(activityPackageName) || activityPackageName.includes(activityInfo.className)) {
        logger.info(`[SOURCE] Found partial match for activity: ${activityPackageName} -> ${fullClassName}`);
        return activityInfo;
      }
    }

    logger.warn(`No activity found matching: ${activityPackageName}`);
    return null;
  }

  /**
     * Find fragment info by class name, with preference for fragments in same package as activity
     */
  public async findFragmentInfo(
    appId: string,
    fragmentClassName: string,
    activityInfo?: ActivityInfo
  ): Promise<FragmentInfo | null> {
    const sourceIndex = await this.getSourceIndex(appId);
    if (!sourceIndex) {
      return null;
    }

    // Look for exact match by full class name first
    for (const [fullClassName, fragmentInfo] of sourceIndex.fragments) {
      if (fullClassName.endsWith(`.${fragmentClassName}`)) {
        if (activityInfo) {
          fragmentInfo.associatedActivity = activityInfo.fullClassName;
        }
        return fragmentInfo;
      }
    }

    // Look for matches by class name only
    const matches: FragmentInfo[] = [];
    for (const [, fragmentInfo] of sourceIndex.fragments) {
      if (fragmentInfo.className === fragmentClassName) {
        matches.push(fragmentInfo);
      }
    }

    if (matches.length === 0) {
      logger.warn(`No fragment found matching: ${fragmentClassName}`);
      return null;
    }

    if (matches.length === 1) {
      if (activityInfo) {
        matches[0].associatedActivity = activityInfo.fullClassName;
      }
      return matches[0];
    }

    // Multiple matches - prefer one in same package as activity
    if (activityInfo) {
      for (const fragmentInfo of matches) {
        if (fragmentInfo.packageName === activityInfo.packageName) {
          fragmentInfo.associatedActivity = activityInfo.fullClassName;
          logger.info(`[SOURCE] Found fragment in same package as activity: ${fragmentInfo.fullClassName}`);
          return fragmentInfo;
        }
      }

      // If no exact package match, find the one with most similar package
      let bestMatch = matches[0];
      let bestScore = 0;
      const activityParts = activityInfo.packageName.split(".");

      for (const fragmentInfo of matches) {
        const fragmentParts = fragmentInfo.packageName.split(".");
        let score = 0;
        const minLength = Math.min(activityParts.length, fragmentParts.length);

        for (let i = 0; i < minLength; i++) {
          if (activityParts[i] === fragmentParts[i]) {
            score++;
          } else {
            break;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = fragmentInfo;
        }
      }

      bestMatch.associatedActivity = activityInfo.fullClassName;
      logger.info(`[SOURCE] Found best matching fragment: ${bestMatch.fullClassName} (score: ${bestScore})`);
      return bestMatch;
    }

    // No activity context, return first match
    return matches[0];
  }

  /**
     * Find view info by class name, with preference for views in same package as activity or fragment
     */
  public async findViewInfo(
    appId: string,
    viewClassName: string,
    activityInfo?: ActivityInfo,
    fragmentInfo?: FragmentInfo
  ): Promise<ViewInfo | null> {
    const sourceIndex = await this.getSourceIndex(appId);
    if (!sourceIndex) {
      return null;
    }

    // Look for exact match by full class name first
    for (const [fullClassName, viewInfo] of sourceIndex.views) {
      if (fullClassName.endsWith(`.${viewClassName}`)) {
        if (activityInfo) {
          viewInfo.associatedActivity = activityInfo.fullClassName;
        }
        if (fragmentInfo) {
          viewInfo.associatedFragment = fragmentInfo.fullClassName;
        }
        return viewInfo;
      }
    }

    // Look for matches by class name only
    const matches: ViewInfo[] = [];
    for (const [, viewInfo] of sourceIndex.views) {
      if (viewInfo.className === viewClassName) {
        matches.push(viewInfo);
      }
    }

    if (matches.length === 0) {
      logger.warn(`No view found matching: ${viewClassName}`);
      return null;
    }

    if (matches.length === 1) {
      if (activityInfo) {
        matches[0].associatedActivity = activityInfo.fullClassName;
      }
      if (fragmentInfo) {
        matches[0].associatedFragment = fragmentInfo.fullClassName;
      }
      return matches[0];
    }

    // Multiple matches - prefer based on fragment first, then activity
    const contextInfo = fragmentInfo || activityInfo;
    if (contextInfo) {
      for (const viewInfo of matches) {
        if (viewInfo.packageName === contextInfo.packageName) {
          if (activityInfo) {
            viewInfo.associatedActivity = activityInfo.fullClassName;
          }
          if (fragmentInfo) {
            viewInfo.associatedFragment = fragmentInfo.fullClassName;
          }
          logger.info(`[SOURCE] Found view in same package as ${fragmentInfo ? "fragment" : "activity"}: ${viewInfo.fullClassName}`);
          return viewInfo;
        }
      }

      // If no exact package match, find the one with most similar package
      let bestMatch = matches[0];
      let bestScore = 0;
      const contextParts = contextInfo.packageName.split(".");

      for (const viewInfo of matches) {
        const viewParts = viewInfo.packageName.split(".");
        let score = 0;
        const minLength = Math.min(contextParts.length, viewParts.length);

        for (let i = 0; i < minLength; i++) {
          if (contextParts[i] === viewParts[i]) {
            score++;
          } else {
            break;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = viewInfo;
        }
      }

      if (activityInfo) {
        bestMatch.associatedActivity = activityInfo.fullClassName;
      }
      if (fragmentInfo) {
        bestMatch.associatedFragment = fragmentInfo.fullClassName;
      }
      logger.info(`[SOURCE] Found best matching view: ${bestMatch.fullClassName} (score: ${bestScore})`);
      return bestMatch;
    }

    // No context, return first match
    return matches[0];
  }

  // ===========================================
  // Cache Management
  // ===========================================

  /**
     * Clear all caches
     */
  public clearCache(): void {
    this.moduleCache.clear();
    this.sourceIndex.clear();
  }
}
