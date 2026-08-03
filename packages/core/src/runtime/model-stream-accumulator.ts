import type { Metadata } from "../types/json";
import type { ModelResponse, ModelStreamChunk, ToolCall } from "../types/model";

export interface ModelStreamDelta {
  delta: string;
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: unknown;
  metadata?: Metadata;
}

/**
 * Consumes a provider's raw ModelStreamChunk iterable, yielding each text
 * delta as it arrives, and returns the fully accumulated ModelResponse once
 * the stream ends. toolCallDelta fragments are merged by id (string
 * `arguments` fragments are concatenated; any other value replaces).
 */
export async function* accumulateModelStream(
  chunks: AsyncIterable<ModelStreamChunk>,
): AsyncGenerator<ModelStreamDelta, ModelResponse, void> {
  let id = "";
  let content = "";
  let usage: ModelResponse["usage"];
  let raw: unknown;
  const toolCallOrder: string[] = [];
  const toolCallsById = new Map<string, ToolCallAccumulator>();
  let lastToolCallId: string | undefined;

  for await (const chunk of chunks) {
    if (chunk.id) {
      id = chunk.id;
    }

    if (chunk.delta) {
      content += chunk.delta;
      yield { delta: chunk.delta };
    }

    if (chunk.toolCallDelta) {
      mergeToolCallDelta(chunk.toolCallDelta, toolCallsById, toolCallOrder, lastToolCallId);
      lastToolCallId = chunk.toolCallDelta.id ?? lastToolCallId;
    }

    if (chunk.usage) {
      usage = chunk.usage;
    }

    if (chunk.raw !== undefined) {
      raw = chunk.raw;
    }
  }

  const toolCalls: ToolCall[] = [];
  for (const callId of toolCallOrder) {
    const accumulated = toolCallsById.get(callId);
    if (!accumulated) {
      continue;
    }

    toolCalls.push({
      id: accumulated.id,
      name: accumulated.name,
      arguments: accumulated.arguments ?? {},
      ...(accumulated.metadata ? { metadata: accumulated.metadata } : {}),
    });
  }

  return {
    id,
    content,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(usage ? { usage } : {}),
    ...(raw !== undefined ? { raw } : {}),
  };
}

function mergeToolCallDelta(
  delta: Partial<ToolCall>,
  byId: Map<string, ToolCallAccumulator>,
  order: string[],
  lastToolCallId: string | undefined,
): void {
  const id = delta.id ?? lastToolCallId;
  if (!id) {
    return;
  }

  let accumulated = byId.get(id);
  if (!accumulated) {
    accumulated = { id, name: "", arguments: undefined };
    byId.set(id, accumulated);
    order.push(id);
  }

  if (delta.name !== undefined) {
    accumulated.name = delta.name;
  }

  if (delta.arguments !== undefined) {
    accumulated.arguments =
      typeof delta.arguments === "string" && typeof accumulated.arguments === "string"
        ? accumulated.arguments + delta.arguments
        : delta.arguments;
  }

  if (delta.metadata) {
    accumulated.metadata = { ...accumulated.metadata, ...delta.metadata };
  }
}
