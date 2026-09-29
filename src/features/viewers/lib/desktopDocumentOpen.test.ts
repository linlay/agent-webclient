/** @jest-environment jsdom */
import type { WorkPanelDocumentSource } from "@/shared/contracts/generated/agentWebclientBridge";
import { readDesktopBridges } from "@/features/transport/lib/desktopBridge";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { configureI18nRuntime } from "@/shared/i18n";
import {
  getDesktopDocumentOpenOptions, isDesktopLocalOpenDocument, openDesktopDocumentCopy,
  resolveDesktopDocumentSource,
} from "./desktopDocumentOpen";

jest.mock("@/features/transport/lib/desktopBridge", () => ({ readDesktopBridges: jest.fn() }));
jest.mock("@/shared/utils/routing", () => ({ isDesktopAppMode: jest.fn(() => true) }));

const source: WorkPanelDocumentSource = { kind: "workspace-file", agentKey: "coder", path: "slides/方案.pptx" };
const applications = [{ id: "opaque-powerpoint", name: "Microsoft PowerPoint", isDefault: true }];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Desktop document copy bridge", () => {
  const bridge = () => ({
    getCapabilities: jest.fn(async () => ({ ok: true, capabilities: ["workpanel.document.open-local"] })),
    getDocumentOpenOptions: jest.fn(async () => ({ ok: true, applications })),
    openDocumentCopy: jest.fn(async () => ({ ok: true, status: "launch-requested" })),
  });
  let host: ReturnType<typeof bridge>;
  beforeEach(() => {
    jest.clearAllMocks();
    configureI18nRuntime({ locale: "zh-CN" });
    jest.mocked(isDesktopAppMode).mockReturnValue(true);
    host = bridge();
    jest.mocked(readDesktopBridges).mockReturnValue({ workPanel: host } as never);
  });
  afterEach(() => jest.useRealTimers());

  it.each(["PPT", "pptx", "doc", "DOCX", "xls", "xlsx", "pdf", "PDF"])("supports the %s extension", (extension) => {
    expect(isDesktopLocalOpenDocument(`file.${extension}`)).toBe(true);
  });
  it.each(["docm", "pptm", "xlsm", "html", "zip", "pptx.exe"])("does not opt in %s", (extension) => {
    expect(isDesktopLocalOpenDocument(`file.${extension}`)).toBe(false);
  });
  it("uses semantic source identity without guessing a resource from its URL", () => {
    expect(resolveDesktopDocumentSource({ type: "file", name: "方案.pptx", contentKind: "office", agentKey: "coder", path: "slides/方案.pptx" })).toEqual(source);
    const resource = { kind: "reference" as const, agentKey: "coder", chatId: "chat-1", resourceId: "ref-1", relativePath: "方案.pptx" };
    expect(resolveDesktopDocumentSource({ type: "resource", name: "方案.pptx", contentKind: "office", url: "方案.pptx", downloadUrl: "方案.pptx", source: resource })).toEqual(resource);
    expect(resolveDesktopDocumentSource({ type: "resource", name: "方案.pptx", contentKind: "office", url: "https://example.test/方案.pptx", downloadUrl: "https://example.test/方案.pptx" })).toBeNull();
  });
  it("does not invoke native methods in Standalone", async () => {
    jest.mocked(isDesktopAppMode).mockReturnValue(false);
    expect(await getDesktopDocumentOpenOptions(source)).toEqual({ available: false });
    expect(readDesktopBridges).not.toHaveBeenCalled();
    await expect(openDesktopDocumentCopy(source, applications[0].id)).rejects.toThrow();
    expect(host.getCapabilities).not.toHaveBeenCalled();
  });
  it("requires both new methods and the dedicated capability", async () => {
    jest.mocked(readDesktopBridges).mockReturnValue({ workPanel: { ...host, openDocumentCopy: undefined } } as never);
    expect(await getDesktopDocumentOpenOptions(source)).toEqual({ available: false });
    expect(host.getCapabilities).not.toHaveBeenCalled();
    jest.mocked(readDesktopBridges).mockReturnValue({ workPanel: host } as never);
    host.getCapabilities.mockResolvedValue({ ok: true, capabilities: ["workpanel.open"] });
    expect(await getDesktopDocumentOpenOptions(source)).toEqual({ available: false });
    expect(host.getDocumentOpenOptions).not.toHaveBeenCalled();
    await expect(openDesktopDocumentCopy(source, applications[0].id)).rejects.toThrow();
    expect(host.openDocumentCopy).not.toHaveBeenCalled();
  });
  it("coalesces concurrent queries for the same source without caching completed results", async () => {
    const gate = deferred<{ ok: boolean; applications: typeof applications }>();
    host.getDocumentOpenOptions.mockReturnValueOnce(gate.promise);
    const first = getDesktopDocumentOpenOptions(source);
    const second = getDesktopDocumentOpenOptions({ ...source });
    expect(second).toBe(first);
    await Promise.resolve();
    expect(host.getDocumentOpenOptions).toHaveBeenCalledTimes(1);
    expect(host.getDocumentOpenOptions).toHaveBeenCalledWith({ version: 6, source });
    gate.resolve({ ok: true, applications });
    expect(await first).toEqual({ available: true, applications });
    await getDesktopDocumentOpenOptions(source);
    expect(host.getDocumentOpenOptions).toHaveBeenCalledTimes(2);
  });
  it("distinguishes an empty application list from a failed host query", async () => {
    host.getDocumentOpenOptions.mockResolvedValueOnce({ ok: true, applications: [] });
    expect(await getDesktopDocumentOpenOptions(source)).toEqual({ available: true, applications: [] });
    host.getDocumentOpenOptions.mockResolvedValueOnce({ ok: false, error: { code: "local_app_query_failed", message: "Detection failed" } } as never);
    expect(await getDesktopDocumentOpenOptions(source)).toEqual({ available: true, applications: [], error: "无法检测本机应用" });
  });
  it("retries the bounded initial Surface registration race before querying applications", async () => {
    jest.useFakeTimers();
    host.getCapabilities.mockResolvedValueOnce({ ok: false, error: { code: "surface_unavailable", message: "Registering" } } as never);
    const pending = getDesktopDocumentOpenOptions(source);
    await jest.advanceTimersByTimeAsync(150);
    expect(await pending).toEqual({ available: true, applications });
    expect(host.getCapabilities).toHaveBeenCalledTimes(2);
    expect(host.getDocumentOpenOptions).toHaveBeenCalledTimes(1);
  });
  it("keeps failed capability discovery retryable instead of silently hiding the action", async () => {
    jest.useFakeTimers();
    host.getCapabilities.mockResolvedValue({ ok: false, error: { code: "surface_unavailable", message: "Surface unavailable" } } as never);
    const pending = getDesktopDocumentOpenOptions(source);
    await jest.advanceTimersByTimeAsync(500);
    expect(await pending).toEqual({ available: true, applications: [], error: "当前文档已不可用或无权访问，请重新打开文档后重试。" });
    expect(host.getCapabilities).toHaveBeenCalledTimes(3);
    expect(host.getDocumentOpenOptions).not.toHaveBeenCalled();
    host.getCapabilities.mockRejectedValueOnce(new Error("IPC unavailable"));
    expect(await getDesktopDocumentOpenOptions(source)).toEqual({ available: true, applications: [], error: "无法检测本机应用" });
  });
  it("localizes application-query failures using the current English locale", async () => {
    configureI18nRuntime({ locale: "en-US" });
    host.getDocumentOpenOptions.mockResolvedValueOnce({ ok: false, error: { code: "local_app_query_failed", message: "Host-internal detection failure" } } as never);
    expect(await getDesktopDocumentOpenOptions(source)).toEqual({ available: true, applications: [], error: "Could not detect local applications" });
  });
  it("keeps the save dialog pending beyond the former 10-second timeout and coalesces duplicate opens", async () => {
    jest.useFakeTimers();
    const gate = deferred<{ ok: boolean; status: string }>();
    host.openDocumentCopy.mockReturnValueOnce(gate.promise);
    let settled = false;
    const first = openDesktopDocumentCopy(source, applications[0].id);
    void first.then(() => { settled = true; });
    const duplicate = openDesktopDocumentCopy({ ...source }, "another-opaque-id");
    expect(duplicate).toBe(first);
    await Promise.resolve();
    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(host.openDocumentCopy).toHaveBeenCalledTimes(1);
    expect(host.openDocumentCopy).toHaveBeenCalledWith({ version: 6, source, applicationId: applications[0].id });
    gate.resolve({ ok: true, status: "cancelled" });
    expect(await first).toEqual({ ok: true, status: "cancelled" });
  });
});
