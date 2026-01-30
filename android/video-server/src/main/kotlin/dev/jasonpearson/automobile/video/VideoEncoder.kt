package dev.jasonpearson.automobile.video

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.os.Build
import android.view.Surface

/**
 * MediaCodec wrapper for H.264 encoding with Surface input.
 *
 * Configures the encoder for low-latency streaming with:
 * - H.264 Baseline profile for maximum compatibility
 * - Surface input for zero-copy GPU rendering
 * - CBR bitrate mode for consistent bandwidth
 * - Frame repeat for idle screen optimization
 */
class VideoEncoder(
    private val width: Int,
    private val height: Int,
    private val bitrate: Int,
    private val fps: Int,
) {
  private var codec: MediaCodec? = null

  /** Input surface for the VirtualDisplay to render to. Available after [start]. */
  var inputSurface: Surface? = null
    private set

  /**
   * Configure and start the encoder.
   *
   * @return The input Surface for the VirtualDisplay
   */
  fun start(): Surface {
    val format =
        MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
          // Bitrate
          setInteger(MediaFormat.KEY_BIT_RATE, bitrate)

          // Frame rate hint (actual rate is variable based on display updates)
          setInteger(MediaFormat.KEY_FRAME_RATE, fps)

          // I-frame interval: 10 seconds
          setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 10)

          // Surface input (zero-copy from GPU)
          setInteger(
              MediaFormat.KEY_COLOR_FORMAT,
              MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface,
          )

          // Repeat frame after 100ms of no changes (reduces idle bandwidth)
          setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000)

          // H.264 Baseline profile for maximum compatibility
          // Note: We don't set KEY_LEVEL - let the codec choose the appropriate level
          // based on resolution/fps. Level 3.1 can't handle 720p@60fps or 1080p@60fps.
          setInteger(
              MediaFormat.KEY_PROFILE,
              MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline,
          )

          // CBR for consistent bitrate
          setInteger(
              MediaFormat.KEY_BITRATE_MODE,
              MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR,
          )

          // Request low latency mode on Android 11+ (API 30)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
          }
        }

    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)

    val surface = encoder.createInputSurface()
    inputSurface = surface

    encoder.start()
    codec = encoder

    return surface
  }

  /**
   * Dequeue an output buffer from the encoder.
   *
   * @param bufferInfo Buffer info to be populated
   * @param timeoutUs Timeout in microseconds (-1 for infinite)
   * @return Buffer index, or negative value on error/timeout
   */
  fun dequeueOutputBuffer(bufferInfo: MediaCodec.BufferInfo, timeoutUs: Long): Int {
    return codec?.dequeueOutputBuffer(bufferInfo, timeoutUs) ?: -1
  }

  /** Get the output buffer at the given index. */
  fun getOutputBuffer(index: Int): java.nio.ByteBuffer? {
    return codec?.getOutputBuffer(index)
  }

  /** Release the output buffer at the given index. */
  fun releaseOutputBuffer(index: Int) {
    codec?.releaseOutputBuffer(index, false)
  }

  /** Stop and release the encoder. */
  fun stop() {
    codec?.let { encoder ->
      try {
        encoder.stop()
      } catch (_: IllegalStateException) {
        // Already stopped
      }
      encoder.release()
    }
    codec = null
    inputSurface = null
  }
}
