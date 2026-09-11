import type { ApiResponse } from "@/shared/data/api/dto/common";

export type DataRequestExecutor = <T>(
  type: string,
  payload: unknown,
) => Promise<ApiResponse<T>>;

let configuredExecutor: DataRequestExecutor | null = null;

export function configureDataRequestExecutor(executor: DataRequestExecutor): void {
  configuredExecutor = executor;
}

export function requestDataThroughExecutor<T>(
  type: string,
  payload: unknown,
): Promise<ApiResponse<T>> {
  if (!configuredExecutor) {
    return Promise.reject(new Error("DataRequestExecutor is not configured"));
  }
  return configuredExecutor<T>(type, payload);
}
