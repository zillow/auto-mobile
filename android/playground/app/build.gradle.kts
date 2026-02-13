plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
}

// Signing configuration: reads from environment variables (CI) or gradle.properties (local)
// Paths are resolved relative to project root using rootProject.file()
val releaseStoreFilePath: String? =
    System.getenv("RELEASE_KEYSTORE_PATH") ?: findProperty("RELEASE_KEYSTORE_PATH") as String?
val releaseStorePassword: String? =
    System.getenv("RELEASE_KEYSTORE_PASSWORD")
        ?: findProperty("RELEASE_KEYSTORE_PASSWORD") as String?
val releaseKeyAlias: String? =
    System.getenv("RELEASE_KEY_ALIAS") ?: findProperty("RELEASE_KEY_ALIAS") as String?
val releaseKeyPassword: String? =
    System.getenv("RELEASE_KEY_PASSWORD") ?: findProperty("RELEASE_KEY_PASSWORD") as String?
val releaseStoreFile: File? =
    releaseStoreFilePath?.let { path ->
      val file = File(path)
      if (file.isAbsolute) file else rootProject.file(path)
    }
val hasReleaseSigning =
    releaseStoreFile?.exists() == true &&
        !releaseStorePassword.isNullOrBlank() &&
        !releaseKeyAlias.isNullOrBlank() &&
        !releaseKeyPassword.isNullOrBlank()

android {
  namespace = "dev.jasonpearson.automobile.playground"
  compileSdk = libs.versions.build.android.compileSdk.get().toInt()
  buildToolsVersion = libs.versions.build.android.buildTools.get()

  defaultConfig {
    applicationId = "dev.jasonpearson.automobile.playground"
    minSdk = libs.versions.build.android.minSdk.get().toInt()
    targetSdk = libs.versions.build.android.targetSdk.get().toInt()
    versionCode = 1
    versionName = "0.0.13-SNAPSHOT"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  signingConfigs {
    create("release") {
      storeFile = releaseStoreFile
      storePassword = releaseStorePassword
      keyAlias = releaseKeyAlias
      keyPassword = releaseKeyPassword
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      signingConfig =
          if (hasReleaseSigning) {
            signingConfigs.getByName("release")
          } else {
            signingConfigs.getByName("debug")
          }
    }
    debug {
      signingConfig =
          if (hasReleaseSigning) {
            signingConfigs.getByName("release")
          } else {
            signingConfigs.getByName("debug")
          }
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.toVersion(libs.versions.build.java.target.get())
    targetCompatibility = JavaVersion.toVersion(libs.versions.build.java.target.get())
  }
  buildFeatures { compose = true }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
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
  implementation(projects.playground.demos)
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
