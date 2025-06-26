import org.jetbrains.kotlin.gradle.dsl.KotlinVersion
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
  kotlin("jvm")
  alias(libs.plugins.kotlin.serialization)
  `maven-publish`

  // Apply the Application plugin to add support for building an executable JVM application.
  application
}

group = "com.zillow.automobile.kotlintestauthor"

version = "0.0.1-SNAPSHOT"

description = "AutoMobile Kotlin test authoring tool for Android"

java {
  toolchain { languageVersion.set(JavaLanguageVersion.of(libs.versions.build.java.target.get())) }
  // Configure Gradle daemon to use same JDK
  System.setProperty("org.gradle.java.home", System.getProperty("java.home"))
  withSourcesJar()
  withJavadocJar()
}

dependencies {
  implementation(projects.junitRunner)

  implementation(libs.kotlin.poet)
  implementation(libs.clikt)
  implementation(libs.junit)

  // Use the kotlinx ecosystem bundle for datetime, coroutines, and serialization
  implementation(libs.bundles.kotlinx.ecosystem)

  // Test dependencies
  testImplementation(libs.kotlin.test)
  testImplementation(libs.junit)
}

// Configure Kotlin compilation options
tasks.withType<KotlinCompile>().configureEach {
  compilerOptions {
    languageVersion.set(
        KotlinVersion.valueOf(
            "KOTLIN_${libs.versions.build.kotlin.language.get().replace(".", "_")}"))
  }
}

application {
  // Define the Fully Qualified Name for the application main class
  // (Note that Kotlin compiles `App.kt` to a class with FQN `com.example.app.AppKt`.
  mainClass = "com.zillow.automobile.kotlintestauthor.AppKt"
}

publishing {
  publications {
    create<MavenPublication>("maven") {
      from(components["java"])

      groupId = project.group.toString()
      artifactId = "kotlin-test-author"
      version = project.version.toString()

      pom {
        name.set("AutoMobile Kotlin Test Author")
        description.set("Kotlin test authoring tool for AutoMobile CLI")
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
            name.set("Zillow Engineering")
            email.set("engineering@zillow.com")
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
      name = "LocalRepo"
      url = uri(layout.buildDirectory.dir("repo"))
    }
  }
}
