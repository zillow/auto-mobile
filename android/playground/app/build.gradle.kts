plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
}

android {
  namespace = "dev.jasonpearson.automobile.playground"
  compileSdk = libs.versions.build.android.compileSdk.get().toInt()
  buildToolsVersion = libs.versions.build.android.buildTools.get()

  defaultConfig {
    applicationId = "dev.jasonpearson.automobile.playground"
    minSdk = libs.versions.build.android.minSdk.get().toInt()
    targetSdk = libs.versions.build.android.targetSdk.get().toInt()
    versionCode = 1
    versionName = "1.0"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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

kotlin {
  compilerOptions {
    jvmTarget.set(
        org.jetbrains.kotlin.gradle.dsl.JvmTarget.fromTarget(libs.versions.build.java.target.get())
    )
    languageVersion.set(
        org.jetbrains.kotlin.gradle.dsl.KotlinVersion.fromVersion(
            libs.versions.build.kotlin.language.get()
        )
    )
    freeCompilerArgs =
        listOf(
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
            "-opt-in=androidx.media3.common.util.UnstableApi",
            "-opt-in=kotlin.time.ExperimentalTime,kotlin.RequiresOptIn",
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
            "-opt-in=kotlin.ExperimentalUnsignedTypes",
            "-opt-in=kotlin.time.ExperimentalTime",
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
            "-opt-in=kotlinx.coroutines.FlowPreview",
        )
  }
}

dependencies {
  implementation(libs.androidx.core)
  implementation(libs.androidx.lifecycle.runtime)
  implementation(libs.androidx.startup)
  implementation(platform(libs.compose.bom))
  implementation(libs.bundles.compose.ui)

  // Lifecycle compose integration
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Kotlin coroutines
  implementation(libs.kotlinx.coroutines)

  // Navigation 3
  implementation(libs.navigation3.runtime)
  implementation(libs.navigation3.ui)

  // Kotlinx Serialization for navigation
  implementation(libs.kotlinx.serialization)

  // Media libraries for initializers
  implementation(libs.coil.compose)
  implementation(libs.coil.network.okhttp)

  // Splash Screen API support for Android 12+ backported to API 23+
  implementation(libs.androidx.core.splashscreen)

  // AutoMobile SDK for navigation tracking
  implementation(projects.autoMobileSdk)

  // Playground module dependencies
  implementation(projects.playground.design.system)
  implementation(projects.playground.login)
  implementation(projects.playground.home)
  implementation(projects.playground.discover)
  implementation(projects.playground.settings)
  implementation(projects.playground.mediaplayer)
  implementation(projects.playground.onboarding)
  implementation(projects.playground.slides)
  implementation(projects.playground.storage)
  implementation(projects.playground.experimentation)
  implementation(libs.androidx.lifecycle.viewmodel.navigation3.android)

  // Test dependencies
  testImplementation(libs.bundles.unit.test)
  testImplementation(projects.junitRunner)
  testImplementation(libs.robolectric)

  // Media3 annotation marker for opt-in (needed for compile-time opt-in checks)
  // Since the app uses androidx.media3.common.util.UnstableApi opt-in annotation,
  // we need the media3 library available at compile time
  compileOnly(libs.media3.exoplayer)
  testCompileOnly(libs.media3.exoplayer)

  // Debug dependencies
  debugImplementation(libs.bundles.compose.ui.debug)
}
