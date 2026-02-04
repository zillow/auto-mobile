import org.jetbrains.kotlin.gradle.dsl.KotlinVersion
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
  alias(libs.plugins.android.library)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.mavenPublish)
}

android {
  namespace = "dev.jasonpearson.automobile.sdk"
  compileSdk = 36

  defaultConfig {
    minSdk = 24

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    consumerProguardFiles("consumer-rules.pro")
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.toVersion(libs.versions.build.java.target.get())
    targetCompatibility = JavaVersion.toVersion(libs.versions.build.java.target.get())
  }

  buildFeatures { compose = true }
}

// Version comes from root project's gradle.properties (VERSION_NAME)

dependencies {
  // Protocol module for type-safe event serialization
  implementation(project(":protocol"))

  // Android core libraries
  implementation(libs.androidx.core)
  implementation(libs.androidx.appcompat)
  implementation(libs.androidx.lifecycle.runtime)

  // Kotlin coroutines
  implementation(libs.kotlinx.coroutines)

  // Compose runtime for @Composable support
  implementation(platform(libs.compose.bom))
  implementation("androidx.compose.runtime:runtime")
  implementation(libs.bundles.compose.ui)

  // Navigation3 support for Compose navigation tracking
  implementation(libs.navigation3.runtime)

  // Test dependencies
  testImplementation(libs.kotlin.test)
  testImplementation(libs.junit)
  testImplementation(libs.bundles.unit.test)
  testImplementation(libs.robolectric)
}

// Configure Kotlin compilation options
tasks.withType<KotlinCompile>().configureEach {
  compilerOptions {
    jvmTarget.set(
        org.jetbrains.kotlin.gradle.dsl.JvmTarget.fromTarget(libs.versions.build.java.target.get())
    )
    languageVersion.set(
        KotlinVersion.valueOf(
            "KOTLIN_${libs.versions.build.kotlin.language.get().replace(".", "_")}"
        )
    )
  }
}

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
