import type { ApiResponse } from "@/shared/data/api/dto/common";
import type { ViewDocument, ViewQueryRequest, ViewQueryResult, ViewRequest } from "@/shared/contracts/view";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { endpointQuery, withQuery } from "@/shared/data/api/queryParams";
import { postJson, requestJson } from "@/shared/data/api/http";

export function getView(params: ViewRequest): Promise<ApiResponse<ViewDocument>> {
  return requestJson<ViewDocument>(withQuery(dataEndpoints.view.path, endpointQuery(dataEndpoints.view, params)));
}

/** Runs a query declared by a frozen view snapshot, as the viewing user. */
export function queryView(params: ViewQueryRequest): Promise<ApiResponse<ViewQueryResult>> {
  return postJson<ViewQueryResult>(dataEndpoints.viewQuery.path, params);
}

/** Viewer write; never automatically retry or fall back to another transport. */
export function invokeView(params: import("@/shared/contracts/view").ViewActionRequest): Promise<ApiResponse<import("@/shared/contracts/view").ViewActionResult>> {
  return postJson(dataEndpoints.viewInvoke.path, params);
}
