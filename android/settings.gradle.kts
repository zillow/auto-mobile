dependencyResolutionManagement {
  val mavenUsername = System.getenv("MAVEN_USERNAME")
  if (!mavenUsername.isNullOrBlank() &&
      System.getProperty("org.gradle.project.mavenCentralUsername").isNullOrBlank()) {
    System.setProperty("org.gradle.project.mavenCentralUsername", mavenUsername)
  }
  val mavenPassword = System.getenv("MAVEN_PASSWORD")
  if (!mavenPassword.isNullOrBlank() &&
      System.getProperty("org.gradle.project.mavenCentralPassword").isNullOrBlank()) {
    System.setProperty("org.gradle.project.mavenCentralPassword", mavenPassword)
  }

  @Suppress("UnstableApiUsage") repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)
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

include(":accessibility-service")

include(":auto-mobile-sdk")

include(":junit-runner")

include(":test-plan-validation")

include(":ide-plugin")

include(":playground:analytics")

include(":playground:app")

include(":playground:design:assets")

include(":playground:design:system")

include(":playground:discover")

include(":playground:demos")

include(":playground:experimentation")

include(":playground:home")

include(":playground:login")

include(":playground:mediaplayer")

include(":playground:onboarding")

include(":playground:settings")

include(":playground:slides")

include(":playground:storage")

rootProject.name = "auto-mobile-android"
