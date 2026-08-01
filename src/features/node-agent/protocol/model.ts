/** Provider-neutral model seam used by the deep NodeAgent runtime. */

export interface AgentModelToolCall {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
}

export interface AgentModelMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp?: number;
  toolCalls?: AgentModelToolCall[];
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

export interface AgentModelTool {
  name: string;
  description: string;
  /** Canonical JSON Schema. Runtime adapters compile this into provider forms. */
  inputJsonSchema: Record<string, unknown>;
}

export interface AgentModelUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
  reasoningTokens?: number;
  modelCalls: number;
  costUsd?: number;
  costKind?: "exact" | "estimated";
}

export interface AgentModelStep {
  text?: string;
  toolCalls: AgentModelToolCall[];
  done: boolean;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  usage: AgentModelUsage;
  route: {
    adapter: string;
    provider: string;
    requestedModel: string;
    responseModel?: string;
  };
}

export interface AgentModelRequest {
  system: string;
  messages: AgentModelMessage[];
  tools?: AgentModelTool[];
  signal?: AbortSignal;
  onTextDelta?: (text: string) => void | Promise<void>;
  route?: { provider: string; model: string };
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  reasoning?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  metadata?: Record<string, unknown>;
}

export interface AgentModelAdapter {
  readonly name: string;
  next(input: AgentModelRequest): Promise<AgentModelStep>;
}
