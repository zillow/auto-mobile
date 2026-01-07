import org.jetbrains.intellij.platform.gradle.extensions.intellijPlatform

plugins {
  kotlin("jvm") version "2.2.20"
  kotlin("plugin.serialization") version "2.2.20"
  kotlin("plugin.compose") version "2.2.20"
  id("org.jetbrains.intellij.platform") version "2.10.5"
  id("org.jetbrains.compose") version "1.8.0"
}

repositories {
  google()
  mavenCentral()
  maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
  intellijPlatform { defaultRepositories() }
}

kotlin { jvmToolchain(17) }

dependencies {
  implementation(compose.desktop.currentOs)
  implementation("org.jetbrains.jewel:jewel-foundation:0.33.0-253.29795")
  implementation("org.jetbrains.jewel:jewel-ui:0.33.0-253.29795")
  implementation("org.jetbrains.jewel:jewel-int-ui-standalone:0.33.0-253.29795")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
  testImplementation("junit:junit:4.13.2")
  testImplementation("org.jetbrains.kotlin:kotlin-test")

  intellijPlatform {
    intellijIdea("2025.3")
    bundledPlugin("com.intellij.java")
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
