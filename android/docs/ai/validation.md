# Project Validation

This document provides instructions for AI agents to validate the JUnitRunner project builds correctly
and all tests pass. After writing some implementation you should select the most relevant checks given the changes made.

```bash
# Compile main source code
./gradlew compileKotlin

# Compile test source code  
./gradlew compileTestKotlin

# Build entire project (includes compilation)
./gradlew build

# Run all tests
./gradlew test

# Run specific test class (scope to junit-runner to avoid passing --tests to non-JUnit tasks)
./gradlew :junit-runner:test --tests "dev.jasonpearson.automobile.junit.AutoMobileRunnerTest"

# Run specific test method
./gradlew :junit-runner:test --tests "dev.jasonpearson.automobile.junit.AutoMobileRunnerTest.testBuildDaemonExecutePlanArgsIncludesDefaults"
```
