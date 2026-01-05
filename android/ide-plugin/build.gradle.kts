import org.jetbrains.intellij.platform.gradle.extensions.intellijPlatform

plugins {
  kotlin("jvm") version "1.9.24"
  kotlin("plugin.serialization") version "1.9.24"
  id("org.jetbrains.intellij.platform") version "2.10.5"
  id("org.jetbrains.compose") version "1.7.3"
}

repositories {
  google()
  mavenCentral()
  maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
  intellijPlatform {
    defaultRepositories()
  }
}

kotlin {
  jvmToolchain(17)
}

dependencies {
  implementation(compose.desktop.currentOs)
  implementation("org.jetbrains.jewel:jewel-foundation:0.28.0-243.27100")
  implementation("org.jetbrains.jewel:jewel-ui:0.28.0-243.27100")
  implementation("org.jetbrains.jewel:jewel-int-ui-standalone:0.28.0-243.27100")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

  intellijPlatform {
    intellijIdea("2024.3")
    instrumentationTools()
    pluginVerifier()
  }
}

intellijPlatform {
  pluginConfiguration {
    id.set("com.automobile.ide")
    name.set("AutoMobile")
    version.set("0.1.0")
    description.set("AutoMobile IDE integration for authoring tests and visualizing navigation graphs.")

    ideaVersion {
      sinceBuild.set("243")
      untilBuild.set("243.*")
    }

    vendor {
      name.set("AutoMobile")
      email.set("support@automobile.dev")
      url.set("https://github.com/kaeawc/auto-mobile")
    }
  }

  pluginVerification {
    ides {
      recommended()
    }
  }
}
