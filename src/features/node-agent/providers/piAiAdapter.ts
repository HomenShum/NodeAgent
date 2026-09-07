import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  ModelsSimpleStreamOptions,
  Tool,
  TSchema,
} from "@earendil-works/pi-ai";

import type {
  AgentModelAdapter,
  AgentModelMessage,
  AgentModelRequest,
  AgentModelStep,
  AgentModelUsage,
} from "../protocol/model";

export interface PiModelsPort {
  getModel(provider: string, id: string): Model<Api> | undefined;
  completeSimple(
    model: Model<Api>,
    context: Context,
    options?: ModelsSimpleStreamOptions,
  ): Promise<AssistantMessage>;
  streamSimple?(
    model: Model<Api>,
    context: Context,
    options?: ModelsSimpleStreamOptions,
  ): AssistantMessageEventStream;
}

export interface PiAiAdapterOptions {
  provider: string;
  model: string;
  models?: PiModelsPort;
  loadModels?: () => Promise<PiModelsPort>;
  defaults?: Omit<ModelsSimpleStreamOptions, "signal">;
}

export class PiAiAdapterError extends Error {
  readonly stopReason?: "error" | "aborted";
  readonly usage?: AgentModelUsage;

  constructor(
    readonly code: "missing_package" | "model_not_found" | "provider_error" | "aborted" | "callback_error",
    message: string,
    options?: ErrorOptions & { stopReason?: "error" | "aborted"; usage?: AgentModelUsage },
  ) {
    super(message, options);
    this.name = "PiAiAdapterError";
    this.stopReason = options?.stopReason;
    this.usage = options?.usage;
  }
}

/**
 * Real @earendil-works/pi-ai provider adapter.
 *
 * Pi owns provider/model invocation, auth resolution, streaming semantics, and
 * measured token usage and model-rate cost estimates. NodeAgent owns orchestration, tool
 * execution, policy, durability, and receipts.
 */
export function createPiAiAdapter(options: PiAiAdapterOptions): AgentModelAdapter {
  let modelsPromise: Promise<PiModelsPort> | undefined;

  const getModels = async (): Promise<PiModelsPort> => {
    if (options.models) return options.models;
    if (!modelsPromise) modelsPromise = (options.loadModels ?? loadBuiltinPiModels)();
    return modelsPromise;
  };

  return {
    name: "pi-ai",
    async next(input: AgentModelRequest): Promise<AgentModelStep> {
      const route = input.route ?? { provider: options.provider, model: options.model };
      const models = await getModels();
      const model = models.getModel(route.provider, route.model);
      if (!model) {
        throw new PiAiAdapterError(
          "model_not_found",
          `Pi AI model is unavailable: ${route.provider}/${route.model}`,
        );
      }

      const context: Context = {
        systemPrompt: input.system,
        messages: input.messages.map((message) => toPiMessage(message, model)),
        tools: input.tools?.map((tool): Tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.inputJsonSchema as TSchema,
        })),
      };

      try {
        const requestOptions: ModelsSimpleStreamOptions = {
          ...options.defaults,
          signal: input.signal,
          temperature: input.temperature ?? options.defaults?.temperature,
          maxTokens: input.maxTokens ?? options.defaults?.maxTokens,
          timeoutMs: input.timeoutMs ?? options.defaults?.timeoutMs,
          maxRetries: input.maxRetries ?? options.defaults?.maxRetries,
          reasoning: input.reasoning ?? options.defaults?.reasoning,
          metadata: { ...options.defaults?.metadata, ...input.metadata },
        };
        const response = input.onTextDelta && models.streamSimple
          ? await streamPiResponse(models, model, context, requestOptions, input.onTextDelta)
          : await models.completeSimple(model, context, requestOptions);

        const usage: AgentModelUsage = {
          inputTokens: response.usage.input,
          outputTokens: response.usage.output,
          cachedInputTokens: response.usage.cacheRead,
          cacheCreationInputTokens: response.usage.cacheWrite,
          reasoningTokens: response.usage.reasoning,
          modelCalls: 1,
          costUsd: response.usage.cost.total,
          costKind: "estimated",
        };
        // Pi result() fulfills error events as messages; fulfillment is not success.
        if (response.stopReason === "error" || response.stopReason === "aborted") {
          throw new PiAiAdapterError(
            response.stopReason === "aborted" ? "aborted" : "provider_error",
            response.errorMessage || `Pi AI returned ${response.stopReason}.`,
            { stopReason: response.stopReason, usage },
          );
        }

        const text = response.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
        if (text && input.onTextDelta && !models.streamSimple) {
          await deliverText(input.onTextDelta, text);
        }

        const toolCalls = response.content
          .filter((part) => part.type === "toolCall")
          .map((part) => ({
            id: part.id,
            tool: part.name,
            args: part.arguments,
            providerMetadata: part.thoughtSignature
              ? { thoughtSignature: part.thoughtSignature }
              : undefined,
          }));

        return {
          text: text || undefined,
          toolCalls,
          done: response.stopReason === "stop" && toolCalls.length === 0,
          stopReason: response.stopReason,
          usage,
          route: {
            adapter: "pi-ai",
            provider: response.provider,
            requestedModel: route.model,
            responseModel: response.responseModel ?? response.model,
          },
        };
      } catch (error) {
        if (error instanceof PiAiAdapterError) throw error;
        throw new PiAiAdapterError(
          "provider_error",
          `Pi AI provider call failed for ${route.provider}/${route.model}.`,
          { cause: error },
        );
      }
    },
  };
}

async function streamPiResponse(
  models: PiModelsPort,
  model: Model<Api>,
  context: Context,
  options: ModelsSimpleStreamOptions,
  onTextDelta: NonNullable<AgentModelRequest["onTextDelta"]>,
): Promise<AssistantMessage> {
  if (!models.streamSimple) return models.completeSimple(model, context, options);
  const cancellation = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, cancellation.signal])
    : cancellation.signal;
  const stream = models.streamSimple(model, context, { ...options, signal });
  try {
    for await (const event of stream) {
      if (event.type === "text_delta") await deliverText(onTextDelta, event.delta);
    }
    return await stream.result();
  } catch (error) {
    // A failed callback must also stop this call's producer and late event queue.
    cancellation.abort(error);
    stream.end();
    throw error;
  }
}

async function deliverText(
  callback: NonNullable<AgentModelRequest["onTextDelta"]>,
  text: string,
): Promise<void> {
  try {
    await callback(text);
  } catch (cause) {
    throw new PiAiAdapterError("callback_error", "The text consumer rejected a Pi AI response.", { cause });
  }
}

async function loadBuiltinPiModels(): Promise<PiModelsPort> {
  try {
    const { builtinModels } = await import("@earendil-works/pi-ai/providers/all");
    return builtinModels();
  } catch (error) {
    throw new PiAiAdapterError(
      "missing_package",
      "Install optional peer dependency @earendil-works/pi-ai to use the Pi AI adapter.",
      { cause: error },
    );
  }
}

function toPiMessage(message: AgentModelMessage, model: Model<Api>): Context["messages"][number] {
  const timestamp = message.timestamp ?? Date.now();
  if (message.role === "user") {
    return { role: "user", content: message.content, timestamp };
  }
  if (message.role === "tool") {
    if (!message.toolCallId || !message.toolName) {
      throw new PiAiAdapterError(
        "provider_error",
        "Tool-result messages require toolCallId and toolName.",
      );
    }
    return {
      role: "toolResult",
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      content: [{ type: "text", text: message.content }],
      isError: message.isError ?? false,
      timestamp,
    };
  }

  const toolCalls = (message.toolCalls ?? []).map((call) => ({
    type: "toolCall" as const,
    id: call.id,
    name: call.tool,
    arguments: call.args,
    thoughtSignature:
      typeof call.providerMetadata?.thoughtSignature === "string"
        ? call.providerMetadata.thoughtSignature
        : undefined,
  }));
  return {
    role: "assistant",
    content: [
      ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
      ...toolCalls,
    ],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: emptyUsage(),
    stopReason: toolCalls.length > 0 ? "toolUse" : "stop",
    timestamp,
  };
}

function emptyUsage(): AssistantMessage["usage"] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}
