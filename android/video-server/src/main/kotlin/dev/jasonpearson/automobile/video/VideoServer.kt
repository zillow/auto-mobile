package dev.jasonpearson.automobile.video

import android.media.MediaCodec
import dev.jasonpearson.automobile.video.wrappers.DisplayControl

/**
 * Main entry point for the video streaming server.
 *
 * This server captures the device screen using VirtualDisplay, encodes it as H.264 using
 * MediaCodec, and streams the encoded video over a LocalSocket.
 *
 * ## Usage
 *
 * ```bash
 * # Push DEX to device
 * adb push android/video-server/build/libs/automobile-video.dex /data/local/tmp/
 *
 * # Run server
 * adb shell CLASSPATH=/data/local/tmp/automobile-video.dex \
 *     app_process / dev.jasonpearson.automobile.video.VideoServer --quality medium
 * ```
 *
 * ## Quality presets
 * - `low`: 540p @ 2 Mbps @ 30fps
 * - `medium`: 720p @ 4 Mbps @ 60fps (default)
 * - `high`: 1080p @ 8 Mbps @ 60fps
 */
object VideoServer {
  private const val SOCKET_NAME = "automobile_video"

  @Volatile private var running = true

  private var encoder: VideoEncoder? = null
  private var capture: ScreenCapture? = null
  private var streamWriter: VideoStreamWriter? = null

  @JvmStatic
  fun main(args: Array<String>) {
    // Parse arguments
    val quality = parseQuality(args)

    println("AutoMobile Video Server")
    println("Quality preset: ${quality.name}")

    // Get display info
    val displayInfo = DisplayControl.getDisplayInfo()
    println("Display: ${displayInfo.width}x${displayInfo.height} @ ${displayInfo.densityDpi}dpi")

    // Calculate output dimensions based on quality preset
    val (outputWidth, outputHeight) = calculateOutputDimensions(displayInfo, quality)
    println(
        "Output: ${outputWidth}x${outputHeight} @ ${quality.bitrate / 1_000_000}Mbps @ ${quality.fps}fps"
    )

    // Install shutdown hook for clean termination
    Runtime.getRuntime()
        .addShutdownHook(
            Thread {
              println("\nShutting down...")
              running = false
              shutdown()
            }
        )

    try {
      run(outputWidth, outputHeight, displayInfo.densityDpi, quality)
    } catch (e: Exception) {
      System.err.println("Error: ${e.message}")
      e.printStackTrace()
      shutdown()
    }
  }

  private fun parseQuality(args: Array<String>): QualityPreset {
    var i = 0
    while (i < args.size) {
      when (args[i]) {
        "--quality",
        "-q" -> {
          if (i + 1 < args.size) {
            return try {
              QualityPreset.fromString(args[i + 1])
            } catch (e: IllegalArgumentException) {
              System.err.println("Invalid quality preset: ${args[i + 1]}")
              System.err.println("Valid values: low, medium, high")
              QualityPreset.MEDIUM
            }
          }
        }
        "--help",
        "-h" -> {
          printUsage()
          System.exit(0)
        }
      }
      i++
    }
    return QualityPreset.MEDIUM
  }

  private fun printUsage() {
    println(
        """
        Usage: VideoServer [options]

        Options:
          --quality, -q <preset>  Quality preset: low, medium, high (default: medium)
          --help, -h              Show this help message

        Quality presets:
          low     540p @ 2 Mbps @ 30fps
          medium  720p @ 4 Mbps @ 60fps
          high    1080p @ 8 Mbps @ 60fps
        """
            .trimIndent()
    )
  }

  private fun calculateOutputDimensions(
      displayInfo: DisplayControl.DisplayInfo,
      quality: QualityPreset,
  ): Pair<Int, Int> {
    val displayWidth = displayInfo.width
    val displayHeight = displayInfo.height

    // Portrait: height is the larger dimension
    // Landscape: width is the larger dimension
    val isPortrait = displayHeight > displayWidth

    if (isPortrait) {
      // Scale based on height
      if (displayHeight <= quality.maxHeight) {
        return displayWidth to displayHeight
      }
      val scale = quality.maxHeight.toFloat() / displayHeight.toFloat()
      val scaledWidth = (displayWidth * scale).toInt() and 0xFFFE // Round to even
      return scaledWidth to quality.maxHeight
    } else {
      // Scale based on width (landscape)
      if (displayWidth <= quality.maxHeight) {
        return displayWidth to displayHeight
      }
      val scale = quality.maxHeight.toFloat() / displayWidth.toFloat()
      val scaledHeight = (displayHeight * scale).toInt() and 0xFFFE // Round to even
      return quality.maxHeight to scaledHeight
    }
  }

  private fun run(width: Int, height: Int, densityDpi: Int, quality: QualityPreset) {
    // Create encoder
    encoder =
        VideoEncoder(
            width = width,
            height = height,
            bitrate = quality.bitrate,
            fps = quality.fps,
        )
    val surface = encoder!!.start()

    // Create screen capture
    capture = ScreenCapture(width, height, densityDpi)
    capture!!.start(surface)

    // Create stream writer
    streamWriter = VideoStreamWriter(SOCKET_NAME, width, height)
    streamWriter!!.start()

    println("Streaming started")

    // Encoding loop
    val bufferInfo = MediaCodec.BufferInfo()
    while (running) {
      val index = encoder!!.dequeueOutputBuffer(bufferInfo, 100_000) // 100ms timeout
      if (index >= 0) {
        val buffer = encoder!!.getOutputBuffer(index)
        if (buffer != null) {
          val success = streamWriter!!.writePacket(buffer, bufferInfo)
          if (!success) {
            println("Client disconnected")
            break
          }
        }
        encoder!!.releaseOutputBuffer(index)

        // Check for end of stream
        if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
          println("End of stream")
          break
        }
      }
    }

    shutdown()
  }

  private fun shutdown() {
    streamWriter?.stop()
    capture?.stop()
    encoder?.stop()

    streamWriter = null
    capture = null
    encoder = null

    println("Shutdown complete")
  }
}
