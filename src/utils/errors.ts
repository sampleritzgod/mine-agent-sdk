import { SDKError } from "../errors/sdk-error";
import type { Metadata } from "../types/json";

export interface SerializedError {
  name: string;
  message: string;
  code?: string;
  details?: Metadata;
  stack?: string;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof SDKError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      details: error.details,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

export function errorMessage(error: unknown): string {
  return serializeError(error).message;
}
