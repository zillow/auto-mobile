export interface ModuleMapping {
    moduleName: string;
    sourceDirectory: string;
    testDirectory: string;
    packagePrefix: string;
    activities: string[];
    fragments: string[];
    buildGradlePath?: string;
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
}

export interface TestPlanPlacementResult {
    success: boolean;
    targetDirectory: string;
    moduleName: string;
    confidence: number;
    reasoning: string;
}

export interface ModuleDiscoveryResult {
    modules: ModuleMapping[];
    mainModule?: ModuleMapping;
    totalModules: number;
}
