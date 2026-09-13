import type { DesktopSkinToken, ResolvedThemeMode } from "./skinDefinition";
import { AGENT_WEBCLIENT_APPEARANCE_COLOR_TOKENS, parseAgentWebclientAppearanceTokens, parseSkinVisuals, type SkinVisuals } from "@/shared/contracts/generated/agentWebclientBridge";

export const SKIN_PACKAGE_LIMITS = Object.freeze({
  archiveBytes: 32 * 1024 * 1024, expandedBytes: 48 * 1024 * 1024,
  fileBytes: 16 * 1024 * 1024, manifestBytes: 64 * 1024, entries: 64, installed: 20
});

export type SkinPackageManifest = {
  schemaVersion: "1.1";
  id: string;
  name: string;
  version: string;
  author?: string;
  preview?: string;
  variants: Record<ResolvedThemeMode, {
    tokens: Partial<Record<DesktopSkinToken, string>>;
    visuals?: SkinVisuals;
    background?: { path: string; position: string };
  }>;
};

export class SkinPackageError extends Error {
  constructor(public readonly code: "invalidPackage" | "unsupportedPackageVersion" | "packageTooLarge" | "packageExists" | "tooManySkins") { super(code); }
}

// These are the public v1 controls. Values are parsed, never passed through as
// arbitrary CSS. Derived RGB values and CSS expressions remain Desktop-owned.
export const SKIN_COLOR_TOKENS = AGENT_WEBCLIENT_APPEARANCE_COLOR_TOKENS;
function invalid(): never { throw new SkinPackageError("invalidPackage"); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}
function label(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) invalid();
  return value.trim();
}

// A portable resource path: no drive letters, ADS, traversal, ambiguous Windows
// names or separators. Files are later copied under generated owned names.
export function validateSkinResourcePath(value: unknown) {
  const text = label(value, 240);
  if (text !== value || /[\\:%?#<>"|*]/.test(text) || text.startsWith("/") ||
    text.split("/").some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) invalid();
  return text;
}

export function parseSkinPackageManifest(value: unknown): SkinPackageManifest {
  const input = object(value);
  if (input.schemaVersion !== "1.1") throw new SkinPackageError("unsupportedPackageVersion");
  keys(input, ["schemaVersion", "id", "name", "version", "author", "preview", "variants"]);
  const id = label(input.id, 64), version = label(input.version, 40);
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id) ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) invalid();
  const variants = object(input.variants);
  keys(variants, ["light", "dark"]);
  function variant(mode: ResolvedThemeMode): SkinPackageManifest["variants"][ResolvedThemeMode] {
    const variant = object(variants[mode]);
    keys(variant, ["tokens", "background", "visuals"]);
    const visuals = variant.visuals === undefined ? undefined : parseSkinVisuals(variant.visuals, raw => {
      const path = validateSkinResourcePath(raw);
      return /\.png$/i.test(path) ? path : null;
    });
    if (visuals === null) invalid();
    const tokens = parseAgentWebclientAppearanceTokens(variant.tokens ?? {});
    if (!tokens) invalid();
    if (variant.background === undefined) return { tokens, ...(visuals ? { visuals } : {}) };
    const background = object(variant.background);
    keys(background, ["path", "position"]);
    const assetPath = validateSkinResourcePath(background.path);
    if (!/\.(png|jpe?g)$/i.test(assetPath)) invalid();
    const position = background.position ?? "center";
    if (typeof position !== "string" || !/^(center|top|bottom|left|right|(?:left|center|right) (?:top|center|bottom)|(?:100|\d{1,2})% (?:100|\d{1,2})%)$/.test(position)) invalid();
    return { tokens, ...(visuals ? { visuals } : {}), background: { path: assetPath, position } };
  }
  const manifest: SkinPackageManifest = {
    schemaVersion: input.schemaVersion as "1.1", id, name: label(input.name, 80), version,
    variants: { light: variant("light"), dark: variant("dark") }
  };
  if (input.author !== undefined) manifest.author = label(input.author, 80);
  if (input.preview !== undefined) {
    manifest.preview = validateSkinResourcePath(input.preview);
    if (!/\.(png|jpe?g)$/i.test(manifest.preview)) invalid();
  }
  return manifest;
}

export function resolveSkinPackageTokens(tokens: SkinPackageManifest["variants"]["light"]["tokens"]) {
  const result = { ...tokens };
  // Accent alpha is irrelevant to this companion token; rgba consumers own it.
  const accent = tokens["--accent"];
  if (accent?.startsWith("#")) {
    const hex = accent.length < 6 ? [...accent.slice(1)].map((digit) => digit + digit).join("") : accent.slice(1);
    result["--accent-rgb"] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(", ");
  } else if (accent?.startsWith("rgb")) {
    result["--accent-rgb"] = accent.slice(accent.indexOf("(") + 1, -1).split(",").slice(0, 3).map((s) => s.trim()).join(", ");
  }
  return result;
}

export function skinPackageResources(manifest: SkinPackageManifest): string[] {
  return [...new Set([manifest.preview, ...Object.values(manifest.variants).flatMap(variant => [variant.background?.path, ...Object.values(variant.visuals?.images ?? {})])].filter((path): path is string => Boolean(path)))];
}
