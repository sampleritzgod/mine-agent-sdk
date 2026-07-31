import test from "node:test";
import assert from "node:assert/strict";
import { accumulateModelStream, type ModelStreamChunk } from "../../src";

async function* chunksOf(chunks: ModelStreamChunk[]): AsyncGenerator<ModelStreamChunk, void, void> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function drain<T, R>(gen: AsyncGenerator<T, R, void>): Promise<{ yielded: T[]; result: R }> {
  const yielded: T[] = [];
  let next = await gen.next();
  while (!next.done) {
    yielded.push(next.value);
    next = await gen.next();
  }
  return { yielded, result: next.value };
}

test("accumulateModelStream concatenates deltas and surfaces id/usage/raw from the last chunk that carries them", async () => {
  const { yielded, result } = await drain(accumulateModelStream(chunksOf([
    { id: "m1", delta: "Hel", done: false },
    { id: "m1", delta: "lo, ", done: false },
    { id: "m1", delta: "world.", done: true, usage: { totalTokens: 12 }, raw: { finish: "stop" } },
  ])));

  assert.deepEqual(yielded, [{ delta: "Hel" }, { delta: "lo, " }, { delta: "world." }]);
  assert.equal(result.id, "m1");
  assert.equal(result.content, "Hello, world.");
  assert.deepEqual(result.usage, { totalTokens: 12 });
  assert.deepEqual(result.raw, { finish: "stop" });
  assert.equal(result.toolCalls, undefined);
});

test("accumulateModelStream skips yielding for empty-string deltas", async () => {
  const { yielded, result } = await drain(accumulateModelStream(chunksOf([
    { id: "m1", delta: "", done: false },
    { id: "m1", delta: "hi", done: true },
  ])));

  assert.deepEqual(yielded, [{ delta: "hi" }]);
  assert.equal(result.content, "hi");
});

test("accumulateModelStream concatenates string tool-call argument fragments by id", async () => {
  const { result } = await drain(accumulateModelStream(chunksOf([
    { id: "m1", delta: "", toolCallDelta: { id: "call_1", name: "lookup" }, done: false },
    { id: "m1", delta: "", toolCallDelta: { id: "call_1", arguments: "{\"key\":" }, done: false },
    { id: "m1", delta: "", toolCallDelta: { arguments: "\"value\"}" }, done: false },
    { id: "m1", delta: "", done: true },
  ])));

  assert.deepEqual(result.toolCalls, [
    { id: "call_1", name: "lookup", arguments: "{\"key\":\"value\"}" },
  ]);
});

test("accumulateModelStream preserves multiple tool calls in first-seen order and replaces non-string arguments wholesale", async () => {
  const { result } = await drain(accumulateModelStream(chunksOf([
    { id: "m1", delta: "", toolCallDelta: { id: "call_a", name: "first", arguments: { x: 1 } }, done: false },
    { id: "m1", delta: "", toolCallDelta: { id: "call_b", name: "second", arguments: { y: 2 } }, done: false },
    { id: "m1", delta: "", toolCallDelta: { id: "call_a", arguments: { x: 2 } }, done: false },
    { id: "m1", delta: "", done: true },
  ])));

  assert.deepEqual(result.toolCalls, [
    { id: "call_a", name: "first", arguments: { x: 2 } },
    { id: "call_b", name: "second", arguments: { y: 2 } },
  ]);
});

test("accumulateModelStream returns an empty response for an empty stream", async () => {
  const { yielded, result } = await drain(accumulateModelStream(chunksOf([])));

  assert.deepEqual(yielded, []);
  assert.equal(result.id, "");
  assert.equal(result.content, "");
  assert.equal(result.toolCalls, undefined);
  assert.equal(result.usage, undefined);
});
