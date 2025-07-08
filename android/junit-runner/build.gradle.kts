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
  withJavadocJar()
}

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
            "KOTLIN_${libs.versions.build.kotlin.language.get().replace(".", "_")}"))
  }
}

mavenPublishing {
  coordinates(project.group.toString(), "junit-runner", project.version.toString())

  pom {
    name.set("AutoMobile JUnit Runner")
    description.set("A description of what my library does.")
  }
}
