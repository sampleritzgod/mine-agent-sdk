import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { zodToJsonSchema } from "../../src";

test("zodToJsonSchema converts primitives", () => {
  assert.deepEqual(zodToJsonSchema(z.string()), { type: "string" });
  assert.deepEqual(zodToJsonSchema(z.number()), { type: "number" });
  assert.deepEqual(zodToJsonSchema(z.boolean()), { type: "boolean" });
});

test("zodToJsonSchema converts an object with required and optional fields", () => {
  const schema = z.object({
    name: z.string(),
    age: z.number().optional(),
  });

  assert.deepEqual(zodToJsonSchema(schema), {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
    },
    required: ["name"],
    additionalProperties: false,
  });
});

test("zodToJsonSchema converts arrays and enums", () => {
  assert.deepEqual(zodToJsonSchema(z.array(z.string())), {
    type: "array",
    items: { type: "string" },
  });

  assert.deepEqual(zodToJsonSchema(z.enum(["a", "b"])), {
    type: "string",
    enum: ["a", "b"],
  });
});

test("zodToJsonSchema preserves descriptions", () => {
  const schema = z.object({
    city: z.string().describe("City name"),
  });

  assert.deepEqual(zodToJsonSchema(schema), {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
    },
    required: ["city"],
    additionalProperties: false,
  });
});

test("zodToJsonSchema handles nullable, default, and union fields", () => {
  const schema = z.object({
    nickname: z.string().nullable(),
    role: z.string().default("user"),
    id: z.union([z.string(), z.number()]),
  });

  const result = zodToJsonSchema(schema);
  assert.deepEqual(result, {
    type: "object",
    properties: {
      nickname: { type: ["string", "null"] },
      role: { type: "string", default: "user" },
      id: { anyOf: [{ type: "string" }, { type: "number" }] },
    },
    required: ["nickname", "id"],
    additionalProperties: false,
  });
});
