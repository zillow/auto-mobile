import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import { glob } from "glob";
import { logger } from "./logger";
import {
  ActionableError,
  ActivityInfo,
  AppConfig,
  ApplicationModuleDetails,
  ComposableInfo,
  FragmentInfo,
  ProjectScanResult,
  ModuleMapping,
  SourceAnalysis,
  SourceIndexResult,
  TestPlanPlacementResult,
  ViewHierarchyAnalysis,
  ViewInfo
} from "../models";
import { ConfigurationManager } from "./configurationManager";

export class SourceMapper {
  private static instance: SourceMapper;
  private projectScanResultCache: Map<string, ProjectScanResult> = new Map();
  private sourceIndex: Map<string, SourceIndexResult> = new Map();
  private readonly configFilePath: string;
  private readonly sourceCacheDir: string;

  private constructor() {
    // home should either be process.env.HOME or bash resolution of home for current user
    const homeDir = process.env.HOME || require("os").homedir();
    if (!homeDir) {
      throw new ActionableError("Home directory for current user not found");
    }
    this.configFilePath = path.join(homeDir, ".auto-mobile", "app-configs.json");
    this.sourceCacheDir = path.join("/tmp", "auto-mobile", "source-cache");
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
    if (!require("fs").existsSync(this.sourceCacheDir)) {
      require("fs").mkdirSync(this.sourceCacheDir, { recursive: true });
    }
  }

  /**
   * Add or update an app configuration
   */
  public async addAppConfig(appId: string, sourceDir: string, platform: "android" | "ios"): Promise<void> {
    return ConfigurationManager.getInstance().setAppSource(appId, sourceDir, platform, false);
  }

  /**
   * Get all app configurations
   */
  public getAppConfigs(): AppConfig[] {
    return ConfigurationManager.getInstance().getAppConfigs();
  }

  /**
   * Get all app configurations
   */
  public getMatchingAppConfig(appId: string): AppConfig | undefined {
    return ConfigurationManager.getInstance().getAppConfigs().find((config: { appId: string }) =>
      appId.startsWith(config.appId) || config.appId.startsWith(appId)
    );
  }

  /**
   * Get source directory for an app ID
   */
  public getSourceDir(appId: string): string | null {
    return this.getMatchingAppConfig(appId)?.sourceDir || null;
  }

  // ===========================================
  // Module Discovery
  // ===========================================

  private async findAndroidApplicationIdentifiers(appId: string, projectRoot: string): Promise<string[]> {
    const appConfig = ConfigurationManager.getInstance().getConfigForApp(appId) || {
      appId: appId,
      platform: "android",
      data: new Map()
    } as AppConfig;

    const catalogIdentifier = await this.findAndroidApplicationCatalogPlugin(appConfig, projectRoot);
    logger.debug(`[SOURCE] Found catalog identifier: ${catalogIdentifier}`);

    const conventionPlugins = await this.findAndroidApplicationConventionPlugin(appConfig, projectRoot, catalogIdentifier);

    if (catalogIdentifier) {
      return [catalogIdentifier, ...conventionPlugins];
    }
    return conventionPlugins;
  }

  /**
   * Parse gradle TOML files to find the android application plugin definition
   */
  private async findAndroidApplicationCatalogPlugin(appConfig: AppConfig, projectRoot: string): Promise<string | null> {
    // Check cache first
    const cachedValue = appConfig.data.get("android-application-catalog-plugin");
    if (cachedValue) {
      return cachedValue;
    }

    logger.debug(`[SOURCE] Looking for android.application plugin in gradle TOML files in ${projectRoot}`);

    // Find gradle TOML files
    const tomlFiles = await glob(`gradle/**/*.toml`, {
      cwd: projectRoot,
      ignore: ["**/build/**", "**/node_modules/**"]
    });

    logger.debug(`[SOURCE] Found ${tomlFiles.length} TOML files: ${tomlFiles.join(", ")}`);

    for (const tomlFile of tomlFiles) {
      const fullPath = path.join(projectRoot, tomlFile);
      try {
        const content = await fs.readFile(fullPath, "utf8");

        // Look for android.application plugin definition
        // Pattern: android-application = { id = "com.android.application", version = "..." }
        // or: android-application = "com.android.application:version"
        // Also handle: android.application = { id = "com.android.application", version = "..." }
        const pluginMatch = content.match(/([a-zA-Z0-9-._]+)\s*=\s*\{\s*id\s*=\s*["']com\.android\.application["']/) ||
          content.match(/([a-zA-Z0-9-._]+)\s*=\s*["']com\.android\.application["']/);

        if (pluginMatch) {
          const pluginName = `libs.plugins.${pluginMatch[1].replaceAll("-", ".")}`;
          logger.debug(`[SOURCE] Found android.application plugin as: ${pluginName}`);
          await ConfigurationManager.getInstance().setAndroidAppDataKey(appConfig.appId, "android-application-catalog-plugin", pluginName);
          return pluginName;
        }
      } catch (error) {
        logger.warn(`Failed to read TOML file ${fullPath}: ${error}`);
      }
    }

    return null;
  }

  // ===========================================
  // Module Discovery
  // ===========================================

  /**
   * Parse gradle TOML files to find the android application plugin convention definitions.
   *
   * This implementation follows the general steps of the bash script:
   *  1. Discover included builds via settings.gradle (includeBuild).
   *  2. Search for registered plugins in included builds (usually in build.gradle files).
   *  3. For each registered plugin, find the implementation class, and check if it configures ApplicationExtension.
   */
  private async findAndroidApplicationConventionPlugin(appConfig: AppConfig, projectRoot: string, catalogIdentifier: string | null): Promise<string[]> {
    // Check cache first
    const cachedValue = appConfig.data.get("android-application-convention-plugin")?.split("|") || [];
    if (cachedValue.length > 0 && !(cachedValue.length === 1 && cachedValue[0] === "")) {
      return cachedValue;
    }

    logger.debug(`[SOURCE] Looking for included build in settings...`);

    // Step 1: Discover included builds via settings.gradle/settings.gradle.kts
    const settingsFiles = await glob("**/settings.gradle{,.kts}", {
      cwd: projectRoot,
      ignore: ["**/build/**", "**/node_modules/**"]
    });

    const includedBuilds: string[] = [];

    for (const settingsFile of settingsFiles) {
      const fullPath = path.join(projectRoot, settingsFile);
      try {
        const content = await fs.readFile(fullPath, "utf8");

        // Look for includeBuild statements (match both function and bare)
        const includeBuildPattern = /includeBuild\s*\(\s*['"]([^'"]+)['"]\s*\)|includeBuild\s+['"]([^'"]+)['"]/g;
        let match: RegExpExecArray | null = null;
        while ((match = includeBuildPattern.exec(content)) !== null) {
          const includePath = match[1] || match[2];
          if (includePath) {
            const absoluteIncludePath = path.resolve(path.dirname(fullPath), includePath);
            includedBuilds.push(absoluteIncludePath);
            logger.debug(`[SOURCE] Found included build: ${absoluteIncludePath}`);
          }
        }
      } catch (error) {
        logger.warn(`Failed to read settings file ${fullPath}: ${error}`);
      }
    }

    if (includedBuilds.length === 0) {
      logger.debug("[SOURCE] No included builds found.");
      return [];
    }

    const conventionPlugins: string[] = [];

    // Step 2: For each included build, check for registered plugins & their implementation classes
    logger.debug(`[SOURCE] Finding registered plugin IDs in included builds...`);
    for (const includedBuild of includedBuilds) {
      logger.debug(`[SOURCE] Analyzing build: ${includedBuild}`);

      // Usually the plugin registrations are in buildSrc/build.gradle.kts or build.gradle, or in conventional plugin modules
      // Simplistic approach: look at every .gradle or .gradle.kts in the included build, searching for "register("PLUGIN_ID")"
      const gradleFiles = await glob("**/*.gradle{,.kts}", {
        cwd: includedBuild,
        ignore: ["**/build/**", "**/node_modules/**"]
      });

      type PluginReg = { pluginId: string, implementationClass: string, buildFile: string };
      const pluginRegistrations: PluginReg[] = [];

      for (const gradleFile of gradleFiles) {
        const fullPath = path.join(includedBuild, gradleFile);
        try {
          const content = await fs.readFile(fullPath, "utf8");

          // Look for: register("my.plugin.id") { implementationClass = "com.foo.SomeClass" }
          // const registerMatches = content.matchAll(/register\s*\(\s*"([^"]+)"\s*\)\s*\{([^}]+)\}/g);
          const registerRegex = /register\s*\(\s*["']([^"']+)["']\s*\)\s*\{([\s\S]*?)}\s*\n?/g;
          let match: RegExpExecArray | null;
          while ((match = registerRegex.exec(content)) !== null) {
            const pluginId = match[1];
            const blockContent = match[2] || "";
            // Try to find implementationClass = "...", single or double quotes
            const implClassRegex = /implementationClass\s*=\s*["']([^"']+)["']/;
            const implClassMatch = blockContent.match(implClassRegex);

            if (implClassMatch) {
              const implementationClass = implClassMatch[1];
              pluginRegistrations.push({
                pluginId,
                implementationClass,
                buildFile: fullPath
              });
              logger.debug(`[SOURCE] Found plugin registration: ${pluginId} -> ${implementationClass}`);
            }
          }
        } catch (error) {
          logger.warn(`Failed to read gradle file ${fullPath}: ${error}`);
        }
      }

      // Step 3: For each plugin registration, find the class file and check for ApplicationExtension references
      logger.debug(`[SOURCE] Analyzing implementation classes for Application plugin usage...`);
      for (const registration of pluginRegistrations) {
        const { pluginId, implementationClass, buildFile } = registration;
        logger.debug(`[SOURCE] Checking ${pluginId} (${implementationClass})...`);

        // Split to get file/class names
        const className = implementationClass.split(".").pop() || "";
        const expectedPackage = implementationClass.split(".").slice(0, -1).join(".");

        // Try to find this class in src/* (src/main/kotlin, src/main/java, etc.)
        const buildModuleDir = path.dirname(buildFile);
        let implFile = "";

        // Try src/main/kotlin and src/main/java and src/ (flattened for multiplatform)
        const candidateSrcDirs = [
          path.join(buildModuleDir, "src", "main", "kotlin"),
          path.join(buildModuleDir, "src", "main", "java"),
          path.join(buildModuleDir, "src")
        ];

        // Keep track if we found the file
        let found = false;

        for (const srcDir of candidateSrcDirs) {
          if (!require("fs").existsSync(srcDir)) {continue;}
          const kotlinFiles = await glob("**/*.kt", { cwd: srcDir });
          for (const kotlinFile of kotlinFiles) {
            const potentialFile = path.join(srcDir, kotlinFile);
            try {
              const fileContent = await fs.readFile(potentialFile, "utf8");
              // Check if file contains correct class and correct package
              const packageMatch = fileContent.match(/^package\s+([^\s;]+)/m);
              const classMatch = fileContent.match(new RegExp(`class\\s+${className}\\b`));
              if (packageMatch && classMatch && packageMatch[1] === expectedPackage) {
                implFile = potentialFile;
                found = true;
                break;
              }
            } catch (error) {
              logger.warn(`Failed to read potential implementation file ${potentialFile}: ${error}`);
            }
          }
          if (found) {break;}
        }

        if (implFile && require("fs").existsSync(implFile)) {
          logger.debug(`[SOURCE] Found implementation file: ${implFile}`);
          try {
            const fileContent = await fs.readFile(implFile, "utf8");
            // Check for ApplicationExtension or ApplicationAndroidComponentsExtension, which marks this as an app plugin
            if (
              fileContent.match(/ApplicationExtension\b/) ||
              fileContent.match(/ApplicationAndroidComponentsExtension\b/)
            ) {
              logger.debug(`[SOURCE] ✅ FOUND APPLICATION PLUGIN: ${pluginId}`);
              conventionPlugins.push(pluginId);
            }
          } catch (error) {
            logger.warn(`Failed to read implementation file ${implFile}: ${error}`);
          }
        } else {
          logger.warn(`[SOURCE] ⚠️ Implementation file not found for class: ${className}`);
        }
      }
    }

    logger.debug(`[SOURCE] Found ${conventionPlugins.length} application convention plugins: ${conventionPlugins.join(", ")}`);

    // Cache the result if found
    if (conventionPlugins.length > 0) {
      await ConfigurationManager.getInstance().setAndroidAppDataKey(appConfig.appId, "android-application-convention-plugin", conventionPlugins.join("|"));
    }

    return conventionPlugins;
  }

  /**
   * Check if a build.gradle file represents an Android module (library or application)
   */
  private async isAndroidModule(buildGradlePath: string, androidConventionPlugins: string[]): Promise<boolean> {
    try {
      const content = await fs.readFile(buildGradlePath, "utf8");
      const hasAndroidBlock = content.includes("android {");
      const appliedAndroidPlugins = content.includes("apply plugin: 'com.android") ||
        content.includes('id("com.android') ||
        content.includes('apply(plugin = "com.android');

      const appliedConventionPlugins = androidConventionPlugins.some(plugin => content.includes(plugin));
      logger.debug(`[SOURCE] Checking if ${buildGradlePath} is an Android module... hasAndroidBlock: ${hasAndroidBlock}`);
      return hasAndroidBlock || appliedAndroidPlugins || appliedConventionPlugins;
      // TODO: add content checks for convention plugins that would add any of the above
    } catch (error) {
      logger.error(`Error reading build.gradle file: ${error}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
      return false;
    }
  }

  private async isJvmModule(buildGradlePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(buildGradlePath, "utf8");
      const hasJvmPlugin = content.includes('id("jvm');
      logger.debug(`[SOURCE] Checking if ${buildGradlePath} is an Android module... hasJvmPlugin: ${hasJvmPlugin}`);
      return hasJvmPlugin;
    } catch (error) {
      logger.error(`Error reading build.gradle file: ${error}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
      return false;
    }
  }

  /**
   * Check if a build.gradle file represents an Android application module
   */
  private async isAndroidApplicationModule(buildGradlePath: string, androidApplicationIdentifiers: string[]): Promise<boolean> {
    try {
      const content = await fs.readFile(buildGradlePath, "utf8");
      logger.debug(`Application module at ${buildGradlePath}?`);

      const pluginPatterns = androidApplicationIdentifiers.flatMap(pluginName => [
        new RegExp(`\\s*(${pluginName})\\s*`),
      ]);

      for (const pattern of pluginPatterns) {
        if (pattern.test(content)) {
          logger.debug(`Application plugin found in ${buildGradlePath}`);
          return true;
        }
      }

      logger.debug(`No application plugin found in ${buildGradlePath}`);
      return false;
    } catch (error) {
      logger.error(`Error reading build.gradle file: ${error}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
      return false;
    }
  }


  /**
   * Discover all Android modules in a project
   */
  public async scanProject(applicationId: string): Promise<ProjectScanResult> {

    let startTime = Date.now();
    const appConfig = this.getMatchingAppConfig(applicationId);
    if (!appConfig || !appConfig.sourceDir) {
      throw new ActionableError(`Unable to scan application source without a path`);
    }

    const projectRoot = appConfig.sourceDir;

    // Check cache first
    if (this.projectScanResultCache.has(projectRoot)) {
      return this.projectScanResultCache.get(projectRoot)!;
    }

    logger.debug(`[SOURCE] Discovering Android modules in: ${projectRoot}`);

    // Find the android.application plugin definition
    const androidApplicationIdentifiers = await this.findAndroidApplicationIdentifiers(applicationId, projectRoot);
    if (!androidApplicationIdentifiers) {
      throw new ActionableError(`Unable to find android.application plugin in ${projectRoot}`);
    }
    logger.debug(`[SOURCE] Found android.application identifiers in ${Date.now() - startTime}ms`);
    startTime = Date.now();
    const { plugins: gradlePlugins, dependencies: mavenDependencies } = await this.readGradleTomlFiles(projectRoot);
    logger.debug(`[SOURCE] Read Gradle TOML files in ${Date.now() - startTime}ms`);
    logger.debug(`[SOURCE] Found ${gradlePlugins.length} Gradle plugins and ${mavenDependencies.length} Maven dependencies`);

    let primaryAppModule: ModuleMapping | undefined;
    const modules: ModuleMapping[] = [];

    // Find all build.gradle files that indicate modules
    const buildGradleFiles = await glob("**/build.gradle{,.kts}", {
      cwd: projectRoot,
      ignore: ["**/build/**", "**/node_modules/**"]
    });

    logger.debug(`[SOURCE] Found ${buildGradleFiles.length} build.gradle files`);

    startTime = Date.now();

    for (const buildGradlePath of buildGradleFiles) {
      const moduleDir = path.dirname(buildGradlePath);
      const moduleName = path.basename(moduleDir);

      // Skip root build.gradle
      if (moduleDir === "." || moduleName === path.basename(projectRoot)) {
        continue;
      }

      const fullModulePath = path.join(projectRoot, moduleDir);
      const fullBuildGradlePath = path.join(projectRoot, buildGradlePath);

      // Check if this is an Android module by looking for android block
      const isAndroidModule = await this.isAndroidModule(fullBuildGradlePath, androidApplicationIdentifiers);
      // const isJvmModule = !isAndroidModule && await this.isJvmModule(fullBuildGradlePath);
      // Discover source and test directories
      const sourceMainJavaDirectory = path.join(fullModulePath, "src", "main", "java");
      const sourceMainKotlinDirectory = path.join(fullModulePath, "src", "main", "kotlin");
      const testDirectory = path.join(fullModulePath, "src", "test");

      // Extract package prefix from source files
      let packagePrefix: string;
      let kotlinSource: boolean = false;
      let javaSource: boolean = false;
      const javaPackagePrefix = await this.extractPackagePrefix(sourceMainJavaDirectory);
      const kotlinPackagePrefix = await this.extractPackagePrefix(sourceMainKotlinDirectory);

      if (kotlinPackagePrefix && javaPackagePrefix) {
        packagePrefix = kotlinPackagePrefix;
        kotlinSource = true;
        javaSource = true;
      } else if (kotlinPackagePrefix) {
        packagePrefix = kotlinPackagePrefix;
        kotlinSource = true;
      } else if (javaPackagePrefix) {
        packagePrefix = javaPackagePrefix;
        javaSource = true;
      } else {
        packagePrefix = "";
      }

      let isApplicationModule: boolean = false;
      let activities: string[] = [];
      let fragments: string[] = [];
      if (isAndroidModule) {
        // Check if this is an application module
        isApplicationModule = await this.isAndroidApplicationModule(fullBuildGradlePath, androidApplicationIdentifiers);

        // Find activities and fragments
        const activityFragmentResult = await this.findActivitiesAndFragments(sourceMainJavaDirectory);
        activities = activityFragmentResult.activities;
        fragments = activityFragmentResult.fragments;
      }
      const moduleMapping: ModuleMapping = {
        fullModulePath,
        sourceDirectory: sourceMainJavaDirectory,
        testDirectory,
        packagePrefix,
        activities,
        fragments,
        buildGradlePath: fullBuildGradlePath,
        isApplicationModule,
        kotlinSource,
        javaSource
      };

      if (isApplicationModule) {
        const moduleApplicationId = await this.getApplicationId(fullBuildGradlePath);
        logger.debug(`[SOURCE] Module: ${moduleName}, gradleBuildPath: ${fullBuildGradlePath}, Application ID: ${moduleApplicationId}`);
        if (moduleApplicationId === applicationId) {
          primaryAppModule = moduleMapping;
        }
      }

      modules.push(moduleMapping);
      const moduleType = isApplicationModule ? "application" : "library";
      logger.debug(`[SOURCE] Discovered ${moduleType} module: ${moduleName} with ${activities.length} activities, ${fragments.length} fragments, Package prefix: ${packagePrefix}`);
    }

    logger.debug(`[SOURCE] Found and parsed ${modules.length} modules in ${Date.now() - startTime}ms`);

    logger.debug(`[SOURCE] Project root: ${projectRoot}`);

    const applicationModules = modules.filter(m => m.isApplicationModule);
    logger.debug(`[SOURCE] Discovered ${modules.length} Android modules (${applicationModules.length} application modules)`);

    if (!applicationModules || applicationModules.length === 0) {
      throw new ActionableError("No Android application modules found in the project.");
    }

    logger.debug(`[SOURCE] Starting to look for primary app module with applicationId: ${applicationId}`);

    startTime = Date.now();

    // Find the application module that matches the provided applicationId
    for (const module of applicationModules) {
      if (module.buildGradlePath) {
        const moduleApplicationId = await this.getApplicationId(module.buildGradlePath);
        logger.debug(`[SOURCE] Module: ${module.fullModulePath}, gradleBuildPath: ${module.buildGradlePath}, Application ID: ${moduleApplicationId}`);
        if (moduleApplicationId === applicationId) {
          primaryAppModule = module;
        }
      }
    }

    if (!primaryAppModule) {
      throw new ActionableError("Specified Android applicationId not found in project modules.");
    }

    logger.debug(`[SOURCE] Found primary app module in ${Date.now() - startTime}ms: ${primaryAppModule.fullModulePath}`);
    // Get details for the primary application module
    let currentApplicationModule: ApplicationModuleDetails | undefined;

    if (primaryAppModule?.buildGradlePath) {
      const modulePath = path.relative(projectRoot, path.dirname(primaryAppModule.buildGradlePath));
      const absolutePath = path.join(projectRoot, modulePath);
      const moduleApplicationId = await this.getApplicationId(primaryAppModule.buildGradlePath);
      startTime = Date.now();
      logger.debug(`[SOURCE] Primary application module: ${primaryAppModule.fullModulePath}, Application ID: ${moduleApplicationId}`);

      if (moduleApplicationId) {
        currentApplicationModule = {
          absolutePath,
          applicationId: moduleApplicationId,
        };
      }
    }

    const result: ProjectScanResult = {
      modules,
      applicationModules,
      totalModules: modules.length,
      gradlePlugins,
      mavenDependencies,
      currentApplicationModule
    };

    // Cache the results
    this.projectScanResultCache.set(projectRoot, result);

    return result;
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
        const packageMatch = content.match(/package\s+([a-zA-Z][a-zA-Z0-9._]*)/);
        if (packageMatch) {
          return packageMatch[1];
        }
      }
    } catch (error) {
      logger.debug(`[SOURCE] Failed to extract package prefix: ${error}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
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
        const packageMatch = content.match(/package\s+([a-zA-Z][a-zA-Z0-9._]*)/);
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
      logger.debug(`[SOURCE] Failed to find activities and fragments: ${error}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
    }

    return { activities, fragments };
  }

  /**
   * Read gradle TOML files to find plugins and dependencies
   */
  private async readGradleTomlFiles(projectRoot: string): Promise<{ plugins: string[]; dependencies: string[]; }> {
    const plugins = new Set<string>();
    const dependencies = new Set<string>();

    try {
      const tomlFiles = await glob("gradle/**/*.toml", {
        cwd: projectRoot,
        ignore: ["**/build/**", "**/node_modules/**"]
      });

      for (const tomlFile of tomlFiles) {
        const fullPath = path.join(projectRoot, tomlFile);
        const content = await fs.readFile(fullPath, "utf8");

        // Look for [plugins] section
        const pluginsMatch = content.match(/\[plugins\]\s*\n([\s\S]*?)(?=\n\s*\[|$)/);
        if (pluginsMatch) {
          const pluginBlock = pluginsMatch[1];
          // Regex to find plugin aliases: alias = { id = "...", version = "..." } or alias = "..."
          const pluginAliases = pluginBlock.matchAll(/^\s*([a-zA-Z0-9-._]+)\s*=/gm);
          for (const match of pluginAliases) {
            plugins.add(match[1]);
          }
        }

        // Look for [libraries] section (which corresponds to dependencies)
        const librariesMatch = content.match(/\[libraries\]\s*\n([\s\S]*?)(?=\n\s*\[|$)/);
        if (librariesMatch) {
          const libraryBlock = librariesMatch[1];
          // Regex to find library aliases: alias = { module = "...", version.ref = "..." } or "group:artifact:version"
          const libraryAliases = libraryBlock.matchAll(/^\s*([a-zA-Z0-9-._]+)\s*=/gm);
          for (const match of libraryAliases) {
            dependencies.add(match[1]);
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to read Gradle TOML files: ${error}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
    }

    return { plugins: Array.from(plugins), dependencies: Array.from(dependencies) };
  }

  /**
   * Get application ID from build.gradle file
   */
  private async getApplicationId(buildGradlePath: string): Promise<string | null> {
    try {
      const content = await fs.readFile(buildGradlePath, "utf8");

      // For build.gradle.kts (Kotlin DSL) - various formats
      let match = content.match(/applicationId\s*=\s*"([^"]+)"/);
      if (match) {
        return match[1];
      }

      // Kotlin DSL with single quotes
      match = content.match(/applicationId\s*=\s*'([^']+)'/);
      if (match) {
        return match[1];
      }

      // For build.gradle (Groovy DSL) - various formats
      match = content.match(/applicationId\s+"([^"]+)"/);
      if (match) {
        return match[1];
      }

      // Groovy DSL with single quotes
      match = content.match(/applicationId\s+'([^']+)'/);
      if (match) {
        return match[1];
      }

      // Alternative format with equals sign in Groovy
      match = content.match(/applicationId\s*=\s*"([^"]+)"/);
      if (match) {
        return match[1];
      }

      // Alternative format with equals sign and single quotes in Groovy
      match = content.match(/applicationId\s*=\s*'([^']+)'/);
      if (match) {
        return match[1];
      }

    } catch (error) {
      logger.warn(`Failed to read build.gradle to get applicationId for ${buildGradlePath}: ${error}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
    }
    return null;
  }

  /**
   * Get list of gradle tasks for a module
   */
  private async getGradleTasks(projectRoot: string, modulePath: string): Promise<string[]> {
    const gradleModulePath = `:${modulePath.replace(/[\\\\/]/g, ":")}`;
    const command = `./gradlew ${gradleModulePath}:tasks --all`;

    return new Promise(resolve => {
      const gradlew = spawn(command, [], { cwd: projectRoot, shell: true });

      let output = "";
      let errorOutput = "";

      const timer = setTimeout(() => {
        gradlew.kill();
        logger.warn("Gradle tasks command timed out");
        resolve([]);
      }, 60000); // 30s timeout

      gradlew.stdout.on("data", data => {
        output += data.toString();
      });

      gradlew.stderr.on("data", data => {
        errorOutput += data.toString();
      });

      gradlew.on("close", code => {
        clearTimeout(timer);
        if (code === 0) {
          const tasks = output.split("\n")
            .map(line => line.trim())
            .filter(line => /^[a-zA-Z0-9]/.test(line) && line.includes(" - "))
            .map(line => line.split(" - ")[0]);
          resolve(tasks);
        } else {
          logger.warn(`'${command}' failed with code ${code}: ${errorOutput}`);
          resolve([]);
        }
      });

      gradlew.on("error", err => {
        clearTimeout(timer);
        logger.warn(`Failed to run '${command}': ${err.message}`);
        resolve([]);
      });
    });
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
      resourceIds: [],
      customViews: [],
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

      logger.debug(`[SOURCE] View hierarchy analysis found: ${analysis.activityClasses.length} activities, ${analysis.fragmentClasses.length} fragments`);
    } catch (error) {
      logger.warn(`Failed to analyze view hierarchy: ${error}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
    }

    return analysis;
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
    analysis: ViewHierarchyAnalysis,
    applicationId: string
  ): Promise<TestPlanPlacementResult> {
    const moduleDiscovery = await this.scanProject(applicationId);
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
          logger.debug(`[SOURCE] Activity match: ${activity} on module ${module.fullModulePath}`);
          moduleScore += 50; // High weight for activity matches
          moduleReasons.push(`activity match: ${activity}`);
        }
      }

      // Check fragment matches
      for (const fragment of analysis.fragmentClasses) {
        if (module.fragments.some(f => f.includes(fragment) || fragment.includes(f))) {
          logger.debug(`[SOURCE] Fragment match: ${fragment} on module ${module.fullModulePath}`);
          moduleScore += 80; // Medium weight for fragment matches
          moduleReasons.push(`fragment match: ${fragment}`);
        }
      }

      if (module.fullModulePath === moduleDiscovery.currentApplicationModule?.absolutePath) {
        moduleScore += 30; // Current main app module
        moduleReasons.push("fallback to application module");
      } else if (module.isApplicationModule) {
        moduleScore += 10; // some other app module
        moduleReasons.push("fallback to application module");
      }

      logger.debug(`[SOURCE] Module ${module.fullModulePath} (package: ${module.packagePrefix}, isApp: ${module.isApplicationModule}): score=${moduleScore}, reasons=${moduleReasons.join(", ")}`);

      if (moduleScore > confidence) {
        confidence = moduleScore;
        logger.debug(`[SOURCE] New best match: ${module.fullModulePath} with score ${moduleScore}`);
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
      confidence: normalizedConfidence,
      suggestedModule: bestMatch?.fullModulePath,
      resourceReferences: analysis.resourceIds
    };

    logger.debug(`[SOURCE] Source analysis completed: module=${bestMatch?.fullModulePath}, confidence=${normalizedConfidence.toFixed(2)}`);

    // Find the suggested module or fallback to first application module
    let targetModule = modules.find(m => m.fullModulePath === sourceAnalysis.suggestedModule);
    if (!targetModule) {
      targetModule = moduleDiscovery.applicationModules?.[0] || modules[0];
    }

    if (!targetModule) {
      throw new ActionableError("No target module found for source analysis");
    }

    logger.debug(`[SOURCE] Target module: ${targetModule.fullModulePath} (${targetModule.testDirectory}`);

    // Ensure test plan directory exists
    const testPlanDir = path.join(targetModule.testDirectory, "resources", "test-plans");
    await fs.mkdir(testPlanDir, { recursive: true });

    return {
      success: true,
      targetDirectory: testPlanDir,
      moduleName: targetModule.fullModulePath,
      confidence: sourceAnalysis.confidence,
      reasoning: `Selected module '${targetModule.fullModulePath}' based on source analysis`
    };
  }

  // ===========================================
  // Source File Indexing
  // ===========================================

  /**
     * Execute ripgrep search with timeout
     */
  private async executeRipgrep(pattern: string, directory: string, timeout: number = 10000, usePcre2: boolean = false): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const args = [
        "--type", "java",
        "--type", "kotlin",
        "--files-with-matches",
        "--no-heading",
        "--case-sensitive"
      ];

      if (usePcre2) {
        args.push("--pcre2");
      }

      args.push(pattern, directory);

      const rg = spawn("rg", args);

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
  async indexSourceFiles(appId: string, sourceDir: string): Promise<SourceIndexResult> {
    const activities = new Map<string, ActivityInfo>();
    const fragments = new Map<string, FragmentInfo>();
    const views = new Map<string, ViewInfo>();
    const composables = new Map<string, ComposableInfo>();

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

            logger.debug(`[SOURCE] Indexed activity: ${fullClassName} -> ${file}`);
          }
        } catch (error) {
          logger.warn(`Failed to process activity file ${file}: ${error}`);
          // Rethrow ActionableErrors to preserve their specific error messages
          if (error instanceof ActionableError) {
            throw error;
          }
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

            logger.debug(`[SOURCE] Indexed fragment: ${fullClassName} -> ${file}`);
          }
        } catch (error) {
          logger.warn(`Failed to process fragment file ${file}: ${error}`);
          // Rethrow ActionableErrors to preserve their specific error messages
          if (error instanceof ActionableError) {
            throw error;
          }
        }
      }

      // Find all Java/Kotlin files that contain custom View class definitions
      // This pattern specifically looks for classes that extend Android View classes
      // But excludes ViewModel classes by ensuring the parent class is not ViewModel
      const viewPattern = "class\\s+\\w+\\s+extends\\s+\\w*View(?!Model)|class\\s+\\w+\\s*:\\s*\\w*View(?!Model)";
      const viewFiles = await this.executeRipgrep(viewPattern, sourceDir, 10000, true);

      for (const file of viewFiles) {
        try {
          const content = await fs.readFile(file, "utf8");
          const packageMatch = content.match(/package\s+([a-zA-Z][a-zA-Z0-9._]*)/);

          // Only match classes that actually extend View classes, not just any class ending with "View"
          // Java: class CustomView extends View
          // Kotlin: class CustomView : View
          const javaViewMatch = content.match(/class\s+(\w+)\s+extends\s+\w*View/);
          const kotlinViewMatch = content.match(/class\s+(\w+)\s*:\s*\w*View/);

          const classMatch = javaViewMatch || kotlinViewMatch;

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
          // Rethrow ActionableErrors to preserve their specific error messages
          if (error instanceof ActionableError) {
            throw error;
          }
        }
      }

      // Find all Kotlin files that contain @Composable functions (excluding @Preview)
      const composablePattern = "@Composable";
      const composableFiles = await this.executeRipgrep(composablePattern, sourceDir);


      for (const file of composableFiles) {
        try {
          const content = await fs.readFile(file, "utf8");
          const packageMatch = content.match(/package\s+([a-zA-Z][a-zA-Z0-9._]*)/);

          if (packageMatch) {
            const packageName = packageMatch[1];

            // Find all @Composable functions in this file, excluding @Preview functions
            const composableMatches = content.matchAll(/@Composable(?:\s+(?:@\w+\s*)*(?:inline\s+|private\s+|internal\s+|public\s+)*)?fun\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);

            for (const match of composableMatches) {
              const functionName = match[1];

              // Skip if this is a preview function (look for @Preview annotation before @Composable)
              const functionStartIndex = match.index || 0;
              const beforeFunction = content.substring(Math.max(0, functionStartIndex - 500), functionStartIndex);

              if (beforeFunction.includes("@Preview")) {
                continue;
              }

              // Also skip functions that start with "Preview" by naming convention
              if (functionName.startsWith("Preview")) {
                continue;
              }

              const fullClassName = `${packageName}.${functionName}`;

              composables.set(fullClassName, {
                className: functionName,
                packageName,
                fullClassName,
                sourceFile: file
              });

              logger.debug(`[SOURCE] Indexed composable: ${fullClassName} -> ${file}`);
            }
          }
        } catch (error) {
          logger.warn(`Failed to process composable file ${file}: ${error}`);
          // Rethrow ActionableErrors to preserve their specific error messages
          if (error instanceof ActionableError) {
            throw error;
          }
        }
      }

      logger.debug(`[SOURCE] Source indexing completed: ${activities.size} activities, ${fragments.size} fragments, ${views.size} views, ${composables.size} composables`);
    } catch (error) {
      console.error(`Error during source indexing: ${error}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
    }

    return {
      activities,
      fragments,
      views,
      composables,
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
    const cacheFile = path.join(this.sourceCacheDir, `${appId}-index.json`);

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
      logger.debug(`[SOURCE] Creating fresh source index for app: ${appId}`);
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
        composables: new Map(Object.entries(parsedData.composables as Record<string, ComposableInfo>)),
        lastIndexed: parsedData.lastIndexed as number
      };

      this.sourceIndex.set(appId, sourceIndex);
      logger.debug(`[SOURCE] Loaded source index from cache for app: ${appId}`);
      return sourceIndex;
    } catch (error) {
      logger.warn(`Failed to load source index cache: ${error}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
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
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
      // Return a default structure even if indexing fails
      const defaultIndex = {
        activities: new Map(),
        fragments: new Map(),
        views: new Map(),
        composables: new Map(),
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
        composables: Object.fromEntries(sourceIndex.composables),
        lastIndexed: sourceIndex.lastIndexed
      };
      await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
      logger.debug(`[SOURCE] Saved source index to cache for app: ${appId}`);
    } catch (error) {
      logger.warn(`Failed to save source index cache: ${error}`);
      // Rethrow ActionableErrors to preserve their specific error messages
      if (error instanceof ActionableError) {
        throw error;
      }
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
        logger.debug(`[SOURCE] Found partial match for activity: ${activityPackageName} -> ${fullClassName}`);
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
    activityInfo: ActivityInfo | null
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
          logger.debug(`[SOURCE] Found fragment in same package as activity: ${fragmentInfo.fullClassName}`);
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
      logger.debug(`[SOURCE] Found best matching fragment: ${bestMatch.fullClassName} (score: ${bestScore})`);
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
          logger.debug(`[SOURCE] Found view in same package as ${fragmentInfo ? "fragment" : "activity"}: ${viewInfo.fullClassName}`);
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
      logger.debug(`[SOURCE] Found best matching view: ${bestMatch.fullClassName} (score: ${bestScore})`);
      return bestMatch;
    }

    // No context, return first match
    return matches[0];
  }

  /**
   * Find composable info by function name, with preference for composables in same package as activity or fragment
   */
  public async findComposableInfo(
    appId: string,
    composableName: string,
    activityInfo?: ActivityInfo,
    fragmentInfo?: FragmentInfo
  ): Promise<ComposableInfo | null> {
    const sourceIndex = await this.getSourceIndex(appId);
    if (!sourceIndex) {
      return null;
    }

    // Look for exact match by full class name first
    for (const [fullClassName, composableInfo] of sourceIndex.composables) {
      if (fullClassName.endsWith(`.${composableName}`)) {
        if (activityInfo) {
          composableInfo.associatedActivity = activityInfo.fullClassName;
        }
        if (fragmentInfo) {
          composableInfo.associatedFragment = fragmentInfo.fullClassName;
        }
        return composableInfo;
      }
    }

    // Look for matches by function name only
    const matches: ComposableInfo[] = [];
    for (const [, composableInfo] of sourceIndex.composables) {
      if (composableInfo.className === composableName) {
        matches.push(composableInfo);
      }
    }

    if (matches.length === 0) {
      logger.warn(`No composable found matching: ${composableName}`);
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
      for (const composableInfo of matches) {
        if (composableInfo.packageName === contextInfo.packageName) {
          if (activityInfo) {
            composableInfo.associatedActivity = activityInfo.fullClassName;
          }
          if (fragmentInfo) {
            composableInfo.associatedFragment = fragmentInfo.fullClassName;
          }
          logger.debug(`[SOURCE] Found composable in same package as ${fragmentInfo ? "fragment" : "activity"}: ${composableInfo.fullClassName}`);
          return composableInfo;
        }
      }

      // If no exact package match, find the one with most similar package
      let bestMatch = matches[0];
      let bestScore = 0;
      const contextParts = contextInfo.packageName.split(".");

      for (const composableInfo of matches) {
        const composableParts = composableInfo.packageName.split(".");
        let score = 0;
        const minLength = Math.min(contextParts.length, composableParts.length);

        for (let i = 0; i < minLength; i++) {
          if (contextParts[i] === composableParts[i]) {
            score++;
          } else {
            break;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = composableInfo;
        }
      }

      if (activityInfo) {
        bestMatch.associatedActivity = activityInfo.fullClassName;
      }
      if (fragmentInfo) {
        bestMatch.associatedFragment = fragmentInfo.fullClassName;
      }
      logger.debug(`[SOURCE] Found best matching composable: ${bestMatch.fullClassName} (score: ${bestScore})`);
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
    this.projectScanResultCache.clear();
    this.sourceIndex.clear();
  }
}
