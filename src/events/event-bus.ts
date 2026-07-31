import EventEmitter from "eventemitter3";
import type { SerializedError } from "../utils/errors";
import type { Metadata } from "../types/json";
import type { ModelRequest, ModelResponse, ToolCall } from "../types/model";
import type { RunTrace } from "../tracing/run-trace";
import type { ToolExecutionResult } from "../tools/tool";

export interface RunStartedEvent {
  runId: string;
  agentName: string;
  startedAt: string;
  metadata: Metadata;
}

export interface RunCompletedEvent {
  runId: string;
  output: string;
  trace: RunTrace;
}

export interface RunFailedEvent {
  runId: string;
  error: SerializedError;
  trace: RunTrace;
}

export interface ToolStartedEvent {
  runId: string;
  toolCall: ToolCall;
  attempt: number;
}

export interface ToolFinishedEvent {
  runId: string;
  toolCall: ToolCall;
  result: ToolExecutionResult;
}

export interface ToolFailedEvent {
  runId: string;
  toolCall: ToolCall;
  result: ToolExecutionResult;
}

export interface ModelRequestEvent {
  runId: string;
  request: ModelRequest;
}

export interface ModelResponseEvent {
  runId: string;
  response: ModelResponse;
}

export interface HandoffStartedEvent {
  runId: string;
  target: string;
  input?: unknown;
  reason?: string;
}

export interface HandoffCompletedEvent {
  runId: string;
  target: string;
  output: unknown;
}

export interface GuardrailTriggeredEvent {
  runId: string;
  name: string;
  phase: "input" | "output";
  reason: string;
  metadata: Metadata;
}

export interface SDKEvents {
  "run.started": RunStartedEvent;
  "run.completed": RunCompletedEvent;
  "run.failed": RunFailedEvent;
  "tool.started": ToolStartedEvent;
  "tool.finished": ToolFinishedEvent;
  "tool.failed": ToolFailedEvent;
  "model.request": ModelRequestEvent;
  "model.response": ModelResponseEvent;
  "handoff.started": HandoffStartedEvent;
  "handoff.completed": HandoffCompletedEvent;
  "guardrail.triggered": GuardrailTriggeredEvent;
}

export type EventName = keyof SDKEvents;
export type EventHandler<K extends EventName> = (payload: SDKEvents[K]) => void;

export class EventBus {
  private readonly emitter = new EventEmitter();

  on<K extends EventName>(event: K, handler: EventHandler<K>): this {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
    return this;
  }

  once<K extends EventName>(event: K, handler: EventHandler<K>): this {
    this.emitter.once(event, handler as (...args: unknown[]) => void);
    return this;
  }

  off<K extends EventName>(event: K, handler: EventHandler<K>): this {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
    return this;
  }

  emit<K extends EventName>(event: K, payload: SDKEvents[K]): boolean {
    return this.emitter.emit(event, payload);
  }

  removeAllListeners(event?: EventName): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
}

export function createEventBus(): EventBus {
  return new EventBus();
}
