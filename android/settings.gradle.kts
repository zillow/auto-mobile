dependencyResolutionManagement {
  @Suppress("UnstableApiUsage") repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  // Use Maven Central as the default repository (where Gradle will download dependencies) in all
  // subprojects.
  @Suppress("UnstableApiUsage")
  repositories {
    google()
    mavenCentral()
  }
}

pluginManagement {
  repositories {
    google {
      content {
        includeGroupByRegex("com\\.android.*")
        includeGroupByRegex("com\\.google.*")
        includeGroupByRegex("androidx.*")
      }
    }
    mavenCentral()
    gradlePluginPortal()
  }
}

plugins {
  // Use the Foojay Toolchains plugin to automatically download JDKs required by subprojects.
  id("org.gradle.toolchains.foojay-resolver-convention") version "0.8.0"
}

enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

include(":kotlin-test-author")

include(":junit-runner")

include(":playground:app")

include(":playground:login")

include(":playground:onboarding")

include(":playground:mediaplayer")

include(":playground:home")

include(":playground:discover")

include(":playground:settings")

include(":playground:slides")

include(":playground:storage")

include(":playground:design:assets")

include(":playground:design:system")

rootProject.name = "auto-mobile-android"

include(":playground:experimentation")

include(":playground:analytics")
