import org.jetbrains.intellij.platform.gradle.extensions.intellijPlatform

plugins {
  kotlin("jvm")
  alias(libs.plugins.kotlin.serialization)
  kotlin("plugin.compose")
  id("org.jetbrains.intellij.platform") version "2.11.0"
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
  // Shared validation module
  implementation(project(":test-plan-validation"))

  // Kotlin ecosystem (provided by IntelliJ platform, don't bundle)
  compileOnly(libs.kotlinx.coroutines)
  compileOnly(libs.kotlinx.serialization)

  // MCP Kotlin SDK for client communication
  implementation("io.modelcontextprotocol:kotlin-sdk:0.4.0") {
    // Exclude coroutines since IntelliJ provides them
    exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-core")
  }
  // Ktor client engine for MCP transport (CIO = Coroutine-based I/O)
  implementation("io.ktor:ktor-client-cio:3.0.3") {
    exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-core")
  }

  // YAML and JSON schema validation (transitive from test-plan-validation)
  implementation(libs.snakeyaml)
  implementation(libs.json.schema.validator)

  // Test dependencies
  testImplementation("junit:junit:4.13.2")
  testImplementation(libs.kotlin.test)

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
