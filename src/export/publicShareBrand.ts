import zenmindIcon from "./brand-icons/zenmind.svg";
import cutejIcon from "./brand-icons/cutej.svg";
import defaultIcon from "@/shared/icons/agent-icons/default.svg";

export interface PublicShareBrand {
  id: string;
  productName: string;
  openUrl: string;
}

const BRAND_META_NAME = "conversation-export-public-brand";
const LOCAL_BRAND_META_NAME = "conversation-export-local-brand";
const BRAND_FAVICON_ATTRIBUTE = "data-conversation-export-brand-favicon";
const BRAND_ID_PATTERN = /^[a-z][a-z0-9-]*$/u;
const RESERVED_SCHEMES = new Set(["http", "https", "javascript", "data", "vbscript", "file", "blob"]);

export function readPublicShareBrand(): PublicShareBrand | null {
  const raw = document.querySelector<HTMLMetaElement>(`meta[name="${BRAND_META_NAME}"]`)?.content;
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const brand = value as Record<string, unknown>;
  if (typeof brand.id !== "string" || !BRAND_ID_PATTERN.test(brand.id) ||
      typeof brand.productName !== "string" || !brand.productName.trim() ||
      typeof brand.openScheme !== "string" || brand.openScheme !== brand.id ||
      RESERVED_SCHEMES.has(brand.openScheme)) return null;
  return {
    id: brand.id,
    productName: brand.productName.trim(),
    openUrl: `${brand.openScheme}://open`,
  };
}

export function readLocalExportBrandId(): string | null {
  const id = document
    .querySelector<HTMLMetaElement>(`meta[name="${LOCAL_BRAND_META_NAME}"]`)
    ?.content.trim();
  if (!id || !BRAND_ID_PATTERN.test(id) || RESERVED_SCHEMES.has(id)) return null;
  return id;
}

export function publicShareBrandIcon(id: string): string {
  if (id === "zenmind") return zenmindIcon;
  if (id === "cutej") return cutejIcon;
  return defaultIcon;
}

export function applyConversationExportFavicon(brandId: string | null): void {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[${BRAND_FAVICON_ATTRIBUTE}]`);
  if (!brandId) {
    existing?.remove();
    return;
  }
  const favicon = existing || document.createElement("link");
  favicon.rel = "icon";
  favicon.type = "image/svg+xml";
  favicon.href = publicShareBrandIcon(brandId);
  favicon.setAttribute(BRAND_FAVICON_ATTRIBUTE, brandId);
  if (!existing) document.head.append(favicon);
}

export function applyPublicShareFavicon(brand: PublicShareBrand | null): void {
  applyConversationExportFavicon(brand?.id || null);
}
