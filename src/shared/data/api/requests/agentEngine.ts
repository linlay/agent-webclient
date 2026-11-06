import { requestJson } from '@/shared/data/api/http';
import { dataEndpoints } from '@/shared/data/api/endpoints';
import type { AuthStatus, ConfigPreview, ConfigUpdate, PreparedSession, SessionPrepare } from '@/shared/data/api/dto/agentEngine';
// Authentication failures belong to the engine profile, not to the platform
// access-token refresh flow. Retrying a mutating login request is unsafe.
export function prepareEngineSession(input: SessionPrepare, signal?: AbortSignal) {
  return requestJson<PreparedSession>(dataEndpoints.engineSessionPrepare.path, { method: 'POST', body: JSON.stringify(input), signal, retryUnauthorized: false });
}
export function getEngineSessionConfig(chatId: string, signal?: AbortSignal) {
  return requestJson<PreparedSession>(`${dataEndpoints.engineSessionSnapshot.path}?chatId=${encodeURIComponent(chatId)}`, { signal, cache: 'no-store', retryUnauthorized: false });
}
export function configureEngineSession(input: ConfigUpdate, signal?: AbortSignal) {
  return requestJson<PreparedSession>(dataEndpoints.engineSessionConfig.path, { method: 'PUT', body: JSON.stringify(input), signal, retryUnauthorized: false });
}
export function getEngineAuthStatus(engineId: string, signal?: AbortSignal) {
  return requestJson<AuthStatus>(`${dataEndpoints.engineAuthStatus.path}?engineId=${encodeURIComponent(engineId)}`, { signal, cache: 'no-store', retryUnauthorized: false });
}
export function startEngineAuth(engineId: string, methodId: string) {
  return requestJson<AuthStatus>(dataEndpoints.engineAuthStart.path, { method: 'POST', body: JSON.stringify({ engineId, methodId }), retryUnauthorized: false });
}
export function cancelEngineAuth(authOperationId: string) {
  return requestJson(dataEndpoints.engineAuthCancel.path, { method: 'POST', body: JSON.stringify({ authOperationId }), retryUnauthorized: false });
}

export function previewEngineConfig(agentKey: string, refresh: boolean, signal?: AbortSignal) {
  const endpoint = refresh ? dataEndpoints.engineConfigRefresh : dataEndpoints.engineConfigPreview;
  return requestJson<ConfigPreview>(`${endpoint.path}?agentKey=${encodeURIComponent(agentKey)}`, { method: endpoint.method, signal, cache: 'no-store', retryUnauthorized: false });
}
