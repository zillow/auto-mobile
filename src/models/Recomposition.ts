export type RecompositionCause =
  | "unstable_lambda"
  | "unstable_parameter"
  | "state_read"
  | "parent_recomp"
  | "collection_change"
  | "unknown";

export interface RecompositionMetrics {
  sinceLastObservation: number;
  sinceLastInteraction: number;
  rolling1sAverage: number;
  total: number;
  skipCount: number;
  durationMs?: number;
}

export interface RecompositionNodeInfo {
  id: string;
  composableName?: string;
  resourceId?: string | null;
  testTag?: string | null;
  total?: number;
  skipCount?: number;
  rolling1sAverage?: number;
  durationMs?: number;
  likelyCause?: RecompositionCause;
  parentChain?: string[];
  stableAnnotated?: boolean;
  rememberedCount?: number;
}

export interface TopRecompositionEntry {
  rank: number;
  composableName?: string;
  resourceId?: string | null;
  recompositionId?: string;
  recompCount: number;
  recompPerSecond: number;
  recompDurationMs?: number;
  likelyCause: RecompositionCause;
  parentChain?: string[];
}

export interface RecompositionSummary {
  totalRecompositions: number;
  averagePerSecond: number;
  averageRecompositionDurationMs?: number;
  topRecompositions: TopRecompositionEntry[];
}
