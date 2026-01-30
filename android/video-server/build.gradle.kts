import org.jetbrains.kotlin.gradle.dsl.KotlinVersion
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
import javax.inject.Inject

plugins {
  kotlin("jvm")
  `java-library`
}

java {
  toolchain { languageVersion.set(JavaLanguageVersion.of(libs.versions.build.java.target.get())) }
}

// Android SDK android.jar as compileOnly dependency for Android APIs
val androidSdkPath: String =
    System.getenv("ANDROID_HOME")
        ?: System.getenv("ANDROID_SDK_ROOT")
        ?: "${System.getProperty("user.home")}/Library/Android/sdk"

val compileSdk: String = libs.versions.build.android.compileSdk.get()
val buildToolsVersion: String = libs.versions.build.android.buildTools.get()
val minSdk: String = libs.versions.build.android.minSdk.get()

dependencies {
  compileOnly(files("$androidSdkPath/platforms/android-$compileSdk/android.jar"))
}

// Configure Kotlin compilation options
tasks.withType<KotlinCompile>().configureEach {
  compilerOptions {
    languageVersion.set(
        KotlinVersion.valueOf(
            "KOTLIN_${libs.versions.build.kotlin.language.get().replace(".", "_")}"
        )
    )
  }
}

// Custom task to compile JAR to DEX using d8
abstract class D8DexTask
@Inject
constructor(private val execOperations: ExecOperations) : DefaultTask() {

  @get:InputFile abstract val inputJar: RegularFileProperty

  @get:OutputFile abstract val outputDex: RegularFileProperty

  @get:Input abstract val d8Path: Property<String>

  @get:Input abstract val minSdkVersion: Property<String>

  @TaskAction
  fun execute() {
    val outputDir = outputDex.get().asFile.parentFile
    outputDir.mkdirs()

    // Run d8
    execOperations.exec {
      commandLine(
          d8Path.get(),
          "--output",
          outputDir.absolutePath,
          "--min-api",
          minSdkVersion.get(),
          inputJar.get().asFile.absolutePath,
      )
    }

    // d8 outputs classes.dex, rename to automobile-video.dex
    val classesFile = File(outputDir, "classes.dex")
    val targetFile = outputDex.get().asFile
    if (classesFile.exists() && classesFile != targetFile) {
      classesFile.renameTo(targetFile)
    }
  }
}

tasks.register<D8DexTask>("d8Dex") {
  group = "build"
  description = "Compile JAR to DEX using d8"

  dependsOn(tasks.jar)

  inputJar.set(tasks.jar.flatMap { it.archiveFile })
  outputDex.set(layout.buildDirectory.file("libs/automobile-video.dex"))
  d8Path.set("$androidSdkPath/build-tools/$buildToolsVersion/d8")
  minSdkVersion.set(minSdk)
}
