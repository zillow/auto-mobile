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

version = "0.0.7-SNAPSHOT"

dependencies {
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
  publishToMavenCentral()
  signAllPublications()

  coordinates("dev.jasonpearson.auto-mobile", "auto-mobile-sdk", project.version.toString())

  pom {
    name.set("AutoMobile SDK")
    description.set(
        "Android library SDK for hooking into navigation events across various frameworks (XML, Compose, Circuit, etc.)"
    )
    inceptionYear.set("2025")
    url.set("https://kaeawc.github.io/auto-mobile/")
    licenses {
      license {
        name.set("The Apache Software License, Version 2.0")
        url.set("https://www.apache.org/licenses/LICENSE-2.0.txt")
        distribution.set("repo")
      }
    }
    developers {
      developer {
        id.set("Jason Pearson")
        name.set("Jason Pearson")
        url.set("https://github.com/kaeawc/")
        email.set("jason.d.pearson@gmail.com")
      }
    }
    scm {
      url.set("https://github.com/kaeawc/auto-mobile/")
      connection.set("scm:git:git://github.com/kaeawc/auto-mobile.git")
      developerConnection.set("scm:git:ssh://git@github.com/kaeawc/auto-mobile.git")
    }
  }
}

tasks.configureEach {
  if (name == "generateMetadataFileForMavenPublication") {
    dependsOn("plainJavadocJar")
  }
}
