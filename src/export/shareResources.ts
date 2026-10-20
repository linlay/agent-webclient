/** Canonical current-Chat path; URLs and other scopes never alias a frozen file. */
export function canonicalChatSourceRef(value: string): string | null {
  const raw = value.startsWith("@chat/") ? value.slice(6) : value;
  if (!raw || raw.length > 2_048 || raw !== raw.trim() || /[\\?#:]/u.test(raw) || raw.startsWith("@")) return null;
  try {
    return raw.split("/").map((part) => {
      const decoded = decodeURIComponent(part);
      let check = decoded;
      for (let depth = 0; ; depth += 1) {
        if (!check || [".", "..", ".tools", ".btw", ".explain"].includes(check) || /[\\/:\u0000-\u001f\u007f]/u.test(check)) throw new Error("invalid path");
        let next: string;
        try { next = decodeURIComponent(check); } catch { break; }
        if (next === check) break;
        if (depth >= 4) throw new Error("invalid path");
        check = next;
      }
      // Match Go url.PathEscape used by the Platform and Tunnel contract.
      return encodeURIComponent(decoded).replace(/[!'()*]/gu, (char) =>
        "%" + char.charCodeAt(0).toString(16).toUpperCase()).replace(/%(24|26|2B|3D|3A|40)/gu, decodeURIComponent);
    }).join("/");
  } catch { return null; }
}

export function shareMediaKind(mimeType: string): "html" | "image" | "audio" | "video" | "unsupported" {
  const mime = mimeType.split(";", 1)[0].trim().toLowerCase();
  if (mime === "text/html") return "html";
  for (const kind of ["image", "audio", "video"] as const) if (mime.startsWith(kind + "/")) return kind;
  return "unsupported";
}
