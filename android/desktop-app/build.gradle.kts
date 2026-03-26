import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
  kotlin("jvm")
  alias(libs.plugins.kotlin.serialization)
  kotlin("plugin.compose")
  alias(libs.plugins.compose.multiplatform)
}

repositories {
  google()
  mavenCentral()
}

java {
  toolchain { languageVersion.set(JavaLanguageVersion.of(libs.versions.build.java.target.get())) }
}

sourceSets {
  named("main") { resources.srcDir(rootProject.projectDir.parentFile.resolve("schemas")) }
}

dependencies {
  // Shared module (UX, unix socket architecture, settings, data sources)
  implementation(project(":desktop-core"))

  // Compose Desktop
  implementation(compose.desktop.currentOs)
  implementation(compose.material3)
  implementation(compose.materialIconsExtended)

  // Kotlin ecosystem
  implementation(libs.kotlinx.coroutines)
  implementation(libs.kotlinx.serialization)

  // Test dependencies
  testImplementation(libs.kotlin.test)
  testImplementation(libs.kotlinx.coroutines.test)
}

compose.desktop {
  application {
    mainClass = "dev.jasonpearson.automobile.desktop.MainKt"
    nativeDistributions {
      targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
      packageName = "AutoMobile"
      packageVersion = "1.0.0"
      description = "AutoMobile Desktop - Device automation and testing dashboard"
      vendor = "AutoMobile"

      linux { iconFile.set(project.file("src/main/resources/icons/app-icon.png")) }
      macOS { iconFile.set(project.file("src/main/resources/icons/app-icon.icns")) }
      windows { iconFile.set(project.file("src/main/resources/icons/app-icon.ico")) }
    }
  }
}
