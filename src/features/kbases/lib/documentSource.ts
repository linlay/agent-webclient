import type { KnowledgeBase, KnowledgeCollection } from "@/shared/data/api/dto/kbases";
import { pathNameFromPath } from "@/shared/utils/pathName";

export const COLLECTION_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,63}$/u;

/**
 * Suggests a collection name for a picked source directory. The directory
 * basename is reduced to the characters a collection name allows, so a name
 * such as "My Docs" becomes "My-Docs"; an unusable basename yields "".
 */
export function collectionNameFromPath(path: string): string {
  const sanitized = pathNameFromPath(path)
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .slice(0, 64)
    .replace(/[-_]+$/u, "");
  return COLLECTION_NAME_PATTERN.test(sanitized) ? sanitized : "";
}

export function libraryCollections(library: KnowledgeBase): KnowledgeCollection[] {
 return library.collections?.length ? library.collections : library.sourcePath ? [{ name: "workspace", sourcePath: library.sourcePath }] : [];
}

export function documentSource(document: { file: string; collection?: string; relativePath?: string }) {
 const match = /^kbx:\/\/([^/]+)\/(.+)$/.exec(document.file);
 return { collection: document.collection || match?.[1] || "", relativePath: document.relativePath || match?.[2] || document.file };
}
