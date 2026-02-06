plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.serialization)
  alias(libs.plugins.compose.compiler)
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
  namespace = "dev.jasonpearson.automobile.accessibilityservice"
  compileSdk = libs.versions.build.android.compileSdk.get().toInt()
  buildToolsVersion = libs.versions.build.android.buildTools.get()

  defaultConfig {
    applicationId = "dev.jasonpearson.automobile.accessibilityservice"
    minSdk = libs.versions.build.android.minSdk.get().toInt()
    targetSdk = libs.versions.build.android.targetSdk.get().toInt()
    versionCode = 1
    versionName = "0.0.10-SNAPSHOT"

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

  lint {
    // Suppress ProtectedPermissions for MANAGE_CA_CERTIFICATES
    // This permission is used when the app is set as device owner/profile owner
    disable += "ProtectedPermissions"
  }

  buildFeatures { compose = true }

  compileOptions {
    sourceCompatibility = JavaVersion.toVersion(libs.versions.build.java.target.get())
    targetCompatibility = JavaVersion.toVersion(libs.versions.build.java.target.get())
  }

  packaging {
    resources {
      // Exclude duplicate META-INF files from Netty/Ktor dependencies
      excludes += "/META-INF/INDEX.LIST"
      excludes += "/META-INF/io.netty.versions.properties"
      excludes += "/META-INF/*.kotlin_module"
    }
  }
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

  // AutoMobile SDK for navigation event tracking
  implementation(projects.autoMobileSdk)

  // Protocol module for type-safe WebSocket messages
  implementation(projects.protocol)

  // Compose BOM
  implementation(platform(libs.compose.bom))
  implementation(libs.bundles.compose.ui)
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Kotlin coroutines
  implementation(libs.kotlinx.coroutines)

  // Kotlinx Serialization for navigation
  implementation(libs.kotlinx.serialization)

  // WebSocket server dependencies
  implementation(libs.ktor.server.core)
  implementation(libs.ktor.server.cors)
  implementation(libs.ktor.server.netty)
  implementation(libs.ktor.server.sse)
  implementation(libs.ktor.server.cio)
  implementation(libs.ktor.server.websockets)
  implementation(libs.ktor.server.content.negotiation)
  implementation(libs.ktor.serialization.kotlinx.json)
  implementation(libs.okhttp)
  implementation(libs.okhttp.sse)

  // Test dependencies
  testImplementation(libs.bundles.unit.test)
  testImplementation(projects.junitRunner)
  testImplementation(libs.robolectric)
  testImplementation(libs.ktor.client.core)
  testImplementation(libs.ktor.client.cio)
  testImplementation(libs.ktor.client.websockets)
  testImplementation(libs.ktor.client.content.negotiation)

  // Compose test dependencies
  debugImplementation(libs.bundles.compose.ui.debug)
}
