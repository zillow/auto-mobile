import org.jetbrains.intellij.platform.gradle.extensions.intellijPlatform

plugins {
  kotlin("jvm")
  alias(libs.plugins.kotlin.serialization)
  kotlin("plugin.compose")
  id("org.jetbrains.intellij.platform") version "2.13.1"
  // Note: Using IntelliJ Platform's composeUI() instead of standalone org.jetbrains.compose
  // to avoid bundling duplicate coroutines that conflict with IDE's version
}

repositories {
  google()
  mavenCentral()
  intellijPlatform { defaultRepositories() }
}

java {
  toolchain { languageVersion.set(JavaLanguageVersion.of(libs.versions.build.java.target.get())) }
}

sourceSets {
  named("main") { resources.srcDir(rootProject.projectDir.parentFile.resolve("schemas")) }
}

dependencies {
  // Shared module (UX, unix socket architecture, settings, data sources)
  // Exclude coroutines and Compose runtime since IntelliJ provides them
  implementation(project(":desktop-core")) {
    exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-core")
    exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-core-jvm")
    exclude(group = "org.jetbrains.compose.runtime")
    exclude(group = "org.jetbrains.compose.ui")
    exclude(group = "org.jetbrains.compose.foundation")
    exclude(group = "org.jetbrains.compose.material3")
  }

  // Shared validation module
  implementation(project(":test-plan-validation"))

  // Kotlin ecosystem (provided by IntelliJ platform, don't bundle)
  compileOnly(libs.kotlinx.coroutines)
  compileOnly(libs.kotlinx.serialization)

  // YAML and JSON schema validation (transitive from test-plan-validation)
  implementation(libs.snakeyaml)
  implementation(libs.json.schema.validator)

  // Test dependencies
  testImplementation("junit:junit:4.13.2")
  testImplementation(libs.kotlin.test)
  testImplementation(libs.kotlinx.coroutines.test)

  intellijPlatform {
    intellijIdea("2025.3")
    bundledPlugin("com.intellij.java")
    bundledPlugin("org.jetbrains.plugins.yaml")
    composeUI()
    pluginVerifier()
  }
}

intellijPlatform {
  pluginConfiguration {
    id.set("com.automobile.ide")
    name.set("AutoMobile")
    version.set("0.1.0")
    description.set(
        "AutoMobile IDE integration for authoring tests and visualizing navigation graphs."
    )

    ideaVersion {
      sinceBuild.set("253")
      untilBuild.set("253.*")
    }

    vendor {
      name.set("AutoMobile")
      email.set("support@automobile.dev")
      url.set("https://github.com/kaeawc/auto-mobile")
    }
  }

  pluginVerification { ides { recommended() } }
}
