import { documentSource, libraryCollections } from "./documentSource";
import type { KnowledgeBase } from "@/shared/data/api/dto/kbases";

it("distinguishes same-named documents in different collections and preserves nested paths", () => {
 expect(documentSource({ file: "kbx://reports/2026/季度报告.md" })).toEqual({ collection: "reports", relativePath: "2026/季度报告.md" });
 expect(documentSource({ file: "kbx://docs/2026/季度报告.md" })).toEqual({ collection: "docs", relativePath: "2026/季度报告.md" });
});

it("keeps existing single-source libraries under workspace", () => {
 expect(libraryCollections({ sourcePath: "/existing/docs" } as KnowledgeBase)).toEqual([{ name: "workspace", sourcePath: "/existing/docs" }]);
});
