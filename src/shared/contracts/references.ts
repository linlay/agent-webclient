export function readReferenceUrl(value: unknown): string {
  if (typeof value !== "string" || !/^https?:\/\/[^/]/iu.test(value) ||
      /[\s\u0000-\u001f\u007f\\<>"\x60]/u.test(value) || new TextEncoder().encode(value).length > 4096) {
    return "";
  }
  try {
    const parsed = new URL(value);
    const authority = value.slice(value.indexOf("://") + 3).split(/[/?#]/u, 1)[0];
    return parsed.hostname && !authority.includes("@") ? value : "";
  } catch {
    return "";
  }
}

export function hasUrlReference(references: readonly unknown[]): boolean {
  return references.some(reference => Boolean(reference && typeof reference === "object" &&
    "type" in reference && reference.type === "url"));
}

export type ResourceReferenceType = "skill" | "kbase" | "chat";
export function referenceIds(references: unknown, type: ResourceReferenceType): string[] {
 if (!Array.isArray(references)) return [];
 const seen = new Set<string>();
 return references.flatMap(ref => {
  if (!ref || typeof ref !== "object" || ref.type !== type || typeof ref.id !== "string") return [];
  const id = type === "skill" ? ref.id.trim().toLowerCase() : ref.id.trim();
  if (!id || seen.has(id)) return []; seen.add(id); return [id];
 });
}
export function queryReferences(references: unknown): unknown[] {
 if (!Array.isArray(references)) return [];
 const seen = new Set<string>();
 return references.flatMap(ref => {
  if (!ref || typeof ref !== "object" || ref.type === "site") return [];
  if (ref.type === "url") {
   const url = readReferenceUrl(ref.url);
   if (!url || seen.has(`url:${url}`)) return [];
   seen.add(`url:${url}`);
   return [{ type: "url", url }];
  }
  if (!["skill", "kbase", "chat"].includes(ref.type)) return [ref];
  if (typeof ref.id !== "string" || !ref.id.trim()) return [];
  const id = ref.type === "skill" ? ref.id.trim().toLowerCase() : ref.id.trim();
  const identity = `${ref.type}:${id}`; if (seen.has(identity)) return [];seen.add(identity);
  return [{type: ref.type, id}];
 });
}
