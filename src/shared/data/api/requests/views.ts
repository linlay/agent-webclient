import type { ApiResponse } from "@/shared/data/api/dto/common";
import type { ViewDocument, ViewRequest } from "@/shared/contracts/view";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { endpointQuery, withQuery } from "@/shared/data/api/queryParams";
import { requestJson } from "@/shared/data/api/http";

export function getView(params: ViewRequest): Promise<ApiResponse<ViewDocument>> {
  return requestJson<ViewDocument>(withQuery(dataEndpoints.view.path, endpointQuery(dataEndpoints.view, params)));
}
