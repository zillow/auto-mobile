# Project Validation

This document provides instructions for AI agents to validate the iOS project builds correctly
and all tests pass. After writing some implementation you should select the most relevant checks given the changes made.

## SwiftLint

```shell
# SwiftLint validation (if configured)
# Check if SwiftLint is available, install if needed, then run
if ! command -v swiftlint &> /dev/null; then
    echo "ℹ️  SwiftLint not installed, installing via Homebrew..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install swiftlint
    else
        echo "ℹ️  Installing SwiftLint for Linux..."
        # Try common Linux package managers
        if command -v apt-get &> /dev/null; then
            # Ubuntu/Debian - install via Swift toolchain
            echo "Installing SwiftLint via Swift Package Manager..."
            swift build -c release --package-path /tmp/swiftlint --product swiftlint 2>/dev/null || echo "❌ SwiftLint installation failed"
        elif command -v yum &> /dev/null || command -v dnf &> /dev/null; then
            # RHEL/CentOS/Fedora
            echo "Please install SwiftLint manually for your Linux distribution"
        else
            echo "❌ No supported package manager found, skipping SwiftLint"
        fi
    fi
fi

# Run SwiftLint
swiftlint
```

## Project Structure

```bash
# Verify project structure (run from project root)
ls -la ios/playground/*.xcodeproj 2>/dev/null || echo "No workspace files in playground/"
find . -name "*.swift" -type f | wc -l
```

## Build Validation

```bash
# Auto-detect and build (with error handling)
xcodebuild -project playground/Playground.xcodeproj -scheme "Playground" -destination 'platform=iOS Simulator,name=iPhone 16' build

```

## Test Validation

```bash
# Run all tests with error handling
echo "🧪 Running tests for scheme Playground"

# Run all unit tests
xcodebuild -project playground/Playground.xcodeproj -scheme "Playground" -destination 'platform=iOS Simulator,name=iPhone 16' test

# Run tests with coverage (optional)
xcodebuild -project playground/Playground.xcodeproj -scheme "Playground" -destination 'platform=iOS Simulator,name=iPhone 16' -enableCodeCoverage YES test 2>/dev/null || echo "Coverage test failed"

# Run specific test suite (if exists)
xcodebuild -project playground/Playground.xcodeproj -scheme "Playground" -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:"PlaygroundTests" test 2>/dev/null || echo "Specific tests not found"
```

## Code Quality Validation

```bash
# Check for compilation warnings (with error handling)
echo "🔍 Checking for warnings..."
xcodebuild -project playground/Playground.xcodeproj -scheme "Playground" -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | grep -i warning || echo "No warnings found"

# Check for deprecated APIs
xcodebuild -project playground/Playground.xcodeproj -scheme "Playground" -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | grep -i deprecat || echo "No deprecated API usage found"
```

When validation fails, capture output to scratch directory:

```bash
# Create scratch directory if it doesn't exist
mkdir -p scratch

# Log build output with timestamp
echo "$(date): Build started" >> ../scratch/build_output.log 2>/dev/null || echo "$(date): Build started" >> scratch/build_output.log
xcodebuild -project playground/Playground.xcodeproj -scheme "Playground" -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tee -a ../scratch/build_output.log 2>/dev/null || tee -a scratch/build_output.log

# Log test output with timestamp  
echo "$(date): Tests started" >> ../scratch/test_output.log 2>/dev/null || echo "$(date): Tests started" >> scratch/test_output.log
xcodebuild -project playground/Playground.xcodeproj -scheme "Playground" -destination 'platform=iOS Simulator,name=iPhone 16' test 2>&1 | tee -a ../scratch/test_output.log 2>/dev/null || tee -a scratch/test_output.log
```

## Error Recovery

If validation fails:

1. **Directory does not contain an XCode project**: Use `rg --files --glob "**/*.pbxproj" . | sed -e "s/\/project.pbxproj//"`
2. **Scheme not found**: Use `xcodebuild -project playground/Playground.xcodeproj -list` to see available schemes
3. **Simulator not found**: Use `xcrun simctl list devices` to see available simulators
4. **Build failures**: Check logs in scratch directory
5. **Test failures**: Run individual test targets to isolate issues
