import org.jetbrains.intellij.platform.gradle.extensions.intellijPlatform

plugins {
  kotlin("jvm")
  alias(libs.plugins.kotlin.serialization)
  kotlin("plugin.compose")
  id("org.jetbrains.intellij.platform") version "2.10.5"
  id("org.jetbrains.compose") version "1.10.0"
}

repositories {
  google()
  mavenCentral()
  maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
  intellijPlatform {
    defaultRepositories()
  }
}

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(libs.versions.build.java.target.get()))
  }
}

sourceSets {
  named("main") {
    resources.srcDir(rootProject.projectDir.parentFile.resolve("schemas"))
  }
}

dependencies {
  // Shared validation module
  implementation(project(":test-plan-validation"))

  // Kotlin ecosystem
  implementation(libs.kotlinx.coroutines)
  implementation(libs.kotlinx.serialization)

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
