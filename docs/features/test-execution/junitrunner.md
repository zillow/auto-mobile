# Test Execution - JUnitRunner

Add this test Gradle dependency to all Android apps and libraries in your codebase. You can also add it only to the
modules that cover the UI you want to test.

```gradle
testImplementation("dev.jasonpearson.automobile.junitrunner:x.y.z")
```

Note that this artifact hasn't been published to Maven Central just yet and is forthcoming.  


In the meantime, publish to your mavenLocal (`~/.m2`) via:

```
./gradlew publishToMavenLocal
```

and use the above testImplementation dependency with `x.y.z` version from `android/junit-runner/build.gradle.kts`.
