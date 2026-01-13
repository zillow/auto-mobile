package dev.jasonpearson.automobile.accessibilityservice

import android.graphics.Path
import android.graphics.PointF
import dev.jasonpearson.automobile.accessibilityservice.models.SmoothingAlgorithm
import kotlin.math.abs
import kotlin.math.hypot

class PathSmoother {

  fun smoothPath(
      points: List<PointF>,
      algorithm: SmoothingAlgorithm,
      tension: Float = DEFAULT_TENSION,
  ): Path {
    val filteredPoints = filterClosePoints(points)
    if (filteredPoints.size < 2) {
      return Path()
    }

    return when (algorithm) {
      SmoothingAlgorithm.NONE -> buildLinearPath(filteredPoints)
      SmoothingAlgorithm.CATMULL_ROM -> buildCatmullRomPath(filteredPoints, tension)
      SmoothingAlgorithm.BEZIER -> buildBezierPath(filteredPoints, tension)
      SmoothingAlgorithm.DOUGLAS_PEUCKER -> buildDouglasPeuckerPath(filteredPoints, tension)
    }
  }

  private fun buildLinearPath(points: List<PointF>): Path {
    val path = Path()
    path.moveTo(points.first().x, points.first().y)
    for (i in 1 until points.size) {
      val point = points[i]
      path.lineTo(point.x, point.y)
    }
    return path
  }

  private fun buildCatmullRomPath(points: List<PointF>, tension: Float): Path {
    val path = Path()
    val t = tension.coerceIn(0f, 1f)
    path.moveTo(points.first().x, points.first().y)

    for (i in 0 until points.size - 1) {
      val p0 = if (i > 0) points[i - 1] else points[i]
      val p1 = points[i]
      val p2 = points[i + 1]
      val p3 = if (i + 2 < points.size) points[i + 2] else p2

      val cp1x = p1.x + (p2.x - p0.x) * t / 6f
      val cp1y = p1.y + (p2.y - p0.y) * t / 6f
      val cp2x = p2.x - (p3.x - p1.x) * t / 6f
      val cp2y = p2.y - (p3.y - p1.y) * t / 6f

      path.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
    }

    return path
  }

  private fun buildBezierPath(points: List<PointF>, tension: Float): Path {
    val path = Path()
    val t = tension.coerceIn(0f, 1f)
    path.moveTo(points.first().x, points.first().y)

    if (points.size == 2) {
      path.lineTo(points.last().x, points.last().y)
      return path
    }

    for (i in 1 until points.size - 1) {
      val current = points[i]
      val next = points[i + 1]
      val midX = (current.x + next.x) / 2f
      val midY = (current.y + next.y) / 2f
      val endX = current.x + (midX - current.x) * t
      val endY = current.y + (midY - current.y) * t
      path.quadTo(current.x, current.y, endX, endY)
    }

    val last = points.last()
    path.lineTo(last.x, last.y)
    return path
  }

  private fun buildDouglasPeuckerPath(points: List<PointF>, tension: Float): Path {
    val t = tension.coerceIn(0f, 1f)
    if (t <= 0f) {
      return buildLinearPath(points)
    }

    val epsilon = DEFAULT_SIMPLIFY_EPSILON * t
    val simplifiedPoints = if (epsilon <= 0f) points else simplifyDouglasPeucker(points, epsilon)
    return buildLinearPath(simplifiedPoints)
  }

  private fun filterClosePoints(points: List<PointF>): List<PointF> {
    if (points.size <= 2) {
      return points
    }

    val filtered = ArrayList<PointF>(points.size)
    var lastKept = points.first()
    filtered.add(lastKept)

    for (i in 1 until points.size - 1) {
      val point = points[i]
      if (distanceSquared(point, lastKept) >= MIN_POINT_DISTANCE_SQ) {
        filtered.add(point)
        lastKept = point
      }
    }

    val last = points.last()
    if (distanceSquared(last, lastKept) >= MIN_POINT_DISTANCE_SQ || filtered.size == 1) {
      filtered.add(last)
    } else {
      filtered[filtered.size - 1] = last
    }

    return filtered
  }

  private fun simplifyDouglasPeucker(points: List<PointF>, epsilon: Float): List<PointF> {
    if (points.size < 3) {
      return points
    }

    val start = points.first()
    val end = points.last()
    var maxDistance = 0f
    var index = 0

    for (i in 1 until points.size - 1) {
      val distance = perpendicularDistance(points[i], start, end)
      if (distance > maxDistance) {
        maxDistance = distance
        index = i
      }
    }

    return if (maxDistance > epsilon) {
      val left = simplifyDouglasPeucker(points.subList(0, index + 1), epsilon)
      val right = simplifyDouglasPeucker(points.subList(index, points.size), epsilon)
      left.dropLast(1) + right
    } else {
      listOf(start, end)
    }
  }

  private fun perpendicularDistance(point: PointF, start: PointF, end: PointF): Float {
    val dx = end.x - start.x
    val dy = end.y - start.y
    if (dx == 0f && dy == 0f) {
      return hypot(point.x - start.x, point.y - start.y)
    }

    val numerator = abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x)
    val denominator = hypot(dx, dy)
    return numerator / denominator
  }

  private fun distanceSquared(a: PointF, b: PointF): Float {
    val dx = a.x - b.x
    val dy = a.y - b.y
    return dx * dx + dy * dy
  }

  companion object {
    private const val DEFAULT_TENSION = 0.5f
    private const val DEFAULT_SIMPLIFY_EPSILON = 6f
    private const val MIN_POINT_DISTANCE = 0.5f
    private const val MIN_POINT_DISTANCE_SQ = MIN_POINT_DISTANCE * MIN_POINT_DISTANCE
  }
}
