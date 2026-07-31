export function safeJsonStringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function parseMaybeJsonObject(value: unknown): unknown {
  if (typeof value !== "string") {
    return value ?? {};
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {};
  }

  return JSON.parse(trimmed);
}
