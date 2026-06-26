export type EndpointMethod = "GET" | "POST" | "PUT" | "DELETE";

export type EndpointTransport =
  | "http"
  | "auto"
  | "sse"
  | "ws"
  | "ws-stream"
  | "resource"
  | "voice-ws";

export interface EndpointCachePolicy {
  ttlMs?: number;
  dedupe?: boolean;
}

export interface EndpointDefinition<TInput = void, TPayload = unknown> {
  key: string;
  path: string;
  method: EndpointMethod;
  transport: EndpointTransport;
  cache?: EndpointCachePolicy;
  payload?: (input: TInput) => TPayload;
}

export function defineEndpoint<TInput = void, TPayload = unknown>(
  definition: EndpointDefinition<TInput, TPayload>,
): EndpointDefinition<TInput, TPayload> {
  return Object.freeze(definition);
}

export function createEndpointRegistry<
  TRegistry extends Record<string, EndpointDefinition<any, any>>,
>(registry: TRegistry): Readonly<TRegistry> {
  return Object.freeze(registry);
}

export function compactPayload(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
}

export function resolveEndpointPayload<TInput, TPayload>(
  endpoint: EndpointDefinition<TInput, TPayload>,
  input: TInput,
): TPayload | TInput {
  return typeof endpoint.payload === "function" ? endpoint.payload(input) : input;
}

export function createDataCacheKey(
  endpoint: Pick<EndpointDefinition, "key">,
  input?: unknown,
): string {
  if (input === undefined) {
    return endpoint.key;
  }
  return `${endpoint.key}:${stableStringify(input)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
