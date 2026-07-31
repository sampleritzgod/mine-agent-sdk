import type { z } from "zod";

export type JsonSchema = Record<string, unknown>;

/**
 * Converts a zod schema into a JSON Schema object suitable for a provider's
 * function/tool "parameters" field. Covers the shapes typically used for
 * tool inputs (object/string/number/boolean/array/enum/union/record/literal
 * plus optional/nullable/default wrappers). Zod effects (refine/transform),
 * tuples, and intersections fall back to an unconstrained `{}` schema.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  return convert(schema);
}

function convert(schema: z.ZodTypeAny): JsonSchema {
  const def = schema._def as { typeName: string };
  const description = (schema as { description?: string }).description;
  const withDescription = (json: JsonSchema): JsonSchema =>
    description !== undefined ? { ...json, description } : json;

  switch (def.typeName) {
    case "ZodString":
      return withDescription({ type: "string" });
    case "ZodNumber":
      return withDescription({ type: "number" });
    case "ZodBoolean":
      return withDescription({ type: "boolean" });
    case "ZodNull":
      return withDescription({ type: "null" });
    case "ZodLiteral":
      return withDescription({ const: (schema._def as { value: unknown }).value });
    case "ZodEnum":
      return withDescription({
        type: "string",
        enum: [...(schema._def as { values: string[] }).values],
      });
    case "ZodNativeEnum":
      return withDescription({
        enum: Object.values((schema._def as { values: Record<string, string | number> }).values),
      });
    case "ZodArray":
      return withDescription({
        type: "array",
        items: convert((schema._def as { type: z.ZodTypeAny }).type),
      });
    case "ZodObject":
      return withDescription(convertObject(schema as unknown as z.ZodObject<z.ZodRawShape>));
    case "ZodRecord":
      return withDescription({
        type: "object",
        additionalProperties: convert((schema._def as { valueType: z.ZodTypeAny }).valueType),
      });
    case "ZodUnion":
      return withDescription({
        anyOf: (schema._def as { options: z.ZodTypeAny[] }).options.map(option => convert(option)),
      });
    case "ZodOptional":
      return convert((schema._def as { innerType: z.ZodTypeAny }).innerType);
    case "ZodNullable":
      return convertNullable(schema);
    case "ZodDefault": {
      const defaultDef = schema._def as { innerType: z.ZodTypeAny; defaultValue: () => unknown };
      return withDescription({
        ...convert(defaultDef.innerType),
        default: defaultDef.defaultValue(),
      });
    }
    default:
      return withDescription({});
  }
}

function convertObject(schema: z.ZodObject<z.ZodRawShape>): JsonSchema {
  const shape = schema._def.shape();
  const properties: JsonSchema = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const fieldSchema = value as z.ZodTypeAny;
    properties[key] = convert(fieldSchema);
    if (!isOptionalField(fieldSchema)) {
      required.push(key);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function convertNullable(schema: z.ZodTypeAny): JsonSchema {
  const inner = convert((schema._def as { innerType: z.ZodTypeAny }).innerType);
  if (typeof inner.type === "string") {
    return { ...inner, type: [inner.type, "null"] };
  }
  return inner;
}

function isOptionalField(schema: z.ZodTypeAny): boolean {
  const typeName = (schema._def as { typeName: string }).typeName;
  return typeName === "ZodOptional" || typeName === "ZodDefault";
}
