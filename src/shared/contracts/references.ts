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
  if (!ref || typeof ref !== "object") return [];
  if (!["skill", "kbase", "chat"].includes(ref.type)) return [ref];
  if (typeof ref.id !== "string" || !ref.id.trim()) return [];
  const id = ref.type === "skill" ? ref.id.trim().toLowerCase() : ref.id.trim();
  const identity = `${ref.type}:${id}`; if (seen.has(identity)) return [];seen.add(identity);
  return [{type: ref.type, id}];
 });
}
