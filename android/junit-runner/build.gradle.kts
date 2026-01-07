import org.jetbrains.kotlin.gradle.dsl.KotlinVersion
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
  kotlin("jvm")
  alias(libs.plugins.kotlin.serialization)
  `java-library`
  alias(libs.plugins.mavenPublish)
}

java {
  toolchain { languageVersion.set(JavaLanguageVersion.of(libs.versions.build.java.target.get())) }
  // Configure Gradle daemon to use same JDK
  System.setProperty("org.gradle.java.home", System.getProperty("java.home"))
  withSourcesJar()
}

version = "0.0.7-SNAPSHOT"

dependencies {
  // JUnit dependencies
  implementation(libs.junit)
  implementation(libs.junit.jupiter.api)
  implementation(libs.junit.jupiter.engine)

  // YAML processing
  implementation(libs.snakeyaml)

  // Kotlin ecosystem (coroutines, datetime, serialization)
  implementation(libs.bundles.kotlinx.ecosystem)

  // Koog AI agent framework
  implementation(libs.koog.agents)

  // Test dependencies using bundles where appropriate
  testImplementation(libs.kotlin.test)
  testImplementation(libs.bundles.unit.test)
  testImplementation(libs.junit.jupiter)
  testImplementation(libs.junit.vintage.engine) // For JUnit 4 compatibility
}

// Configure Kotlin compilation options
tasks.withType<KotlinCompile>().configureEach {
  compilerOptions {
    languageVersion.set(
        KotlinVersion.valueOf(
            "KOTLIN_${libs.versions.build.kotlin.language.get().replace(".", "_")}"
        )
    )
  }
}

mavenPublishing {
  publishToMavenCentral()
  signAllPublications()

  coordinates("dev.jasonpearson.automobile", "junit-runner", project.version.toString())

  pom {
    name.set("AutoMobile JUnit Runner")
    description.set("Runs AutoMobile JUnit tests with AutoMobile CLI.")
    inceptionYear.set("2025")
    url.set("https://kaeawc.github.io/auto-mobile/")
    licenses {
      license {
        name.set("The Apache Software License, Version 2.0")
        url.set("https://www.apache.org/licenses/LICENSE-2.0.txt")
        distribution.set("repo")
      }
    }
    developers {
      developer {
        id.set("Jason Pearson")
        name.set("Jason Pearson")
        url.set("https://github.com/kaeawc/")
        email.set("jason.d.pearson@gmail.com")
      }
    }
    scm {
      url.set("https://github.com/kaeawc/auto-mobile/")
      connection.set("scm:git:git://github.com/kaeawc/auto-mobile.git")
      developerConnection.set("scm:git:ssh://git@github.com/kaeawc/auto-mobile.git")
    }
  }
}

tasks.configureEach {
  if (name == "generateMetadataFileForMavenPublication") {
    dependsOn("plainJavadocJar")
  }
}

tasks.withType<Test> {
  // Enable parallel test execution across multiple devices
  maxParallelForks = Runtime.getRuntime().availableProcessors().coerceAtLeast(2)
  dependsOn(":accessibility-service:assembleDebug")
  val accessibilityApk =
      project(":accessibility-service")
          .layout
          .buildDirectory
          .file("outputs/apk/debug/accessibility-service-debug.apk")
  environment("AUTOMOBILE_ACCESSIBILITY_APK_PATH", accessibilityApk.get().asFile.absolutePath)
  systemProperty("automobile.accessibility.apk.path", accessibilityApk.get().asFile.absolutePath)
  systemProperty("automobile.daemon.force.restart", "true")

  testLogging {
    // Show standard output and error for tests
    showStandardStreams = true
    // Show detailed test events
    events("passed", "skipped", "failed", "standardOut", "standardError")
  }
}
