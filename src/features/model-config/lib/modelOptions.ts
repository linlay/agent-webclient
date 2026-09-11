import type {
  CoderModelOption,
  QueryServiceTier,
  ReasoningEffortOption,
  ServiceTierOption,
} from "@/shared/data";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function toModelOptionText(value: unknown): string {
  return String(value ?? "").trim();
}

export function getModelDisplayName(model: CoderModelOption): string {
  return toModelOptionText(model.name);
}

export function normalizeModelServiceTier(
  value: unknown,
): QueryServiceTier | undefined {
  const text = toModelOptionText(value).toUpperCase();
  if (
    text === "STANDARD" ||
    text === "DEFAULT" ||
    text === "AUTO" ||
    text === ""
  ) {
    return "STANDARD";
  }
  if (text === "PRIORITY") return "FAST";
  return text || undefined;
}

export function normalizeOptionalModelServiceTier(
  value: unknown,
): QueryServiceTier | undefined {
  return toModelOptionText(value)
    ? normalizeModelServiceTier(value)
    : undefined;
}

export function filterModelOptions(value: unknown): CoderModelOption[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is CoderModelOption =>
          isRecord(item) &&
          Boolean(toModelOptionText(item.key)) &&
          Boolean(toModelOptionText(item.name)),
      )
    : [];
}

export function filterReasoningOptions(
  value: unknown,
): ReasoningEffortOption[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is ReasoningEffortOption =>
          isRecord(item) && Boolean(toModelOptionText(item.key)),
      )
    : [];
}

export function filterServiceTierOptions(
  value: unknown,
): ServiceTierOption[] {
  const seen = new Set<string>(["STANDARD"]);
  const parsed: ServiceTierOption[] = [{ key: "STANDARD", label: "Standard" }];
  if (!Array.isArray(value)) return parsed;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const key = normalizeModelServiceTier(item.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parsed.push({ key, label: toModelOptionText(item.label) || key });
  }
  return parsed;
}

export function supportedModelServiceTiers(
  model: CoderModelOption | undefined,
): Set<QueryServiceTier> {
  const supported = new Set<QueryServiceTier>(["STANDARD"]);
  const tiers = Array.isArray(model?.serviceTiers) ? model.serviceTiers : [];
  for (const tier of tiers) {
    const normalized = normalizeModelServiceTier(tier);
    if (normalized) supported.add(normalized);
  }
  return supported;
}

export function serviceTierSupportedByModel(
  tier: QueryServiceTier | undefined,
  model: CoderModelOption | undefined,
): boolean {
  const normalized = normalizeModelServiceTier(tier) || "STANDARD";
  return supportedModelServiceTiers(model).has(normalized);
}

export function translatedModelOptionLabel(
  prefix: string,
  option: { key: string; label: string },
  t: (key: string) => string,
): string {
  const messageKey = `${prefix}.${option.key}`;
  const translated = t(messageKey);
  return translated === messageKey ? option.label : translated;
}
