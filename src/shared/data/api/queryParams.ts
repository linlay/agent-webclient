import {
  isObjectRecord,
} from "@/shared/data/api/http";
import {
  type EndpointDefinition,
  resolveEndpointPayload,
} from "@/shared/data/api/endpointRegistry";

type QueryParamScalar = string | number | boolean | undefined | null;

type QueryParamValue = QueryParamScalar | QueryParamScalar[];

export function toQueryString(
  params: Record<string, QueryParamValue> = {},
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") search.append(key, String(item));
      });
      continue;
    }
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
}

function toQueryParamsRecord(value: unknown): Record<string, QueryParamValue> {
  if (!isObjectRecord(value) || Array.isArray(value)) {
    return {};
  }

  const params: Record<string, QueryParamValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean" ||
      item == null ||
      (Array.isArray(item) && item.every((entry) =>
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry == null,
      ))
    ) {
      params[key] = item;
    }
  }
  return params;
}

export function endpointQuery<TInput>(
  endpoint: EndpointDefinition<TInput, unknown>,
  input: TInput,
): string {
  return toQueryString(toQueryParamsRecord(resolveEndpointPayload(endpoint, input)));
}

export function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}
