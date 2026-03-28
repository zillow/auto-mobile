import type { NetworkEventWithId } from "../db/networkEventRepository";

export interface GraphLeaf {
  method?: string;
  type?: string;
  success: number;
  errors: number;
  p50: number;
  p95: number;
}

export interface GraphBranch {
  parameterized?: boolean;
  paths: Record<string, GraphNode>;
}

export type GraphNode = GraphLeaf | GraphBranch | (GraphLeaf & GraphBranch);

export interface GraphHost {
  scheme: string;
  host: string;
  paths: Record<string, GraphNode>;
}

export interface NetworkGraph {
  graph: GraphHost[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_PATTERN = /^[0-9a-f]{8,}$/i;

function isParameterizedSegment(segment: string): boolean {
  if (/^\d+$/.test(segment)) {
    return true;
  }
  if (UUID_PATTERN.test(segment)) {
    return true;
  }
  if (HEX_PATTERN.test(segment)) {
    return true;
  }
  return false;
}

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

interface EventGroup {
  method: string;
  contentType: string | null;
  durations: number[];
  success: number;
  errors: number;
}

export function buildNetworkGraph(
  events: NetworkEventWithId[],
  options: { minRequests?: number } = {}
): NetworkGraph {
  const minRequests = options.minRequests ?? 1;

  // Group events by scheme+host+path+method
  const hostMap = new Map<
    string,
    { scheme: string; host: string; pathGroups: Map<string, EventGroup[]> }
  >();

  for (const event of events) {
    let scheme = "https";
    let host = event.host ?? "unknown";

    if (event.url) {
      try {
        const parsed = new URL(event.url);
        scheme = parsed.protocol.replace(":", "");
        host = parsed.hostname;
      } catch {
        // use fallback host
      }
    }

    const hostKey = `${scheme}://${host}`;
    if (!hostMap.has(hostKey)) {
      hostMap.set(hostKey, { scheme, host, pathGroups: new Map() });
    }
    const entry = hostMap.get(hostKey)!;

    const path = event.path ?? "/";
    const groupKey = `${path}::${event.method}`;

    if (!entry.pathGroups.has(groupKey)) {
      entry.pathGroups.set(groupKey, []);
    }

    const groups = entry.pathGroups.get(groupKey)!;
    let group = groups.find(g => g.method === event.method);
    if (!group) {
      group = {
        method: event.method,
        contentType: event.contentType,
        durations: [],
        success: 0,
        errors: 0,
      };
      groups.push(group);
    }

    group.durations.push(event.durationMs);
    if (event.statusCode >= 400) {
      group.errors++;
    } else {
      group.success++;
    }
  }

  const result: GraphHost[] = [];

  for (const [, { scheme, host, pathGroups }] of hostMap) {
    const root: Record<string, GraphNode> = {};

    for (const [groupKey, groups] of pathGroups) {
      const [path] = groupKey.split("::");
      const segments = path.split("/").filter(s => s.length > 0);

      for (const group of groups) {
        const totalRequests = group.success + group.errors;
        if (totalRequests < minRequests) {
          continue;
        }

        const sorted = [...group.durations].sort((a, b) => a - b);
        const leaf: GraphLeaf & { _durations?: number[] } = {
          method: group.method,
          type: group.contentType ?? undefined,
          success: group.success,
          errors: group.errors,
          p50: Math.round(computePercentile(sorted, 50)),
          p95: Math.round(computePercentile(sorted, 95)),
          _durations: group.durations,
        };

        insertIntoTree(root, segments, 0, leaf);
      }
    }

    if (Object.keys(root).length > 0) {
      stripDurations(root);
      result.push({ scheme, host, paths: root });
    }
  }

  return { graph: result };
}

function mergeLeafStats(
  target: GraphLeaf & { _durations?: number[] },
  source: GraphLeaf & { _durations?: number[] }
): void {
  target.success = (target.success ?? 0) + source.success;
  target.errors = (target.errors ?? 0) + source.errors;
  const combined = [...(target._durations ?? []), ...(source._durations ?? [])];
  target._durations = combined;
  const sorted = [...combined].sort((a, b) => a - b);
  target.p50 = Math.round(computePercentile(sorted, 50));
  target.p95 = Math.round(computePercentile(sorted, 95));
}

function stripDurations(node: Record<string, GraphNode>): void {
  for (const key of Object.keys(node)) {
    const val = node[key] as any;
    if (val._durations) {
      delete val._durations;
    }
    if (val.paths) {
      stripDurations(val.paths);
    }
  }
}

function insertIntoTree(
  node: Record<string, GraphNode>,
  segments: string[],
  index: number,
  leaf: GraphLeaf
): void {
  if (index >= segments.length) {
    // Root path "/" case — put stats directly
    const existing = node[""] as (GraphLeaf & { _durations?: number[] }) | undefined;
    if (existing && "success" in existing) {
      mergeLeafStats(existing, leaf);
    } else {
      node[""] = leaf;
    }
    return;
  }

  const segment = segments[index];
  const isParam = isParameterizedSegment(segment);
  const key = isParam ? "{id}" : segment;

  if (index === segments.length - 1) {
    // Leaf position — key includes method to separate GET/POST/etc on the same path
    const leafKey = leaf.method ? `${key}[${leaf.method}]` : key;
    const existing = node[leafKey];
    if (existing && "success" in existing) {
      // Merge stats with percentile recomputation (parameterized path collapse)
      mergeLeafStats(existing as GraphLeaf & { _durations?: number[] }, leaf);
    } else if (existing && "paths" in existing) {
      // Existing branch — add stats to branch node
      mergeLeafStats(existing as any, leaf);
      (existing as any).method = leaf.method;
      (existing as any).type = leaf.type;
    } else {
      node[leafKey] = leaf;
      if (isParam) {
        (node[leafKey] as any).parameterized = true;
      }
    }
  } else {
    // Branch position
    if (!node[key]) {
      node[key] = { paths: {} } as GraphBranch;
      if (isParam) {
        (node[key] as GraphBranch).parameterized = true;
      }
    }
    const branch = node[key] as GraphBranch;
    if (!branch.paths) {
      (branch as any).paths = {};
    }
    insertIntoTree(branch.paths, segments, index + 1, leaf);
  }
}
