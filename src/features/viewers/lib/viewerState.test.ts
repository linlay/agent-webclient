import { getDocumentPreviewTabKey, type DocumentPreviewTabState } from "./documentPreview";
import { getViewerTargetKey, type ViewerTarget } from "./viewerTarget";
import { createInitialViewersState, reduceViewersState } from "./viewerState";

const target: ViewerTarget = { type: "file", agentKey: "coder", path: "report.xlsx", name: "report.xlsx", contentKind: "office" };
const preview: DocumentPreviewTabState = {
  key: getDocumentPreviewTabKey(target, "chat"), target, chatId: "chat",
  result: { previewId: "p1", sourceRevision: "r1", openMode: "iframe", url: "https://docs.test/s/p1", expiresAt: 12345 },
};

test("online preview has an independent tab and reuses the original identity across document revisions", () => {
  const original = reduceViewersState(createInitialViewersState(), { type: "OPEN_RIGHT_SIDEBAR", tab: "viewer", viewerTarget: target });
  const opened = reduceViewersState(original, { type: "OPEN_DOCUMENT_PREVIEW", preview });
  expect(opened.viewerTabs).toEqual([target]);
  expect(opened.rightSidebarOpenTab).toBe("documentPreview");
  const updated = { ...preview, result: { ...preview.result, sourceRevision: "r2", url: "https://docs.test/s/p2" } };
  const reopened = reduceViewersState(opened, { type: "OPEN_DOCUMENT_PREVIEW", preview: updated });
  expect(reopened.documentPreviewTabs).toEqual([updated]);
  const closed = reduceViewersState(reopened, { type: "CLOSE_DOCUMENT_PREVIEW", key: preview.key });
  expect(closed.documentPreviewTabs).toEqual([]);
  expect(closed.viewerTabs).toEqual([target]);
  expect(closed.rightSidebarOpenTab).toBe("viewer");
  expect(closed.activeViewerKey).toBe(getViewerTargetKey(target));
});

test("different owning chats and paths have distinct preview tabs while display metadata does not change identity", () => {
  const resource: ViewerTarget = { type: "resource", name: "report.xlsx", contentKind: "office", url: "artifacts/report.xlsx", downloadUrl: "artifacts/report.xlsx" };
  expect(getDocumentPreviewTabKey(resource, "a")).not.toBe(getDocumentPreviewTabKey(resource, "b"));
  expect(getDocumentPreviewTabKey(target, "a")).toBe(getDocumentPreviewTabKey({ ...target, name: "new title" }, "b"));
  expect(getDocumentPreviewTabKey(target, "a")).not.toBe(getDocumentPreviewTabKey({ ...target, path: "other/report.xlsx" }, "a"));
});

test("preview selection and closing preserve other tabs and return to overview when the original is closed", () => {
  const opened = reduceViewersState(createInitialViewersState(), { type: "OPEN_DOCUMENT_PREVIEW", preview });
  const other = { ...preview, key: "other-source" };
  const both = reduceViewersState(opened, { type: "OPEN_DOCUMENT_PREVIEW", preview: other });
  const selected = reduceViewersState(both, { type: "ACTIVATE_DOCUMENT_PREVIEW", key: preview.key });
  expect(selected.activeDocumentPreviewKey).toBe(preview.key);
  const closedInactive = reduceViewersState(selected, { type: "CLOSE_DOCUMENT_PREVIEW", key: other.key });
  expect(closedInactive.activeDocumentPreviewKey).toBe(preview.key);
  expect(closedInactive.rightSidebarOpenTab).toBe("documentPreview");
  const lastClosed = reduceViewersState(closedInactive, { type: "CLOSE_DOCUMENT_PREVIEW", key: preview.key });
  expect(lastClosed.rightSidebarOpenTab).toBe("overview");
  expect(lastClosed.activeDocumentPreviewKey).toBe("");
});

test("VIEW tabs coexist with files, reuse their identity, and update without stealing selection", () => {
  const original = reduceViewersState(createInitialViewersState(), { type: "OPEN_RIGHT_SIDEBAR", tab: "viewer", viewerTarget: target });
  const preview = { key: "view-1", chatId: "chat", runId: "run", payloadRaw: "{}" };
  const opened = reduceViewersState(original, { type: "OPEN_VIEW_PREVIEW", preview });
  expect(opened.viewerTabs).toEqual([target]);
  expect(opened.rightSidebarOpenTab).toBe("viewPreview");
  const reopened = reduceViewersState(opened, { type: "OPEN_VIEW_PREVIEW", preview });
  expect(reopened.viewPreviews).toEqual([preview]);
  const second = reduceViewersState(reopened, { type: "OPEN_VIEW_PREVIEW", preview: { ...preview, key: "view-2" } });
  const selected = reduceViewersState(second, { type: "ACTIVATE_VIEW_PREVIEW", key: "view-1" });
  const updated = reduceViewersState(selected, { type: "UPDATE_VIEW_PREVIEW", preview: { ...preview, key: "view-2", payloadRaw: "new" } });
  expect(updated.activeViewPreviewKey).toBe("view-1");
  const closedInactive = reduceViewersState(updated, { type: "CLOSE_VIEW_PREVIEW", key: "view-2" });
  expect(closedInactive.activeViewPreviewKey).toBe("view-1");
  const closed = reduceViewersState(closedInactive, { type: "CLOSE_VIEW_PREVIEW", key: "view-1" });
  expect(closed.rightSidebarOpenTab).toBe("overview");
  expect(closed.viewerTabs).toEqual([target]);
  expect(reduceViewersState(closed, { type: "UPDATE_VIEW_PREVIEW", preview })).toBe(closed);
});
