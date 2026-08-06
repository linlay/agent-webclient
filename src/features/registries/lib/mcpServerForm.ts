export type McpServerTransport = "streamable-http" | "stdio";

export interface McpServerFormState {
  serverKey: string;
  name: string;
  enabled: boolean;
  transport: McpServerTransport;
  toolPrefix: string;
  baseUrl: string;
  endpointPath: string;
  authToken: string;
  headersText: string;
  command: string;
  workingDirectory: string;
  argsText: string;
  envText: string;
  connectTimeout: string;
  startupTimeout: string;
  readTimeout: string;
  retry: string;
  aliasMapText: string;
}

export const EMPTY_MCP_SERVER_FORM: McpServerFormState = {
  serverKey: "",
  name: "",
  enabled: true,
  transport: "streamable-http",
  toolPrefix: "",
  baseUrl: "",
  endpointPath: "/mcp",
  authToken: "",
  headersText: "",
  command: "",
  workingDirectory: "",
  argsText: "",
  envText: "",
  connectTimeout: "3",
  startupTimeout: "5",
  readTimeout: "15",
  retry: "1",
  aliasMapText: "",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function firstValue(
  definition: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(definition, key)) {
      return definition[key];
    }
  }
  return undefined;
}

function firstText(
  definition: Record<string, unknown>,
  ...keys: string[]
): string {
  const value = firstValue(definition, keys);
  return value === undefined || value === null ? "" : String(value).trim();
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "yes", "1", "on", "enabled"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "0", "off", "disabled"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function integerText(value: unknown, fallback: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const normalized = String(value ?? "").trim();
  return /^-?\d+$/.test(normalized) ? normalized : fallback;
}

function stringListText(value: unknown): string {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "")).join("\n")
    : "";
}

function mapText(value: unknown): string {
  const entries = Object.entries(asRecord(value));
  return entries
    .map(([key, item]) => `${key}=${String(item ?? "")}`)
    .join("\n");
}

export function mcpServerFormFromDefinition(
  definition: Record<string, unknown>,
  fallbackKey = "",
): McpServerFormState {
  const transport = firstText(definition, "transport").toLowerCase();
  return {
    serverKey:
      firstText(definition, "serverKey", "server-key", "key") || fallbackKey,
    name: firstText(definition, "name"),
    enabled: booleanValue(definition.enabled, true),
    transport: transport === "stdio" ? "stdio" : "streamable-http",
    toolPrefix: firstText(definition, "toolPrefix", "tool-prefix"),
    baseUrl: firstText(definition, "baseUrl", "base-url", "url"),
    endpointPath:
      firstText(definition, "endpointPath", "endpoint-path", "path") ||
      "/mcp",
    authToken: firstText(definition, "authToken", "auth-token"),
    headersText: mapText(definition.headers),
    command: firstText(definition, "command"),
    workingDirectory: firstText(
      definition,
      "workingDirectory",
      "working-directory",
    ),
    argsText: stringListText(definition.args),
    envText: mapText(definition.env),
    connectTimeout: integerText(definition["connect-timeout"], "3"),
    startupTimeout: integerText(
      firstValue(definition, ["startup-timeout", "startupTimeout"]),
      "5",
    ),
    readTimeout: integerText(definition["read-timeout"], "15"),
    retry: integerText(definition.retry, "1"),
    aliasMapText: mapText(definition.aliasMap),
  };
}

function parseKeyValueText(
  value: string,
  fieldName: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  value.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error(`${fieldName}: line ${index + 1} must use KEY=VALUE`);
    }
    const key = line.slice(0, separator).trim();
    const item = line.slice(separator + 1).trim();
    if (!key) {
      throw new Error(`${fieldName}: line ${index + 1} has an empty key`);
    }
    result[key] = item;
  });
  return result;
}

function parseInteger(value: string, fieldName: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return Number(normalized);
}

function setOrDelete(
  definition: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const emptyArray = Array.isArray(value) && value.length === 0;
  const emptyObject =
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0;
  if (value === "" || value === undefined || value === null || emptyArray || emptyObject) {
    delete definition[key];
    return;
  }
  definition[key] = value;
}

function deleteKeys(
  definition: Record<string, unknown>,
  ...keys: string[]
): void {
  keys.forEach((key) => delete definition[key]);
}

export function buildMcpServerDefinition(
  form: McpServerFormState,
  baseDefinition: Record<string, unknown> = {},
): Record<string, unknown> {
  const serverKey = form.serverKey.trim();
  if (!serverKey) throw new Error("serverKey is required");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(serverKey)) {
    throw new Error(
      "serverKey must start with a letter or digit and contain only letters, digits, '.', '_' or '-'",
    );
  }

  const definition = { ...baseDefinition };
  deleteKeys(
    definition,
    "server-key",
    "key",
    "base-url",
    "url",
    "endpoint-path",
    "path",
    "auth-token",
    "tool-prefix",
    "working-directory",
    "startupTimeout",
  );
  definition.serverKey = serverKey;
  setOrDelete(definition, "name", form.name.trim());
  definition.enabled = form.enabled;
  definition.transport = form.transport;
  setOrDelete(definition, "toolPrefix", form.toolPrefix.trim());

  if (form.transport === "stdio") {
    const command = form.command.trim();
    if (!command) throw new Error("command is required for stdio transport");
    definition.command = command;
    setOrDelete(
      definition,
      "args",
      form.argsText
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    );
    setOrDelete(definition, "env", parseKeyValueText(form.envText, "env"));
    setOrDelete(
      definition,
      "workingDirectory",
      form.workingDirectory.trim(),
    );
    deleteKeys(
      definition,
      "baseUrl",
      "endpointPath",
      "authToken",
      "headers",
    );
  } else {
    const baseUrl = form.baseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      throw new Error("baseUrl is required for streamable-http transport");
    }
    definition.baseUrl = baseUrl;
    setOrDelete(definition, "endpointPath", form.endpointPath.trim() || "/mcp");
    setOrDelete(definition, "authToken", form.authToken.trim());
    setOrDelete(
      definition,
      "headers",
      parseKeyValueText(form.headersText, "headers"),
    );
    deleteKeys(definition, "command", "args", "env", "workingDirectory");
  }

  definition["connect-timeout"] = parseInteger(
    form.connectTimeout,
    "connect-timeout",
  );
  definition["startup-timeout"] = parseInteger(
    form.startupTimeout,
    "startup-timeout",
  );
  definition["read-timeout"] = parseInteger(
    form.readTimeout,
    "read-timeout",
  );
  definition.retry = parseInteger(form.retry, "retry");
  setOrDelete(
    definition,
    "aliasMap",
    parseKeyValueText(form.aliasMapText, "aliasMap"),
  );
  return definition;
}

function yamlKey(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)
    ? value
    : JSON.stringify(value);
}

function yamlScalar(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return JSON.stringify(String(value ?? ""));
}

function yamlLines(value: unknown, indent: number): string[] {
  const prefix = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}[]`];
    return value.flatMap((item) => {
      if (item && typeof item === "object") {
        return [`${prefix}-`, ...yamlLines(item, indent + 2)];
      }
      return [`${prefix}- ${yamlScalar(item)}`];
    });
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, item]) => item !== undefined,
    );
    if (entries.length === 0) return [`${prefix}{}`];
    return entries.flatMap(([key, item]) => {
      if (item && typeof item === "object") {
        return [
          `${prefix}${yamlKey(key)}:`,
          ...yamlLines(item, indent + 2),
        ];
      }
      return [`${prefix}${yamlKey(key)}: ${yamlScalar(item)}`];
    });
  }
  return [`${prefix}${yamlScalar(value)}`];
}

export function stringifyMcpServerYaml(
  definition: Record<string, unknown>,
): string {
  return `${yamlLines(definition, 0).join("\n")}\n`;
}

export function resolvedMcpServerUrl(form: McpServerFormState): string {
  if (form.transport !== "streamable-http") return "";
  const base = form.baseUrl.trim().replace(/\/+$/, "");
  if (!base) return "";
  const path = (form.endpointPath.trim() || "/mcp").replace(/^\/+/, "");
  return path ? `${base}/${path}` : base;
}
