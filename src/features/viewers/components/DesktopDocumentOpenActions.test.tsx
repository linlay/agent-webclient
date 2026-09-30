/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { DESKTOP_LIVE_SURFACE_ACTIVE_EVENT } from "@/shared/data/desktop/desktopSurfaceLifecycle";
import type { WorkPanelLocalApplication } from "@/shared/contracts/generated/agentWebclientBridge";
import { getDesktopDocumentOpenOptions, openDesktopDocumentInLocalApp } from "../lib/desktopDocumentOpen";
import type { ViewerTarget } from "../lib/viewerTarget";
import { DesktopDocumentOpenActions } from "./DesktopDocumentOpenActions";

jest.mock("@/shared/utils/routing", () => ({ isDesktopAppMode: jest.fn(() => true) }));
jest.mock("../lib/desktopDocumentOpen", () => ({
  ...jest.requireActual("../lib/desktopDocumentOpen"),
  getDesktopDocumentOpenOptions: jest.fn(), openDesktopDocumentInLocalApp: jest.fn(),
}));

const target: ViewerTarget = { type: "file", agentKey: "coder", path: "报告.pptx", name: "报告.pptx", contentKind: "office" };
const keynote: WorkPanelLocalApplication = { id: "app-keynote", name: "Keynote", isDefault: true, iconDataUrl: "data:image/png;base64,aWNvbg==" };
const powerpoint: WorkPanelLocalApplication = { id: "app-powerpoint", name: "Microsoft PowerPoint", isDefault: false };
const word: WorkPanelLocalApplication = { id: "app-word", name: "Microsoft Word", isDefault: true };
const options = (applications: WorkPanelLocalApplication[]) => ({ available: true as const, applications });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Desktop document application actions", () => {
  let root: Root, container: HTMLDivElement;
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    jest.mocked(isDesktopAppMode).mockReturnValue(true);
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValue(options([keynote, powerpoint]));
    jest.mocked(openDesktopDocumentInLocalApp).mockResolvedValue({ ok: true, status: "launch-requested" });
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); jest.useRealTimers(); jest.restoreAllMocks();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  });
  async function render(file = target, refreshKey = 0, locale: "zh-CN" | "en-US" = "zh-CN") {
    await act(async () => root.render(React.createElement(I18nProvider, { locale, persistLocale: false },
      React.createElement(DesktopDocumentOpenActions, { target: file, refreshKey }))));
  }
  function buttons() { return Array.from(container.querySelectorAll("button")); }
  async function click(text: string) {
    const button = buttons().find((item) => item.textContent?.replace(/\s/g, "") === text.replace(/\s/g, ""));
    expect(button).toBeDefined(); await act(async () => button!.click());
  }

  it("shows the actual default application and its icon, then reports only a launch request", async () => {
    await render();
    expect(container.textContent).toContain("用 Keynote 打开");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(keynote.iconDataUrl);
    expect(container.textContent).not.toContain("另存");
    expect(container.textContent).not.toContain("副本");
    expect(container.querySelector('button[aria-label="选择应用打开"]')).not.toBeNull();
    await click("用 Keynote 打开");
    expect(openDesktopDocumentInLocalApp).toHaveBeenCalledWith({ kind: "workspace-file", agentKey: "coder", path: "报告.pptx" }, keynote.id);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("已请求在 Keynote 中打开。");
  });
  it("requires an explicit selection when several applications have no default", async () => {
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValue(options([{ ...keynote, isDefault: false }, powerpoint]));
    await render();
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0].textContent).toBe("选择应用打开");
    await click("选择应用打开");
    expect(openDesktopDocumentInLocalApp).not.toHaveBeenCalled();
    const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((entry) => entry.textContent === "Microsoft PowerPoint");
    expect(item).toBeDefined();
    await act(async () => (item as HTMLElement).click());
    expect(openDesktopDocumentInLocalApp).toHaveBeenCalledWith(expect.any(Object), powerpoint.id);
  });
  it("uses the only candidate even if the operating system has no default", async () => {
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValue(options([powerpoint]));
    await render();
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0].textContent).toBe("用 PowerPoint 打开");
  });
  it("distinguishes no application from query failure and offers a new query", async () => {
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValueOnce(options([]));
    await render();
    expect(container.textContent).toContain("未找到可用的本机应用");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValueOnce({ available: true, applications: [], error: "系统应用查询失败" });
    await click("重新检测");
    expect(container.textContent).toContain("无法检测本机应用");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("系统应用查询失败");
  });
  it("refreshes applications when focus returns", async () => {
    await render();
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValueOnce(options([{ ...powerpoint, isDefault: true }]));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(getDesktopDocumentOpenOptions).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("用 PowerPoint 打开");
    expect(container.textContent).not.toContain("Keynote");
  });
  it("keeps a known application stable and clickable during a background focus refresh", async () => {
    await render();
    const gate = deferred<ReturnType<typeof options>>();
    jest.mocked(getDesktopDocumentOpenOptions).mockReturnValueOnce(gate.promise);
    await act(async () => window.dispatchEvent(new Event("focus")));
    const button = buttons()[0];
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("title")).toBeNull();
    expect(button.querySelector('[aria-label="loading"]')).toBeNull();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await click("用 Keynote 打开");
    expect(openDesktopDocumentInLocalApp).toHaveBeenCalledWith(expect.any(Object), keynote.id);
    await act(async () => gate.resolve(options([keynote, powerpoint])));
  });
  it("recovers a failed discovery when the registered document Surface becomes active", async () => {
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValueOnce({ available: true, applications: [], error: "当前文档已不可用或无权访问，请重新打开文档后重试。" });
    await render();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => window.dispatchEvent(new CustomEvent(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, { detail: { active: true } })));
    expect(container.textContent).toContain("用 Keynote 打开");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("ignores a former document's late query response", async () => {
    const gate = deferred<ReturnType<typeof options>>();
    jest.mocked(getDesktopDocumentOpenOptions).mockReturnValueOnce(gate.promise);
    await render();
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValueOnce(options([word]));
    await render({ ...target, name: "other.docx", path: "other.docx" });
    await act(async () => gate.resolve(options([keynote])));
    expect(container.textContent).toContain("用 Word 打开");
    expect(container.textContent).not.toContain("Keynote");
  });
  it("keeps host preparation pending, blocks repeated clicks, and treats cancellation normally", async () => {
    jest.useFakeTimers();
    const gate = deferred<{ ok: true; status: "cancelled" }>();
    jest.mocked(openDesktopDocumentInLocalApp).mockReturnValueOnce(gate.promise);
    await render();
    const primary = buttons()[0];
    await act(async () => { primary.click(); primary.click(); });
    expect(openDesktopDocumentInLocalApp).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(buttons().every((button) => button.disabled)).toBe(true);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => gate.resolve({ ok: true, status: "cancelled" }));
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(buttons()[0].disabled).toBe(false);
  });
  it.each([
    ["local_app_query_failed", "无法检测本机应用"],
    ["local_app_unavailable", "所选应用已不可用，请重新检测并选择应用。"],
    ["target_unavailable", "当前文档已不可用或无权访问，请重新打开文档后重试。"],
    ["capability_denied", "当前文档已不可用或无权访问，请重新打开文档后重试。"],
    ["document_save_failed", "无法准备本机打开所需的文件，请重试。"],
    ["unsupported_document_type", "文件内容与受支持的文档类型不匹配，无法使用本机应用打开。"],
    ["application_launch_failed", "无法启动所选应用，请重试或选择其他应用。"],
    ["duplicate_id", "当前文档已有打开操作进行中，请完成或取消该操作后再试。"],
  ] as const)("shows localized %s without passing through the host message", async (code, expected) => {
    jest.mocked(openDesktopDocumentInLocalApp).mockResolvedValueOnce({ ok: false, error: { code, message: "Choose a separate copy outside private storage /host-only/path" } });
    await render(); await click("用 Keynote 打开");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(expected);
    expect(container.textContent).not.toContain("Choose a separate copy");
    expect(container.textContent).not.toContain("/host-only/path");
    expect(container.textContent).not.toContain("副本");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
  it("uses a localized fallback for an unstructured native rejection", async () => {
    jest.mocked(openDesktopDocumentInLocalApp).mockRejectedValueOnce(new Error("Raw IPC failure /host-only/path"));
    await render(); await click("用 Keynote 打开");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("无法打开当前文档，请重试。");
    expect(container.textContent).not.toContain("Raw IPC");
    expect(container.textContent).not.toContain("/host-only/path");
  });
  it("uses the English locale for a preparation failure without promising a saved copy", async () => {
    jest.mocked(openDesktopDocumentInLocalApp).mockResolvedValueOnce({ ok: false, error: { code: "document_save_failed", message: "Host-only raw error" } });
    await render(target, 0, "en-US"); await click("Open in Keynote");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("The file could not be prepared for opening in a local application. Try again.");
    expect(container.textContent).not.toContain("Host-only raw error");
  });
  it.each(["ppt", "pptx", "doc", "docx", "xls", "xlsx", "pdf"])("uses the same narrow action for %s references", async (extension) => {
    const name = `upload.${extension}`;
    const source = { kind: "reference" as const, agentKey: "a", chatId: "c", resourceId: "r", relativePath: name };
    await render({ type: "resource", name, url: name, downloadUrl: name, contentKind: extension === "pdf" ? "pdf" : "office", source });
    expect(getDesktopDocumentOpenOptions).toHaveBeenCalledWith(source);
  });
  it("stays absent for unavailable capability, Standalone, other formats and identity-less resources", async () => {
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValueOnce({ available: false });
    await render(); expect(container.textContent).toBe("");
    jest.clearAllMocks();
    jest.mocked(isDesktopAppMode).mockReturnValue(false);
    await render(); expect(getDesktopDocumentOpenOptions).not.toHaveBeenCalled();
    jest.mocked(isDesktopAppMode).mockReturnValue(true);
    await render({ ...target, name: "notes.txt", path: "notes.txt", contentKind: "text" });
    await render({ type: "resource", name: "legacy.pptx", url: "artifacts/legacy.pptx", downloadUrl: "artifacts/legacy.pptx", contentKind: "office" });
    expect(getDesktopDocumentOpenOptions).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });
});
