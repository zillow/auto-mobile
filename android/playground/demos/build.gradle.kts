plugins {
  alias(libs.plugins.android.library)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.compose.compiler)
}

android {
  namespace = "dev.jasonpearson.automobile.demos"
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
  }
}

dependencies {
  implementation(libs.androidx.core)
  implementation(libs.androidx.appcompat)
  implementation(libs.material)

  // Compose dependencies
  implementation(platform(libs.compose.bom))
  implementation(libs.bundles.compose.ui)

  // AutoMobile SDK utilities
  implementation(projects.autoMobileSdk)

  testImplementation(libs.junit)
  testImplementation(projects.junitRunner)
}
