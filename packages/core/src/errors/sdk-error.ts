import type { Metadata } from "../types/json";

export class SDKError extends Error {
  readonly code: string;
  readonly details: Metadata;
  override readonly cause?: unknown;

  constructor(message: string, code = "sdk_error", details: Metadata = {}, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export class ConfigurationError extends SDKError {
  constructor(message: string, details: Metadata = {}, cause?: unknown) {
    super(message, "configuration_error", details, cause);
  }
}

export class ProviderError extends SDKError {
  constructor(message: string, details: Metadata = {}, cause?: unknown) {
    super(message, "provider_error", details, cause);
  }
}

export class ToolExecutionError extends SDKError {
  constructor(
    message: string,
    details: Metadata = {},
    cause?: unknown,
    code = "tool_execution_error",
  ) {
    super(message, code, details, cause);
  }
}

export class ToolTimeoutError extends ToolExecutionError {
  constructor(message: string, details: Metadata = {}, cause?: unknown) {
    super(message, details, cause, "tool_timeout");
  }
}

export class ToolInputError extends ToolExecutionError {
  constructor(message: string, details: Metadata = {}, cause?: unknown) {
    super(message, details, cause, "tool_input_error");
  }
}

export class GuardrailError extends SDKError {
  constructor(message: string, details: Metadata = {}, cause?: unknown) {
    super(message, "guardrail_error", details, cause);
  }
}

export class MaxIterationsError extends SDKError {
  constructor(message: string, details: Metadata = {}, cause?: unknown) {
    super(message, "max_iterations_exceeded", details, cause);
  }
}
