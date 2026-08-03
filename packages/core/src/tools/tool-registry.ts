import { ConfigurationError } from "../errors/sdk-error";
import type { ProviderToolDefinition } from "../types/model";
import type { AnyTool } from "./tool";

export class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  constructor(tools: AnyTool[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: AnyTool): this {
    const name = tool.name.trim();
    if (name.length === 0) {
      throw new ConfigurationError("Tool name cannot be empty.");
    }

    if (this.tools.has(name)) {
      throw new ConfigurationError(`Tool "${name}" is already registered.`, { tool: name });
    }

    this.tools.set(name, { ...tool, name });
    return this;
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): AnyTool[] {
    return [...this.tools.values()];
  }

  toProviderTools(): ProviderToolDefinition[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      metadata: tool.metadata,
    }));
  }
}
