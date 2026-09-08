import type {
  AdminRegistryCategory,
  AdminRegistryDetailResponse,
  AdminRegistryListDiagnostic,
  AdminRegistryListItem,
  AdminRegistryStatus,
  AdminRegistrySummary,
  AdminSourceResponse,
  AdminToolSummary,
  RegistryConsoleTab,
} from "@/shared/data";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";

export type RegistryStatusFilter = "all" | AdminRegistryStatus;
export type RegistryEditableCategory = Exclude<AdminRegistryCategory, "viewport-servers">;
export type RegistryTranslate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

export const REGISTRY_CATEGORIES: RegistryEditableCategory[] = [
  "providers",
  "models",
];
// Legacy API categories remain in the transport DTO, but cannot be edited here.
export function isRegistryEditableCategory(category: string): category is RegistryEditableCategory {
  return REGISTRY_CATEGORIES.some(item => item === category);
}

export const REGISTRY_CONSOLE_TABS: RegistryConsoleTab[] = [
  ...REGISTRY_CATEGORIES,
  "tools",
];
export const REGISTRY_STATUS_FILTERS: RegistryStatusFilter[] = [
  "all",
  "ready",
  "invalid",
  "disabled",
];

export function translateWithFallback(
  t: RegistryTranslate,
  key: string,
  fallback: string,
): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function registryItemKey(
  item: Pick<AdminRegistryListItem, "category" | "file">,
): string {
  return `${item.category}/${item.file}`;
}

export function defaultRegistryFileName(
  category: RegistryEditableCategory,
  existing: AdminRegistryListItem[],
): string {
  const stemByCategory: Record<RegistryEditableCategory, string> = {
    providers: "new-provider",
    models: "new-model",
  };
  const existingNames = new Set(
    existing
      .filter((item) => item.category === category)
      .map((item) => item.file),
  );
  const stem = stemByCategory[category];
  let index = 0;
  while (true) {
    const file = index === 0 ? `${stem}.yml` : `${stem}-${index + 1}.yml`;
    if (!existingNames.has(file)) return file;
    index += 1;
  }
}

export function registryTemplateForCategory(
  category: RegistryEditableCategory,
  file: string,
): string {
  const key = file.replace(/\.ya?ml$/i, "");
  switch (category) {
    case "providers":
      return [
        `key: ${key}`,
        "baseUrl: https://api.example.com",
        "apiKey: ",
        "defaultModel: ",
        "protocols:",
        "  OPENAI:",
        "    endpointPath: /v1/chat/completions",
        "",
      ].join("\n");
    case "models":
      return [
        `key: ${key}`,
        "name: New Model",
        "provider: ",
        "protocol: OPENAI",
        `modelId: ${key}`,
        "isVision: false",
        "isReasoner: false",
        "isFunction: true",
        "maxInputTokens: 128000",
        "maxOutputTokens: 8192",
        "",
      ].join("\n");
  }
}

export function summaryLine(
  summary: Record<string, unknown> | undefined,
): string {
  if (!summary) return "";
  return Object.entries(summary)
    .filter(
      ([, value]) =>
        value !== undefined && value !== null && String(value).trim() !== "",
    )
    .slice(0, 4)
    .map(([key, value]) =>
      `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`,
    )
    .join(" · ");
}

export function registryStatusTone(
  status: AdminRegistryStatus,
): "accent" | "danger" | "muted" {
  if (status === "invalid") return "danger";
  if (status === "disabled") return "muted";
  return "accent";
}

export function registryDiagnosticText(
  item: AdminRegistryListDiagnostic | undefined,
): string {
  return item ? item.message || item.code : "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function summaryString(
  summary: Record<string, unknown> | undefined,
  key: string,
): string {
  return stringValue(summary?.[key]);
}

function summaryBool(
  summary: Record<string, unknown> | undefined,
  key: string,
): boolean {
  const value = summary?.[key];
  if (typeof value === "boolean") return value;
  return typeof value === "string"
    ? ["true", "yes", "1", "on", "enabled"].includes(
        value.trim().toLowerCase(),
      )
    : false;
}

function modelTypeLabel(rawType: unknown): string {
  const type = stringValue(rawType);
  return type === "image-generation" ? "image" : type;
}

export function readToolKind(tool: AdminToolSummary): string {
  return stringValue(tool.kind);
}

export function readToolSourceType(tool: AdminToolSummary): string {
  return stringValue(tool.sourceType);
}

export function readToolSourceCategory(tool: AdminToolSummary): string {
  return stringValue(tool.sourceCategory);
}

export function toolSourceLabel(
  sourceCategory: string,
  t: RegistryTranslate,
): string {
  switch (sourceCategory.toLowerCase()) {
    case "platform":
      return t("toolSource.platform");
    case "external":
      return t("toolSource.external");
    default:
      return sourceCategory || "--";
  }
}

export function toolListOwnerLabel(
  item: AdminRegistryListItem,
  t: RegistryTranslate,
): string {
  const sourceCategory = stringValue(item.summary?.sourceCategory);
  return sourceCategory ? toolSourceLabel(sourceCategory, t) : "";
}

export function listItemOwnerLabel(
  item: AdminRegistryListItem,
  isToolsTab: boolean,
  t: RegistryTranslate,
): string {
  return isToolsTab ? toolListOwnerLabel(item, t) : "";
}

export function toolSourceTone(
  sourceCategory: string,
): "accent" | "default" | "muted" {
  return sourceCategory.toLowerCase() === "external" ? "default" : "muted";
}

export function normalizeToolToSummary(
  tool: AdminToolSummary,
): AdminRegistryListItem {
  const kind = readToolKind(tool);
  const sourceType = readToolSourceType(tool);
  const sourceCategory = readToolSourceCategory(tool);
  return {
    category: "tools" as AdminRegistryCategory,
    file: tool.key || tool.name || "unknown",
    key: tool.key,
    name: tool.name || tool.label || tool.key,
    status: "ready",
    summary: {
      sourceCategory,
      sourceType,
      kind,
      description: tool.description,
    },
  };
}

export function toolSearchHaystack(tool: AdminToolSummary): string {
  return [
    tool.key,
    tool.name,
    tool.label,
    tool.description,
    tool.sourceType,
    tool.sourceCategory,
    readToolKind(tool),
  ]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .join(" ")
    .toLowerCase();
}

export function toolListMeta(item: AdminRegistryListItem): string {
  const key = stringValue(item.summary?.key) || item.key || item.file;
  return [
    key,
    stringValue(item.summary?.sourceType),
    stringValue(item.summary?.sourceCategory),
    stringValue(item.summary?.kind),
  ]
    .filter((value) => value.trim() !== "" && value !== "--")
    .join(" · ");
}

export function registryListTitle(item: AdminRegistryListItem): string {
  if (item.category === "providers") {
    return item.key || item.name || item.file;
  }
  return item.name || item.key || item.file;
}

export function registryListMeta(
  item: AdminRegistryListItem,
  _t: RegistryTranslate,
): string {
  const summary = item.summary;
  switch (item.category) {
    case "providers":
      return summaryString(summary, "baseUrl") || registryDiagnosticText(item.diagnostic) || "--";
    case "models":
      return (
        [
          summaryString(summary, "provider"),
          summaryString(summary, "protocol"),
          modelTypeLabel(summary?.type),
        ]
          .filter(Boolean)
          .join(" · ") || registryDiagnosticText(item.diagnostic) || "--"
      );
    default:
      return summaryLine(summary) || registryDiagnosticText(item.diagnostic) || "--";
  }
}

export interface RegistryCapabilityChip {
  key: "vision" | "reasoner" | "function";
  icon: MaterialIconName;
  labelKey: string;
}

export function registryCapabilityChips(
  item: AdminRegistryListItem,
): RegistryCapabilityChip[] {
  if (item.category !== "models") return [];
  const chips: RegistryCapabilityChip[] = [];
  if (summaryBool(item.summary, "isVision")) {
    chips.push({
      key: "vision",
      icon: "visibility",
      labelKey: "registryConsole.capability.vision",
    });
  }
  if (summaryBool(item.summary, "isReasoner")) {
    chips.push({
      key: "reasoner",
      icon: "psychology",
      labelKey: "registryConsole.capability.reasoner",
    });
  }
  if (summaryBool(item.summary, "isFunction")) {
    chips.push({
      key: "function",
      icon: "code",
      labelKey: "registryConsole.capability.function",
    });
  }
  return chips;
}

export function filterRegistryItems(
  items: AdminRegistryListItem[],
  filters: {
    searchText?: string;
    categoryFilter?: AdminRegistryCategory;
    statusFilter?: RegistryStatusFilter;
  },
): AdminRegistryListItem[] {
  const needle = (filters.searchText || "").trim().toLowerCase();
  const statusFilter = filters.statusFilter || "all";
  return items.filter((item) => {
    if (!isRegistryEditableCategory(item.category)) return false;
    if (filters.categoryFilter && item.category !== filters.categoryFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (!needle) return true;
    return [
      item.category,
      item.file,
      item.key,
      item.name,
      registryListTitle(item),
      registryListMeta(item, (key) => key),
      summaryLine(item.summary),
      registryDiagnosticText(item.diagnostic),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

export function registryDetailToListItem(
  detail: AdminRegistrySummary,
): AdminRegistryListItem {
  const first = detail.diagnostics?.[0];
  return {
    category: detail.category,
    file: detail.file,
    key: detail.key,
    name: detail.name,
    status: detail.status,
    summary: detail.summary,
    diagnostic: first
      ? { severity: first.severity, code: first.code, message: first.message }
      : undefined,
    diagnosticCount: detail.diagnostics?.length || undefined,
    updatedAt: detail.updatedAt,
  };
}

export function registryDetailFromSource(
  source: AdminSourceResponse,
  fallback: Partial<AdminRegistryDetailResponse> = {},
): AdminRegistryDetailResponse {
  return {
    category: source.target.category as AdminRegistryCategory,
    file: source.target.file || "",
    key: fallback.key,
    name: fallback.name,
    status: fallback.status || "ready",
    summary: fallback.summary || {},
    diagnostics: fallback.diagnostics,
    source: source.source,
    content: source.content,
    encoding: source.encoding,
    sha256: source.sha256,
    updatedAt: source.updatedAt,
    size: source.size,
  };
}
