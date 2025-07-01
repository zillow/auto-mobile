# AutoMobile JUnitRunner

Add this test Gradle dependency to all Android apps and libraries in your codebase. You could opt to only add it to some
modules, but AutoMobile's automatic test authoring will still attempt to place tests in the module it thinks most closely
matches the UI being tested.

```gradle
testImplementation("com.zillow.automobile.junitrunner:x.y.z")
```

Note that this artifact hasn't been published to Maven Central just yet and is forthcoming.
