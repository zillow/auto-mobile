export interface ModuleMapping {
    moduleName: string;
    sourceDirectory: string;
    testDirectory: string;
    packagePrefix: string;
    activities: string[];
    fragments: string[];
    buildGradlePath?: string;
    isApplicationModule: boolean;
    kotlinSource: boolean;
    javaSource: boolean;
}

export interface ApplicationModuleDetails {
  absolutePath: string;
  applicationId: string;
  gradleTasks: string[];
}

export interface SourceAnalysis {
    primaryActivity?: string;
    fragments: string[];
    packageHints: string[];
    confidence: number;
    suggestedModule?: string;
    resourceReferences: string[];
}

export interface ViewHierarchyAnalysis {
    activityClasses: string[];
    fragmentClasses: string[];
    packageHints: string[];
    resourceIds: string[];
    customViews: string[];
    composables: string[];
}

export interface TestPlanPlacementResult {
    success: boolean;
    targetDirectory: string;
    moduleName: string;
    confidence: number;
    reasoning: string;
}

export interface ProjectScanResult {
    modules: ModuleMapping[];
  applicationModules?: ModuleMapping[];
    totalModules: number;
  gradlePlugins?: string[];
  mavenDependencies?: string[];
  currentApplicationModule?: ApplicationModuleDetails;
}
