import { dataEndpoints as endpoints } from "../endpoints";
import { requestJson } from "../http";
import type { WebappConfiguration, WebappEntry, WebappHost, WebappLaunch, WebappPolicyInput, WebappReview, WebappStateInput, WebappUpload } from "../dto/webapps";

function appPath(template: string, id: string): string {
  if (!/^webapp-[a-f0-9]{16}$/.test(id)) throw new Error("webapp_invalid_id");
  return template.replace("{id}", encodeURIComponent(id));
}
export const getWebappHost = (signal?: AbortSignal) => requestJson<WebappHost>(endpoints.webappHost.path, { cache: "no-store", signal });
export const getWebapps = (signal?: AbortSignal) => requestJson<{ items: WebappEntry[] }>(endpoints.webapps.path, { cache: "no-store", signal });
export const getWebappConfiguration = (id: string, signal?: AbortSignal) => requestJson<WebappConfiguration>(appPath(endpoints.webappDetail.path, id), { cache: "no-store", signal });
export const uploadWebapp = (file: File, signal?: AbortSignal) => requestJson<WebappUpload>(endpoints.webappUpload.path, { method: "POST", body: file, headers: { "Content-Type": "application/zip" }, jsonContentType: false, cache: "no-store", retryUnauthorized: false, signal });
export const preflightWebapp = (uploadId: string, signal?: AbortSignal) => requestJson<WebappReview>(endpoints.webappPreflight.path, { method: "POST", body: JSON.stringify({ uploadId }), cache: "no-store", retryUnauthorized: false, signal });
export const installWebapp = (review: WebappReview, signal?: AbortSignal) => requestJson<WebappEntry>(endpoints.webappInstall.path, { method: "POST", body: JSON.stringify({ uploadId: review.uploadId, sha256: review.sha256, expectedRevision: review.expectedRevision }), cache: "no-store", retryUnauthorized: false, signal });
export function setWebappState(id: string, action: "start" | "stop" | "restart", state: WebappStateInput, signal?: AbortSignal) {
  const endpoint = { start: endpoints.webappStart, stop: endpoints.webappStop, restart: endpoints.webappRestart }[action];
  return requestJson<WebappEntry>(appPath(endpoint.path, id), { method: endpoint.method, body: JSON.stringify({ expectedRevision: state.revision, expectedStateRevision: state.stateRevision }), cache: "no-store", retryUnauthorized: false, signal });
}
export const launchWebapp = (id: string, signal?: AbortSignal) => requestJson<WebappLaunch>(appPath(endpoints.webappLaunch.path, id), { method: "POST", body: "{}", cache: "no-store", retryUnauthorized: false, signal });
export const deleteWebapp = (entry: WebappEntry, purgeData: boolean, signal?: AbortSignal) => requestJson<{ removed: boolean }>(appPath(endpoints.webappDelete.path, entry.id), { method: "DELETE", body: JSON.stringify({ expectedRevision: entry.revision, purgeData }), cache: "no-store", retryUnauthorized: false, signal });
export const saveWebappUserConfig = (id: string, expectedRevision: string, values: WebappConfiguration["userConfig"], signal?: AbortSignal) => requestJson<WebappConfiguration>(appPath(endpoints.webappUserConfig.path, id), { method: "PUT", body: JSON.stringify({ expectedRevision, values }), cache: "no-store", retryUnauthorized: false, signal });
export const saveWebappPolicy = (id: string, input: WebappPolicyInput, signal?: AbortSignal) => requestJson<WebappConfiguration>(appPath(endpoints.webappPolicy.path, id), { method: "PUT", body: JSON.stringify(input), cache: "no-store", retryUnauthorized: false, signal });
export const revokeWebappSessions = (signal?: AbortSignal) => requestJson<{ revoked: boolean }>(endpoints.webappRevokeSessions.path, { method: "POST", cache: "no-store", retryUnauthorized: false, signal });
