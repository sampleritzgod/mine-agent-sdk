export function nowIso(): string {
  return new Date().toISOString();
}

export function durationMs(startedAt: string, endedAt = nowIso()): number {
  return Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
}
