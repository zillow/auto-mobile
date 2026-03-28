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
  // Shared modules
  implementation(project(":protocol"))
  implementation(project(":test-plan-validation"))

  // Compose Desktop
  implementation(compose.desktop.currentOs)
  implementation(compose.material3)
  implementation(compose.materialIconsExtended)

  // Kotlin ecosystem
  implementation(libs.kotlinx.coroutines)
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.10.2")
  implementation(libs.kotlinx.serialization)

  // MCP Kotlin SDK for client communication
  implementation("io.modelcontextprotocol:kotlin-sdk:0.10.0")
  // Ktor client engine for MCP transport
  implementation(libs.ktor.client.cio)

  // YAML and JSON schema validation
  implementation(libs.snakeyaml)
  implementation(libs.json.schema.validator)

  // Test dependencies
  testImplementation(libs.kotlin.test)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation("junit:junit:4.13.2")
}
