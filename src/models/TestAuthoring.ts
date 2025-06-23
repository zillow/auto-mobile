export interface LoggedToolCall {
    timestamp: Date;
    toolName: string;
    parameters: any;
    result: {
        success: boolean;
        data?: any;
        error?: string;
    };
}

export interface TestAuthoringSession {
    sessionId: string;
    startTime: Date;
    endTime?: Date;
    appId?: string;
    toolCalls: LoggedToolCall[];
    isActive: boolean;
}

export interface TestPlan {
    name: string;
    description?: string;
    generated: string;
    appId?: string;
    metadata?: Record<string, any>;
    steps: TestStep[];
}

export interface TestStep {
    tool: string;
    params: Record<string, any>;
    description?: string;
}

export interface StartTestAuthoringResult {
    success: boolean;
    message: string;
    sessionId?: string;
}

export interface StopTestAuthoringResult {
    success: boolean;
    message: string;
    planGenerated?: boolean;
    planPath?: string;
  kotlinTestGenerated?: boolean;
  kotlinTestPath?: string;
}

// Kotlin Test Generation Models
export interface KotlinTestGenerationResult {
  success: boolean;
  message: string;
  sourceCode?: string;
  className?: string;
  testFilePath?: string;
  testMethods?: string[];
}

export interface TestPattern {
  testRunner?: string;
  basePackage: string;
  testClassSuffix: string;
  imports: string[];
  annotations: string[];
  testMethodPattern: string;
  assertionStyle: "junit4" | "junit5" | "assertj";
}

export interface KotlinTestTemplate {
  package: string;
  imports: string[];
  className: string;
  annotations: string[];
  testMethods: KotlinTestMethod[];
  properties?: string[];
}

export interface KotlinTestMethod {
  name: string;
  annotations: string[];
  body: string;
  parameters?: string[];
  returnType?: string;
}

export interface TestGenerationOptions {
  generateKotlinTest?: boolean;
  kotlinTestOutputPath?: string;
  testClassName?: string;
  testPackage?: string;
  useParameterizedTests?: boolean;
  assertionStyle?: "junit4" | "junit5" | "assertj";
}
