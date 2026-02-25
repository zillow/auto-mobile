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

// Version comes from root project's gradle.properties (VERSION_NAME)

dependencies {
  // Shared validation module
  api(project(":test-plan-validation"))

  // JUnit dependencies
  implementation(libs.junit)
  implementation(libs.junit.jupiter.api)
  implementation(libs.junit.jupiter.engine)

  // YAML processing and schema validation (transitive from test-plan-validation)
  implementation(libs.snakeyaml)
  implementation(libs.json.schema.validator)

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
  // Coordinates: group and version from root, artifact from local gradle.properties
  coordinates(
      property("GROUP").toString(),
      property("POM_ARTIFACT_ID").toString(),
      version.toString(),
  )

  pom {
    name.set(property("POM_NAME").toString())
    description.set(property("POM_DESCRIPTION").toString())
    inceptionYear.set("2025")
    url.set(property("POM_URL").toString())
    licenses {
      license {
        name.set(property("POM_LICENCE_NAME").toString())
        url.set(property("POM_LICENCE_URL").toString())
        distribution.set("repo")
      }
    }
    developers {
      developer {
        id.set(property("POM_DEVELOPER_ID").toString())
        name.set(property("POM_DEVELOPER_NAME").toString())
        url.set("https://github.com/${property("POM_DEVELOPER_ID")}/")
        email.set(property("POM_DEVELOPER_EMAIL").toString())
      }
    }
    scm {
      url.set(property("POM_SCM_URL").toString())
      connection.set(property("POM_SCM_CONNECTION").toString())
      developerConnection.set(property("POM_SCM_DEV_CONNECTION").toString())
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
  dependsOn(":control-proxy:assembleDebug")
  val accessibilityApk =
      project(":control-proxy")
          .layout
          .buildDirectory
          .file("outputs/apk/debug/control-proxy-debug.apk")
  environment("AUTOMOBILE_CTRL_PROXY_APK_PATH", accessibilityApk.get().asFile.absolutePath)
  systemProperty("automobile.ctrl.proxy.apk.path", accessibilityApk.get().asFile.absolutePath)
  systemProperty("automobile.daemon.force.restart", "true")

  testLogging {
    // Show standard output and error for tests
    showStandardStreams = true
    // Show detailed test events
    events("passed", "skipped", "failed", "standardOut", "standardError")
  }
}
