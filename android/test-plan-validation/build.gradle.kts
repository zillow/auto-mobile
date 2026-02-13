import org.jetbrains.kotlin.gradle.dsl.KotlinVersion
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
  kotlin("jvm")
  alias(libs.plugins.kotlin.serialization)
  `java-library`
  alias(libs.plugins.mavenPublish)
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

// Version comes from root project's gradle.properties (VERSION_NAME)

mavenPublishing {
  // Coordinates: group and version from root, artifact from local gradle.properties
  coordinates(
      property("GROUP").toString(),
      property("POM_ARTIFACT_ID").toString(),
      version.toString(),
  )

  pom {
    name.set(property("POM_NAME").toString())
    description.set(property("POM_DESCRIPTION").toString())
    inceptionYear.set("2025")
    url.set(property("POM_URL").toString())
    licenses {
      license {
        name.set(property("POM_LICENCE_NAME").toString())
        url.set(property("POM_LICENCE_URL").toString())
        distribution.set("repo")
      }
    }
    developers {
      developer {
        id.set(property("POM_DEVELOPER_ID").toString())
        name.set(property("POM_DEVELOPER_NAME").toString())
        url.set("https://github.com/${property("POM_DEVELOPER_ID")}/")
        email.set(property("POM_DEVELOPER_EMAIL").toString())
      }
    }
    scm {
      url.set(property("POM_SCM_URL").toString())
      connection.set(property("POM_SCM_CONNECTION").toString())
      developerConnection.set(property("POM_SCM_DEV_CONNECTION").toString())
    }
  }
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
