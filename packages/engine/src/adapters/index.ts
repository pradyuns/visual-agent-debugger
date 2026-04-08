import type { TraceAdapter } from "../types";
import { AgentsSdkTraceAdapter } from "./agents-sdk";
import { RawTraceAdapter } from "./raw";

export const defaultAdapters: TraceAdapter[] = [
  new RawTraceAdapter(),
  new AgentsSdkTraceAdapter(),
];
