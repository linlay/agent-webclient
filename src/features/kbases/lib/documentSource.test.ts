import { collectionNameFromPath, documentSource, libraryCollections } from "./documentSource";
import type { KnowledgeBase } from "@/shared/data/api/dto/kbases";

it("distinguishes same-named documents in different collections and preserves nested paths", () => {
 expect(documentSource({ file: "kbx://reports/2026/季度报告.md" })).toEqual({ collection: "reports", relativePath: "2026/季度报告.md" });
 expect(documentSource({ file: "kbx://docs/2026/季度报告.md" })).toEqual({ collection: "docs", relativePath: "2026/季度报告.md" });
});

it("keeps existing single-source libraries under workspace", () => {
 expect(libraryCollections({ sourcePath: "/existing/docs" } as KnowledgeBase)).toEqual([{ name: "workspace", sourcePath: "/existing/docs" }]);
});

it("suggests a valid collection name from a picked source directory", () => {
 expect(collectionNameFromPath("/Users/demo/产品文档")).toBe("产品文档");
 expect(collectionNameFromPath("/srv/docs/API reference/")).toBe("API-reference");
 expect(collectionNameFromPath("C:\\work\\release notes 2026")).toBe("release-notes-2026");
 expect(collectionNameFromPath("/srv/docs/__2026_notes")).toBe("2026_notes");
});

it("suggests no collection name when the directory basename is unusable", () => {
 expect(collectionNameFromPath("")).toBe("");
 expect(collectionNameFromPath("/")).toBe("");
 expect(collectionNameFromPath("/srv/---")).toBe("");
 expect(collectionNameFromPath(`/srv/${"a".repeat(80)}`)).toHaveLength(64);
});
