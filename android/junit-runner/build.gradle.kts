import org.jetbrains.kotlin.gradle.dsl.KotlinVersion
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
  kotlin("jvm")
  alias(libs.plugins.kotlin.serialization)
  `maven-publish`
  `java-library`
}

group = "com.zillow.automobile"

version = "0.0.1-SNAPSHOT"

description = "AutoMobile JUnit runner"

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
  implementation(libs.bundles.kotlinxEcosystem)

  // Koog AI agent framework
  implementation(libs.koog.agents)

  // Test dependencies using bundles where appropriate
  testImplementation(libs.kotlin.test)
  testImplementation(libs.bundles.unit.test)
  testImplementation(libs.junit.jupiter)
  testImplementation(libs.junit.vintage.engine) // For JUnit 4 compatibility
  testImplementation(libs.mockk)
}

// Configure Kotlin compilation options
tasks.withType<KotlinCompile>().configureEach {
  compilerOptions {
    languageVersion.set(
        KotlinVersion.valueOf(
            "KOTLIN_${libs.versions.build.kotlin.language.get().replace(".", "_")}"))
  }
}

publishing {
  publications {
    create<MavenPublication>("maven") {
      from(components["java"])

      groupId = project.group.toString()
      artifactId = "junit-runner"
      version = project.version.toString()

      pom {
        name.set("AutoMobile JUnit Runner")
        description.set("JUnit runner for AutoMobile CLI integration with Android UI tests")
        url.set("https://github.com/zillow/auto-mobile")

        licenses {
          license {
            name.set("Apache License 2.0")
            url.set("https://www.apache.org/licenses/LICENSE-2.0")
          }
        }

        developers {
          developer {
            id.set("zillow")
            name.set("Zillow OSS")
            email.set("oss@zillow.com")
          }
        }

        scm {
          connection.set("scm:git:git://github.com/zillow/auto-mobile.git")
          developerConnection.set("scm:git:ssh://github.com/zillow/auto-mobile.git")
          url.set("https://github.com/zillow/auto-mobile")
        }
      }
    }
  }

  repositories {
    // For local development
    maven {
      name = "Local"
      url = uri(layout.buildDirectory.dir("repo"))
    }

    // Maven Central via Sonatype
    maven {
      name = "Central"
      url = uri("https://central.sonatype.com/api/v1/publisher/upload")
      credentials {
        username = findProperty("sonatype.username") as String? ?: System.getenv("SONATYPE_USERNAME")
        password = findProperty("sonatype.password") as String? ?: System.getenv("SONATYPE_PASSWORD")
      }
    }
  }
}
