package dev.jasonpearson.automobile.ide.graph

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.IntSize
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

data class NodeLayout(
    val node: NavigationGraphSummaryNode,
    val center: Offset,
    val radius: Float,
    val ring: Int,
)

data class GraphLayout(
    val nodeLayouts: Map<String, NodeLayout>,
    val size: IntSize,
)

fun computeGraphLayout(
    summary: NavigationGraphSummary,
    size: IntSize,
    baseRadiusPx: Float,
    paddingPx: Float,
): GraphLayout {
  if (summary.nodes.isEmpty() || size.width <= 0 || size.height <= 0) {
    return GraphLayout(emptyMap(), size)
  }

  val adjacency = buildAdjacency(summary)
  val root =
      summary.currentScreen?.takeIf { adjacency.containsKey(it) }
          ?: summary.nodes.first().screenName
  val distances = computeDistances(adjacency, root)

  val maxDistance = distances.values.maxOrNull() ?: 0
  val unreachableDistance = maxDistance + 1
  summary.nodes.forEach { node -> distances.putIfAbsent(node.screenName, unreachableDistance) }

  val maxRing = distances.values.maxOrNull() ?: 0
  val center = Offset(size.width.toFloat() / 2f, size.height.toFloat() / 2f)
  val maxRadius = min(size.width, size.height).toFloat() / 2f - paddingPx - baseRadiusPx
  val safeMaxRadius = max(0f, maxRadius)
  val ringSpacing = if (maxRing <= 0) 0f else safeMaxRadius / (maxRing + 1)

  val (minVisit, maxVisit) = visitCountRange(summary.nodes)
  val extraRadius = baseRadiusPx * 0.6f

  val nodesByRing = summary.nodes.groupBy { distances[it.screenName] ?: 0 }
  val layouts = mutableMapOf<String, NodeLayout>()

  for ((ring, nodes) in nodesByRing) {
    val sorted = nodes.sortedBy { it.screenName }
    if (ring == 0) {
      val node = sorted.first()
      layouts[node.screenName] =
          NodeLayout(
              node = node,
              center = center,
              radius = nodeRadius(node.visitCount, minVisit, maxVisit, baseRadiusPx, extraRadius),
              ring = ring,
          )
      continue
    }

    val ringRadius = ringSpacing * ring
    val count = sorted.size
    val angleOffset = ring * 0.35

    sorted.forEachIndexed { index, node ->
      val angle = 2 * PI * index / count + angleOffset
      val x = center.x + ringRadius * cos(angle).toFloat()
      val y = center.y + ringRadius * sin(angle).toFloat()
      layouts[node.screenName] =
          NodeLayout(
              node = node,
              center = Offset(x, y),
              radius = nodeRadius(node.visitCount, minVisit, maxVisit, baseRadiusPx, extraRadius),
              ring = ring,
          )
    }
  }

  return GraphLayout(layouts, size)
}

private fun buildAdjacency(summary: NavigationGraphSummary): Map<String, MutableSet<String>> {
  val adjacency = summary.nodes.associate { it.screenName to mutableSetOf<String>() }
  summary.edges.forEach { edge ->
    adjacency[edge.from]?.add(edge.to)
    adjacency[edge.to]?.add(edge.from)
  }
  return adjacency
}

private fun computeDistances(
    adjacency: Map<String, MutableSet<String>>,
    root: String,
): MutableMap<String, Int> {
  val distances = mutableMapOf<String, Int>()
  val queue = ArrayDeque<String>()
  distances[root] = 0
  queue.add(root)

  while (queue.isNotEmpty()) {
    val current = queue.removeFirst()
    val currentDistance = distances[current] ?: 0
    val neighbors = adjacency[current] ?: emptySet()
    for (neighbor in neighbors) {
      if (neighbor !in distances) {
        distances[neighbor] = currentDistance + 1
        queue.add(neighbor)
      }
    }
  }

  return distances
}

private fun visitCountRange(nodes: List<NavigationGraphSummaryNode>): Pair<Int, Int> {
  val minVisit = nodes.minOfOrNull { it.visitCount } ?: 0
  val maxVisit = nodes.maxOfOrNull { it.visitCount } ?: 0
  return Pair(minVisit, maxVisit)
}

private fun nodeRadius(
    visitCount: Int,
    minVisit: Int,
    maxVisit: Int,
    baseRadius: Float,
    extraRadius: Float,
): Float {
  if (maxVisit <= minVisit) {
    return baseRadius
  }
  val normalized = (visitCount - minVisit).toFloat() / (maxVisit - minVisit).toFloat()
  return baseRadius + extraRadius * normalized
}
