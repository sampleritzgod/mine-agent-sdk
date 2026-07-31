import type { Metadata } from "./json";
import type { ToolCall } from "./model";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface BaseMessage {
  role: MessageRole;
  content: string;
  metadata?: Metadata;
}

export interface SystemMessage extends BaseMessage {
  role: "system";
}

export interface MessageImagePart {
  /** An http(s) URL or a data: URI. */
  url: string;
}

export interface UserMessage extends BaseMessage {
  role: "user";
  images?: MessageImagePart[];
}

export interface AssistantMessage extends BaseMessage {
  role: "assistant";
  toolCalls?: ToolCall[];
}

export interface ToolMessage extends BaseMessage {
  role: "tool";
  toolCallId: string;
  name: string;
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage;

export function systemMessage(content: string, metadata?: Metadata): SystemMessage {
  return { role: "system", content, ...(metadata ? { metadata } : {}) };
}

export function userMessage(content: string, metadata?: Metadata, images?: MessageImagePart[]): UserMessage {
  return {
    role: "user",
    content,
    ...(images && images.length > 0 ? { images } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export function assistantMessage(
  content: string,
  toolCalls?: ToolCall[],
  metadata?: Metadata,
): AssistantMessage {
  return {
    role: "assistant",
    content,
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export function toolMessage(
  name: string,
  toolCallId: string,
  content: string,
  metadata?: Metadata,
): ToolMessage {
  return {
    role: "tool",
    name,
    toolCallId,
    content,
    ...(metadata ? { metadata } : {}),
  };
}
