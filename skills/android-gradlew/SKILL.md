---
name: android-gradlew
description: Use this skill for Android project tasks in the android/ subdirectory, including build, test, lint, and verification commands that must run via the Gradle wrapper.
---

# Android Gradle Wrapper

Run Android tasks from the `android/` directory using the Gradle wrapper.

- Use `(cd android && ./gradlew <task>)` for Android-only builds, tests, and lint.
- Avoid running Gradle tasks from the repo root.
- Prefer explicit tasks (e.g., `assemble`, `test`, `lint`, `connectedAndroidTest`) based on the requested verification.
