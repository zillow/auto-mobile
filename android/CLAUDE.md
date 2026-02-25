# AutoMobile Android

Quick reference for AI agents working in `android/`. Run all commands from the repo root unless noted.

## Project Layout
- `android/` - Android Kotlin Gradle project (apps, libraries, JUnit runner)
- `android/ide-plugin/` - IntelliJ/Android Studio plugin (Gradle project)

## Common Commands (from repo root)
- `./gradlew -p android <task>`
- `./gradlew -p android :junit-runner:test`
- `./gradlew -p android :control-proxy:assembleDebug`
- `./gradlew -p android :ide-plugin:build`

## Notes
- Prefer `./gradlew -p android` to avoid changing directories.
- Android validation scripts live under `scripts/ktfmt/`, `scripts/xml/`, and `scripts/android/`.
