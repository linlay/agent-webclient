import {
  defaultDocumentViewMode,
  documentSaveModes,
  documentViewModes,
  findPreviewSelectionSourceRange,
  preferredDocumentSaveMode,
} from "@/features/viewers/components/DocumentTextEditor";

describe("DocumentTextEditor", () => {
  it("opens previewable documents in preview mode", () => {
    expect(defaultDocumentViewMode(true)).toBe("preview");
  });

  it("offers Markdown preview and source without split mode", () => {
    expect(documentViewModes(true)).toEqual(["preview", "source"]);
    expect(documentViewModes(false)).toEqual(["preview", "source", "split"]);
  });

  it("keeps source mode for documents without a visual preview", () => {
    expect(defaultDocumentViewMode(false)).toBe("source");
  });

  it("maps plain preview selections back to source line and columns", () => {
    expect(findPreviewSelectionSourceRange("# Title\n\nSelected text", "Selected text"))
      .toEqual({
        startLineNumber: 3,
        startColumn: 1,
        endLineNumber: 3,
        endColumn: 14,
      });
    expect(findPreviewSelectionSourceRange("**formatted**", "formatted")).toEqual({
      startLineNumber: 1,
      startColumn: 3,
      endLineNumber: 1,
      endColumn: 12,
    });
    expect(findPreviewSelectionSourceRange("repeat repeat", "repeat")).toBeNull();
  });

  it("prefers new artifacts but overwrites workspace files", () => {
    expect(documentSaveModes("artifact")).toEqual(["overwrite", "new-artifact"]);
    expect(preferredDocumentSaveMode("artifact")).toBe("new-artifact");
    expect(documentSaveModes("reference")).toEqual(["new-artifact"]);
    expect(preferredDocumentSaveMode("reference")).toBe("new-artifact");
    expect(documentSaveModes("workspace-file")).toEqual(["overwrite"]);
    expect(preferredDocumentSaveMode("workspace-file")).toBe("overwrite");
  });
});
