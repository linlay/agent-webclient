import type { KnowledgeBase, KnowledgeCollection } from "@/shared/data/api/dto/kbases";

export function libraryCollections(library: KnowledgeBase): KnowledgeCollection[] {
 return library.collections?.length ? library.collections : library.sourcePath ? [{ name: "workspace", sourcePath: library.sourcePath }] : [];
}

export function documentSource(document: { file: string; collection?: string; relativePath?: string }) {
 const match = /^kbx:\/\/([^/]+)\/(.+)$/.exec(document.file);
 return { collection: document.collection || match?.[1] || "", relativePath: document.relativePath || match?.[2] || document.file };
}
