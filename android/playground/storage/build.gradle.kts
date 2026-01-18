plugins {
  alias(libs.plugins.android.library)
}

android {
  namespace = "dev.jasonpearson.automobile.storage"
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
  }
}

dependencies {
  implementation(libs.androidx.core)
  implementation(libs.androidx.appcompat)
  implementation(libs.material)

  // Kotlin coroutines
  implementation(libs.kotlinx.coroutines)

  testImplementation(libs.junit)
}
