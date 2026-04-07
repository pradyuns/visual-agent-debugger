// Types
export type {
  TraceFramework,
  TraceStatus,
  SpanStatus,
  SpanKind,
  SpanProvenance,
  EdgeKind,
  LlmRequest,
  LlmResponse,
  TokenUsage,
  ToolInfo,
  SpanPayload,
  SpanError,
  SpanRecord,
  EdgeRecord,
  TraceRecord,
  TraceBundle,
  TraceAdapter,
  TraceListFilters,
  TraceSummary,
  TraceBundleWithDerived,
  TraceStore,
} from "./types/index.js";

// Validation
export {
  ValidationError,
  validateBundle,
  detectCycles,
  validateEdgeRefs,
  TraceBundleSchema,
  TraceRecordSchema,
  SpanRecordSchema,
} from "./validation/index.js";

// Adapters
export {
  rawAdapter,
  agentsSdkAdapter,
  detectAndNormalize,
  UnsupportedFormatError,
  deriveLatencies,
  deriveTotals,
  ensureSingleRoot,
  createSyntheticRoot,
} from "./adapters/index.js";

// Storage
export { SqliteTraceStore } from "./storage/store.js";
export { openDatabase } from "./storage/db.js";
