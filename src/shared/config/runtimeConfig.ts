export type RuntimeConfig = Record<string, unknown>;

export function readRuntimeConfigValue(key: string): unknown {
  const config = globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
  if (!config || typeof config !== "object") return undefined;
  return (config as RuntimeConfig)[key];
}
