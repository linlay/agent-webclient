/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TextEncoder } from "node:util";
import { webcrypto } from "node:crypto";
import { MarkdownCode } from "./MarkdownCode";
import { HtmlDraftPreviewContext } from "./HtmlDraftPreviewContext";
const mockDispatch = jest.fn();
const mockError = jest.fn();
const mockOpen = jest.fn();
let mockTransport: { openHtmlDraft: typeof mockOpen } | null = { openHtmlDraft: mockOpen };
jest.mock("@/features/transport/components/RealtimeTransportProvider", () => ({ useOptionalWorkPanelTransport: () => mockTransport }));
jest.mock("@/shared/ui/markdown-code/ConversationMarkdownCode", () => ({
  ConversationMarkdownCode: ({ extraActions }: { extraActions: React.ReactNode }) => <div>{extraActions}</div>,
  getMarkdownCodeLanguage: (lang: string) => lang,
  textFromReactNode: (text: string) => text,
}));
jest.mock("@/app/state/AppContext", () => ({ useAppDispatch: () => mockDispatch, useAppState: () => ({}) }));
jest.mock("@/shared/data/desktop/desktopContextMenu", () => ({ useDesktopContextMenuTarget: () => null }));
jest.mock("antd", () => ({ App: { useApp: () => ({ message: { error: mockError } }) }, Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/shared/ui/UiButton", () => ({ UiButton: ({ onClick, children, loading }: { onClick: React.MouseEventHandler; children: React.ReactNode; loading: boolean }) => <button onClick={onClick} data-loading={loading}>{children}</button> }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, TextEncoder });
Object.defineProperty(globalThis.crypto, "subtle", { configurable: true, value: webcrypto.subtle });
const createObjectURL = jest.fn(() => "blob:preview");
Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() });
beforeEach(() => { jest.clearAllMocks(); mockTransport = { openHtmlDraft: mockOpen }; });
async function renderPreview() {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<HtmlDraftPreviewContext.Provider value={{ agentKey: "owner-agent", chatId: "owner-chat" }}><MarkdownCode block lang="html">{"<h1>Preview</h1>"}</MarkdownCode></HtmlDraftPreviewContext.Provider>));
  return { host, root, button: host.querySelector("button")!, cleanup: () => { act(() => root.unmount()); host.remove(); } };
}
test("Desktop opens the native preview with the Markdown owner's identity, without opening the old sidebar", async () => {
  mockOpen.mockResolvedValue({ ok: true });
  const view = await renderPreview();
  try {
    await act(async () => view.button.click());
    expect(mockOpen).toHaveBeenCalledWith(expect.objectContaining({ source: expect.objectContaining({ kind: "html-draft", chatId: "owner-chat", agentKey: "owner-agent" }) }));
    expect(mockDispatch).not.toHaveBeenCalled(); expect(createObjectURL).not.toHaveBeenCalled();
  } finally { view.cleanup(); }
});
test.each(["old-host", "standalone"])("%s retains the existing blob preview", async (mode) => {
  if (mode === "standalone") mockTransport = null;
  mockOpen.mockResolvedValue(null);
  const view = await renderPreview();
  try { await act(async () => view.button.click()); expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "OPEN_RIGHT_SIDEBAR" })); expect(mockError).not.toHaveBeenCalled(); }
  finally { view.cleanup(); }
});
test("host authorization failures stop preview instead of bypassing the rejection", async () => {
  mockOpen.mockResolvedValue({ ok: false, error: { code: "capability_denied" } });
  const view = await renderPreview();
  try { await act(async () => view.button.click()); expect(mockError).toHaveBeenCalled(); expect(mockDispatch).not.toHaveBeenCalled(); expect(createObjectURL).not.toHaveBeenCalled(); }
  finally { view.cleanup(); }
});
test("repeated clicks while an open is pending submit only one request", async () => {
  let resolve!: (value: unknown) => void;
  mockOpen.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const view = await renderPreview();
  try {
    await act(async () => { view.button.click(); view.button.click(); });
    expect(mockOpen).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true }));
  } finally { view.cleanup(); }
});


test("unmounting while the host request is pending prevents late browser fallback", async () => {
  let resolve!: (value: unknown) => void;
  mockOpen.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const view = await renderPreview();
  await act(async () => view.button.click());
  expect(mockOpen).toHaveBeenCalledTimes(1);
  view.cleanup();
  await act(async () => resolve(null));
  expect(mockDispatch).not.toHaveBeenCalled();
  expect(createObjectURL).not.toHaveBeenCalled();
});
