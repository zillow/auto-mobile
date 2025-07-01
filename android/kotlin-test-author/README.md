# AutoMobile Kotlin Test Author

A CLI tool for generating Kotlin test files with AutoMobile annotations from test specifications.

## Usage

```bash
./gradlew run --args="--test-name <testName> --plan <planPath> --module-path <modulePath>"
```

### Parameters

- `--test-name, -n`: Name of the test method (required)
- `--plan, -p`: Path to YAML test plan (required)
- `--module-path, -m`: Gradle module path (required)
- `--max-retries`: Maximum retry attempts (optional)
- `--ai-assistance`: Enable AI assistance (optional flag)
- `--timeout`: Timeout in milliseconds (optional)

### Example

```bash
./gradlew run --args="--test-name testLogin --plan test-plans/login.yaml --module-path features/auth"
```

## Configuration

### Public Modifier Handling

By default, the tool removes redundant `public` modifiers from generated test classes and methods to
follow Kotlin conventions. This can be configured using:

#### System Property (Gradle)

```bash
./gradlew run --args="..." -Dautomobile.testauthoring.omitPublic=false
```

#### Environment Variable

```bash
export AUTOMOBILE_TESTAUTHORING_OMITPUBLIC=false
./gradlew run --args="..."
```

#### gradle.properties

```properties
systemProp.automobile.testauthoring.omitPublic=false
```

**Default**: `true` (omit public modifiers)

When set to `false`, generated code will include explicit `public` modifiers:

```kotlin
public class TestLoginTest {
  @Test
  public fun testLogin() {
    // test body
  }
}
```

When set to `true` (default), generated code omits redundant `public` modifiers:

```kotlin
class TestLoginTest {
  @Test
  fun testLogin() {
    // test body
  }
}
```

## Generated Code Structure

The tool automatically:

1. Analyzes source package structure to determine appropriate package names
2. Generates properly capitalized class names (e.g., `testLogin` → `TestLoginTest`)
3. Creates test methods with AutoMobile annotations
4. Handles Android namespace detection from `build.gradle.kts`
5. Post-processes code to follow Kotlin conventions (configurable)

## Package Name Resolution

The tool determines package names by:

1. Scanning source directories (`src/main`, `src/commonMain`, etc.)
2. Finding common package prefixes from existing source files
3. Reading Android namespace/applicationId from `build.gradle.kts`
4. Appending `.automobile` suffix for test organization

Priority order:

1. Common source package prefix
2. Android namespace/applicationId
3. Default fallback packages

## Distribution

You can build the CLI tool as a standalone binary for distribution:

```bash
# Build distributable archives (both tar and zip)
./gradlew assembleDist

# Extract and run
tar -xf build/distributions/kotlin-test-author-0.0.2-SNAPSHOT.tar
./kotlin-test-author-0.0.2-SNAPSHOT/bin/kotlin-test-author --test-name testExample --plan test.yaml --module-path app
```
