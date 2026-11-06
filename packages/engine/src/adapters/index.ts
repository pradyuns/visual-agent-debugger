import type { TraceAdapter } from "../types";
import { AgentsSdkTraceAdapter } from "./agents-sdk";
import { NativeAgentsSdkTraceAdapter } from "./agents-sdk-native";
import { RawTraceAdapter } from "./raw";

export const defaultAdapters: TraceAdapter[] = [
  new RawTraceAdapter(),
  new AgentsSdkTraceAdapter(),
  new NativeAgentsSdkTraceAdapter(),
];
