import org.jetbrains.kotlin.gradle.dsl.KotlinVersion
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
  kotlin("jvm")
  alias(libs.plugins.kotlin.serialization)
  alias(libs.plugins.mavenPublish)

  // Apply the Application plugin to add support for building an executable JVM application.
  application
}

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

mavenPublishing {
  coordinates(project.group.toString(), "android-test-author", project.version.toString())

  pom {
    name.set("AutoMobile Android Test Author")
    description.set("AutoMobile Kotlin test authoring tool for Android")
  }
}
