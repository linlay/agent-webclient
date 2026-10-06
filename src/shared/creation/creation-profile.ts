/** Client-owned brand configuration. Runtime facts always come from Platform. */
export type CreationProfile = {
  version: 1;
  types: Partial<Record<"general" | "coder" | "kbase", { defaultGroups?: string[] }>>;
  groups: Array<{
    key: string;
    name: string | Record<string, string>;
    description?: string | Record<string, string>;
    skills?: string[];
    tools?: string[];
    connectors?: string[];
  }>;
};

export function parseCreationProfile(value: unknown): CreationProfile {
  const p = value as CreationProfile;
  if (!p || p.version !== 1 || !p.types || typeof p.types !== "object" || Array.isArray(p.types) || !Array.isArray(p.groups)) {
    throw new Error("Invalid agent-creation.json: expected version 1, types and groups");
  }
  const keys = new Set<string>();
  const names = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string" && x.trim() === x && x.length > 0);
  const localized = (v: unknown) => typeof v === "string" ? v.trim().length > 0 :
    Boolean(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length && Object.values(v).every(x => typeof x === "string" && x.trim()));
  for (const g of p.groups) {
    if (!g || typeof g.key !== "string" || !/^[a-z0-9-]+$/.test(g.key) || keys.has(g.key) || !localized(g.name) ||
        (g.description !== undefined && !localized(g.description))) throw new Error("Invalid creation group");
    keys.add(g.key);
    for (const list of [g.skills, g.tools, g.connectors]) if (list !== undefined && !names(list)) throw new Error(`Invalid members in ${g.key}`);
  }
  for (const [key, type] of Object.entries(p.types)) {
    if (!["general", "coder", "kbase"].includes(key) || !type || typeof type !== "object" || Array.isArray(type) || Array.isArray(type) ||
        (type.defaultGroups !== undefined && (!names(type.defaultGroups) || type.defaultGroups.some(k => !keys.has(k))))) {
      throw new Error(`Invalid creation defaults for ${key}`);
    }
  }
  return p;
}

export type CreationRuntimeType = {
  key: string; engine: string; baseTools: string[];
};
export type CreationCatalog = {
  skills: Array<{ id: string; name?: string; displayName?: string }>;
  connectors: Array<{ id: string; name?: string; mutuallyExclusiveWith?: string[] }>;
  tools: Array<{ name: string }>;
};

export function applyCreationProfile<T extends CreationRuntimeType, M>(
  runtime: { types: T[]; models: M[] }, profile: CreationProfile, catalog: CreationCatalog, locale: string,
) {
  const text = (v: string | Record<string, string> | undefined): string => {
    if (typeof v === "string") return v;
    if (!v) return "";
    const entry = Object.entries(v).find(([key]) => key.toLowerCase() === locale.toLowerCase()) ??
      Object.entries(v).find(([key]) => key.split("-")[0].toLowerCase() === locale.split("-")[0].toLowerCase());
    return entry?.[1] ?? v["en-US"] ?? Object.values(v)[0] ?? "";
  };
  const groups = profile.groups.map(g => {
    const missing = [
      ...(g.skills ?? []).filter(id => !catalog.skills.some(s => s.id === id)).map(id => `skill ${id}`),
      ...(g.connectors ?? []).filter(id => !catalog.connectors.some(c => c.id === id)).map(id => `connector ${id}`),
      ...(g.tools ?? []).filter(name => !catalog.tools.some(t => t.name === name)).map(id => `tool ${id}`),
    ];
    const conflict = catalog.connectors.some(c => g.connectors?.includes(c.id) && c.mutuallyExclusiveWith?.some(id => g.connectors?.includes(id)));
    return {
      key: g.key, name: text(g.name), description: text(g.description),
      skills: (g.skills ?? []).map(key => ({ key, name: catalog.skills.find(s => s.id === key)?.displayName || catalog.skills.find(s => s.id === key)?.name || key })),
      connectors: (g.connectors ?? []).map(key => ({ key, name: catalog.connectors.find(c => c.id === key)?.name || key })),
      tools: g.tools ?? [], available: missing.length === 0 && !conflict,
      unavailableReason: missing.length ? `Missing: ${missing.join(", ")}` : conflict ? "Conflicting connectors" : "",
    };
  });
  return {
    ...runtime, groups,
    types: runtime.types.map(type => ({
      ...type, supportsGroups: type.engine !== "acp",
      defaultGroups: type.engine === "acp" ? [] : (profile.types[type.key as keyof CreationProfile["types"]]?.defaultGroups ?? []).filter(key => groups.some(g => g.key === key && g.available)),
    })),
  };
}

/** Expand only selected UI groups. Never send group keys to the server. */
export function selectedCreationDefinition(
  options: { types: CreationRuntimeType[]; groups: Array<{ key: string; available: boolean; tools: string[]; skills: Array<{key: string}>; connectors: Array<{key: string}> }> },
  typeKey: string, selected: string[],
): Record<string, unknown> {
  const type = options.types.find(t => t.key === typeKey);
  if (!type) throw new Error("Unknown agent type");
  if (type.engine === "acp") return {};
  const groups = [...new Set(selected)].map(key => {
    const g = options.groups.find(item => item.key === key);
    if (!g?.available) throw new Error(`Unavailable creation group: ${key}`);
    return g;
  });
  const tools = [...new Set([...type.baseTools, ...groups.flatMap(g => g.tools)])];
  const skills = [...new Set(groups.flatMap(g => g.skills.map(s => s.key)))];
  const connectors = [...new Set(groups.flatMap(g => g.connectors.map(c => c.key)))];
  return {
    ...(tools.length ? { toolConfig: { tools } } : {}),
    ...(skills.length ? { skillConfig: { skills } } : {}),
    ...(connectors.length ? { connectorConfig: { connectors } } : {}),
  };
}
