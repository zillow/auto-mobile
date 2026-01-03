import com.vanniktech.maven.publish.MavenPublishBaseExtension
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.KotlinVersion
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

buildscript {
  dependencies {
    // Necessary if we are to override R8
    // classpath(libs.r8)
    classpath(libs.agp)
    classpath(libs.kgp)
  }
}

plugins {
  `version-catalog`
  alias(libs.plugins.kotlin.android) apply false
  alias(libs.plugins.android.library) apply false
  alias(libs.plugins.android.application) apply false
  alias(libs.plugins.kotlin.serialization) apply false
  alias(libs.plugins.compose.compiler) apply false
  alias(libs.plugins.mavenPublish) apply false
}

plugins.withId(libs.plugins.mavenPublish.get().pluginId) {
  if (project.path != ":compiler") {
    apply(plugin = "org.jetbrains.dokka")
  }
  configure<MavenPublishBaseExtension> { publishToMavenCentral(automaticRelease = true) }

  // configuration required to produce unique META-INF/*.kotlin_module file names
  tasks.withType<KotlinCompile>().configureEach {
    compilerOptions { moduleName.set(project.property("POM_ARTIFACT_ID") as String) }
  }
}

val gradleWorkerJvmArgs = providers.gradleProperty("org.gradle.testWorker.jvmargs").get()

subprojects {
  tasks.withType<Test>().configureEach {
    jvmArgs(gradleWorkerJvmArgs.split(" ").filter { it.isNotBlank() })
  }

  tasks.withType<KotlinCompile>().configureEach {
    compilerOptions {
      languageVersion.set(
          KotlinVersion.valueOf(
              "KOTLIN_${libs.versions.build.kotlin.language.get().replace(".", "_")}"))
      jvmTarget.set(JvmTarget.valueOf("JVM_${libs.versions.build.java.target.get()}"))
      freeCompilerArgs.addAll(
          listOf(
              "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
              "-opt-in=androidx.media3.common.util.UnstableApi",
              "-opt-in=kotlin.time.ExperimentalTime,kotlin.RequiresOptIn",
              "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
              "-opt-in=kotlin.ExperimentalUnsignedTypes",
              "-opt-in=kotlin.time.ExperimentalTime",
              "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
              "-opt-in=kotlinx.coroutines.FlowPreview",
              "-Xcontext-receivers",
          ))
    }
  }
}
