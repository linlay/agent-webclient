import type { ApiResponse } from "@/shared/data/api/dto/common";
import type { EventDetailLevel } from "@/shared/data/eventDetailLevel";

export interface DataRequestOptions {
  signal?: AbortSignal;
  /** Frame-level delivery level; only /api/query and /api/chat accept it. */
  detail?: EventDetailLevel;
}

export type DataRequestExecutor = <T>(
  type: string,
  payload: unknown,
  options?: DataRequestOptions,
) => Promise<ApiResponse<T>>;

let configuredExecutor: DataRequestExecutor | null = null;

export function configureDataRequestExecutor(executor: DataRequestExecutor): void {
  configuredExecutor = executor;
}

export function requestDataThroughExecutor<T>(
  type: string,
  payload: unknown,
  options?: DataRequestOptions,
): Promise<ApiResponse<T>> {
  if (!configuredExecutor) {
    return Promise.reject(new Error("DataRequestExecutor is not configured"));
  }
  return options
    ? configuredExecutor<T>(type, payload, options)
    : configuredExecutor<T>(type, payload);
}
