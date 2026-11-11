import { readRuntimeConfigValue } from "./runtimeConfig";

/** Route identity is independent of whether this deployment authorizes embeds. */
export function isEmbedMode(): boolean {
  return typeof window !== "undefined" && window.location?.pathname?.startsWith("/embed/") === true;
}
export function embedAllowedOrigins(): string[] {
  const raw = readRuntimeConfigValue("EMBED_ALLOWED_ORIGINS");
  return String(raw || "").split(",").flatMap(value => {
    try {
      const url = new URL(value.trim());
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      return url.origin === value.trim() && (url.protocol === "https:" || (local && url.protocol === "http:")) ? [url.origin] : [];
    } catch { return []; }
  });
}
export function isEmbedEnabled(): boolean {
  return String(readRuntimeConfigValue("EMBED_ENABLED")) === "true";
}
