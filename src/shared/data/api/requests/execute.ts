import { dataEndpoints } from "@/shared/data/api/endpoints";
import { requestJson } from "@/shared/data/api/http";
import type { ExecuteFile, ExecuteRequest, ExecuteResult } from "@/shared/data/api/dto/execute";

// Execute is a synchronous HTTP request. Never route through WS or retry a run.
export function executeAgent(request: ExecuteRequest, files: ExecuteFile[] = [], signal?: AbortSignal) {
  let body: string | FormData = JSON.stringify(request);
  if (files.length) {
    body = new FormData();
    body.append("request", JSON.stringify(request));
    for (const { field, file } of files) body.append(field, file);
  }
  return requestJson<ExecuteResult>(dataEndpoints.execute.path, {
    method: dataEndpoints.execute.method,
    body,
    signal,
    jsonContentType: files.length === 0,
    retryUnauthorized: false,
  });
}
