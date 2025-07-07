plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.kotlin.serialization)
  alias(libs.plugins.compose.compiler)
}

android {
  namespace = "com.zillow.automobile.accessibilityservice"
  compileSdk = libs.versions.build.android.compileSdk.get().toInt()
  buildToolsVersion = libs.versions.build.android.buildTools.get()

  defaultConfig {
    applicationId = "com.zillow.automobile.accessibilityservice"
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

  buildFeatures { compose = true }

  compileOptions {
    sourceCompatibility = JavaVersion.toVersion(libs.versions.build.java.target.get())
    targetCompatibility = JavaVersion.toVersion(libs.versions.build.java.target.get())
  }
  kotlinOptions {
    jvmTarget = libs.versions.build.java.target.get()
    languageVersion = libs.versions.build.kotlin.language.get()
    freeCompilerArgs += "-opt-in=androidx.media3.common.util.UnstableApi"
  }
}

dependencies {
  implementation(libs.androidx.core)

  // Compose BOM
  implementation(platform(libs.compose.bom))
  implementation(libs.bundles.compose.ui)
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Kotlin coroutines
  implementation(libs.kotlinx.coroutines)

  // Kotlinx Serialization for navigation
  implementation(libs.kotlinx.serialization)

  // Test dependencies
  testImplementation(libs.bundles.unit.test)
  testImplementation(projects.junitRunner)
  testImplementation(libs.robolectric)

  // Compose test dependencies
  androidTestImplementation(libs.bundles.compose.ui.espresso.test)
  debugImplementation(libs.bundles.compose.ui.debug)
}
