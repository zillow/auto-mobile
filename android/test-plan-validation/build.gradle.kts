import org.jetbrains.kotlin.gradle.dsl.KotlinVersion
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
  kotlin("jvm")
  alias(libs.plugins.kotlin.serialization)
  `java-library`
}

java {
  toolchain { languageVersion.set(JavaLanguageVersion.of(libs.versions.build.java.target.get())) }
}

dependencies {
  // YAML processing and schema validation
  implementation(libs.snakeyaml)
  implementation(libs.json.schema.validator)

  // Kotlin serialization for JSON conversion
  implementation(libs.kotlinx.serialization)

  // Test dependencies
  testImplementation(libs.kotlin.test)
  testImplementation(libs.bundles.unit.test)
}

// Configure Kotlin compilation options
tasks.withType<KotlinCompile>().configureEach {
  compilerOptions {
    languageVersion.set(
        KotlinVersion.valueOf(
            "KOTLIN_${libs.versions.build.kotlin.language.get().replace(".", "_")}"
        )
    )
  }
}
