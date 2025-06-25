plugins {
  alias(libs.plugins.android.library)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.compose.compiler)
}

android {
  namespace = "com.zillow.automobile.mediaplayer"
  compileSdk = libs.versions.build.android.compileSdk.get().toInt()
  buildToolsVersion = libs.versions.build.android.buildTools.get()

  defaultConfig {
    minSdk = libs.versions.build.android.minSdk.get().toInt()
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
  kotlinOptions {
    jvmTarget = libs.versions.build.java.target.get()
    languageVersion = libs.versions.build.kotlin.language.get()
    freeCompilerArgs += "-opt-in=androidx.media3.common.util.UnstableApi"
  }
  buildFeatures { compose = true }
}

dependencies {
  implementation(libs.androidx.core)
  implementation(libs.androidx.appcompat)
  implementation(libs.material)

  implementation(projects.playground.design.system)
  implementation(projects.playground.experimentation)

  // Compose dependencies
  implementation(platform(libs.compose.bom))
  implementation(libs.bundles.compose.ui)
  implementation(libs.androidx.lifecycle.viewmodel.ktx)
  implementation(libs.androidx.lifecycle.runtime)

  // Lifecycle compose integration
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Kotlin coroutines
  implementation(libs.kotlinxCoroutines)

  // Media libraries
  implementation(libs.bundles.media.libraries)

  testImplementation(libs.junit)
  testImplementation(projects.junitRunner)
}
