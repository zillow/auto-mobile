package dev.jasonpearson.automobile.accessibilityservice

import android.graphics.PointF
import android.graphics.RectF
import dev.jasonpearson.automobile.accessibilityservice.models.SmoothingAlgorithm
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PathSmootherTest {

  private val smoother = PathSmoother()

  @Test
  fun `smoothPath returns empty path for insufficient points`() {
    val path = smoother.smoothPath(listOf(PointF(0f, 0f)), SmoothingAlgorithm.CATMULL_ROM)
    val bounds = RectF()
    path.computeBounds(bounds, true)
    assertEquals(0f, bounds.width(), 0.001f)
    assertEquals(0f, bounds.height(), 0.001f)
  }

  @Test
  fun `smoothPath keeps endpoints for catmull rom`() {
    val points = listOf(PointF(0f, 0f), PointF(50f, 100f), PointF(100f, 0f))
    val path = smoother.smoothPath(points, SmoothingAlgorithm.CATMULL_ROM, 0.6f)
    assertPathEndpoints(path, points.first(), points.last())
  }

  @Test
  fun `smoothPath keeps endpoints for bezier`() {
    val points = listOf(PointF(10f, 20f), PointF(60f, 80f), PointF(120f, 30f))
    val path = smoother.smoothPath(points, SmoothingAlgorithm.BEZIER, 0.8f)
    assertPathEndpoints(path, points.first(), points.last())
  }

  @Test
  fun `smoothPath keeps endpoints for douglas peucker`() {
    val points =
        listOf(
            PointF(0f, 0f),
            PointF(25f, 5f),
            PointF(50f, 10f),
            PointF(75f, 6f),
            PointF(100f, 0f),
        )
    val path = smoother.smoothPath(points, SmoothingAlgorithm.DOUGLAS_PEUCKER, 1f)
    assertPathEndpoints(path, points.first(), points.last())
  }

  @Test
  fun `smoothPath keeps endpoints for raw points`() {
    val points = listOf(PointF(5f, 5f), PointF(15f, 25f))
    val path = smoother.smoothPath(points, SmoothingAlgorithm.NONE)
    assertPathEndpoints(path, points.first(), points.last())
  }

  private fun assertPathEndpoints(path: android.graphics.Path, start: PointF, end: PointF) {
    val bounds = RectF()
    path.computeBounds(bounds, true)
    assertTrue("Expected non-empty bounds", bounds.width() > 0f || bounds.height() > 0f)

    assertPointWithinBounds(bounds, start)
    assertPointWithinBounds(bounds, end)
  }

  private fun assertPointWithinBounds(bounds: RectF, point: PointF) {
    val tolerance = 0.5f
    assertTrue(point.x >= bounds.left - tolerance)
    assertTrue(point.x <= bounds.right + tolerance)
    assertTrue(point.y >= bounds.top - tolerance)
    assertTrue(point.y <= bounds.bottom + tolerance)
  }
}
