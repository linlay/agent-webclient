import { serializeHtmlDocument } from "@/shared/utils/htmlVisualizationAssets";

export interface ShareHtmlPayload {
  html: string;
  mediaRefs: Array<[string, string]>;
  media: Array<{ id: string; type: string; bytes: ArrayBuffer }>;
  missing: Array<[string, string]>;
  unavailable: string;
}

// Follow the HTML srcset token boundaries, including commas inside data URLs.
export function mapMediaSrcset(value: string, resolve: (url: string) => string): string {
  const candidates: string[] = [];
  let rest = value;
  while (rest) {
    rest = rest.replace(/^[\s,]+/u, "");
    if (!rest) break;
    const url = /^[^\s]+/u.exec(rest)?.[0] || "";
    rest = rest.slice(url.length);
    if (url.endsWith(",")) {
      const mapped = resolve(url.replace(/,+$/u, ""));
      if (mapped) candidates.push(mapped);
      continue;
    }
    const comma = rest.indexOf(",");
    const descriptor = (comma < 0 ? rest : rest.slice(0, comma)).trim();
    rest = comma < 0 ? "" : rest.slice(comma + 1);
    const mapped = resolve(url);
    if (mapped) candidates.push(`${mapped}${descriptor ? ` ${descriptor}` : ""}`);
  }
  return candidates.join(", ");
}

export function prepareShareHtml(payload: ShareHtmlPayload, createURL: (blob: Blob) => string): string {
  const document = new DOMParser().parseFromString(payload.html, "text/html");
  const refs = new Map(payload.mediaRefs);
  const missing = new Map(payload.missing);
  const urls = new Map(payload.media.map(({ id, type, bytes }) => [id, createURL(new Blob([bytes], { type }))]));
  for (const element of document.querySelectorAll("img, audio, video, source")) {
    const reasons = new Set<string>();
    const resolve = (raw: string): string => {
      const id = refs.get(raw);
      if (id && urls.has(id)) return urls.get(id)!;
      if (!id && (/^https:\/\//iu.test(raw) || /^data:(?:image|audio|video)\//iu.test(raw))) return raw;
      reasons.add((id && missing.get(id)) || payload.unavailable);
      return "";
    };
    const attributes = element.tagName === "VIDEO" ? ["src", "poster"] :
      element.tagName === "IMG" || element.tagName === "SOURCE" ? ["src", "srcset"] : ["src"];
    for (const attribute of attributes) {
      const raw = element.getAttribute(attribute);
      if (!raw) continue;
      const value = attribute === "srcset" ? mapMediaSrcset(raw, resolve) : resolve(raw);
      if (value) element.setAttribute(attribute, value);
      else element.removeAttribute(attribute);
    }
    if (reasons.size) {
      const note = document.createElement("span");
      note.setAttribute("role", "status");
      note.textContent = [...reasons].join("; ");
      (element.tagName === "SOURCE" ? element.parentElement : element)?.after(note);
    }
  }
  return serializeHtmlDocument(document);
}
