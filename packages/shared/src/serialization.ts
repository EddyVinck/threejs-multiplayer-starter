import { z } from "zod";

import type { MessageEnvelope } from "./protocol.js";

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = {
  [key: string]: JsonValue;
};

export type SafeResult<TValue> =
  | {
      ok: true;
      value: TValue;
    }
  | {
      ok: false;
      error: Error;
    };

export function safeParseJson(serialized: string): SafeResult<unknown> {
  try {
    return {
      ok: true,
      value: JSON.parse(serialized) as unknown
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<JsonObject>((sorted, key) => {
        const entry = value[key];

        if (entry !== undefined) {
          sorted[key] = sortJsonValue(entry);
        }

        return sorted;
      }, {});
  }

  return value;
}

export function toStableJson(value: JsonValue): string {
  return JSON.stringify(sortJsonValue(value));
}

export function serializeEnvelope<TType extends string, TPayload>(
  envelope: MessageEnvelope<TType, TPayload>
): string {
  return JSON.stringify(envelope);
}

export function deserializeEnvelope<TSchema extends z.ZodType>(
  serialized: string,
  schema: TSchema
): z.infer<TSchema> {
  return schema.parse(JSON.parse(serialized)) as z.infer<TSchema>;
}

export function safeDeserializeEnvelope<TSchema extends z.ZodType>(
  serialized: string,
  schema: TSchema
): SafeResult<z.infer<TSchema>> {
  const parsedJson = safeParseJson(serialized);

  if (!parsedJson.ok) {
    return parsedJson;
  }

  const parsedEnvelope = schema.safeParse(parsedJson.value);

  if (!parsedEnvelope.success) {
    return {
      ok: false,
      error: new Error(parsedEnvelope.error.message)
    };
  }

  return {
    ok: true,
    value: parsedEnvelope.data
  };
}
