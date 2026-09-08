/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dropdown, message } from "antd";
import { ViewerTabContextMenu } from "./ViewerTabContextMenu";
import { openStandaloneViewerTarget } from "@/features/viewers/lib/viewerRuntime";
import type { ViewerTarget } from "@/features/viewers/lib/viewerTarget";
import { canUseStandaloneFileActions, getStandaloneFileCapabilities } from "@/shared/data/standalone/standaloneFileActions";
import { isAppMode } from "@/shared/utils/routing";
import { I18nProvider } from "@/shared/i18n";

jest.mock("antd", () => ({ Dropdown: jest.fn(({ children }) => children), message: { error: jest.fn() } }));
jest.mock("@/shared/utils/routing", () => ({ isAppMode: jest.fn() }));
jest.mock("@/features/viewers/lib/viewerRuntime", () => ({ openStandaloneViewerTarget: jest.fn() }));
jest.mock("@/shared/data/standalone/standaloneFileActions", () => ({
  canUseStandaloneFileActions: jest.fn(), getStandaloneFileCapabilities: jest.fn(),
}));

const target: ViewerTarget = {
  type: "resource", name: "客户服务运营手册.docx", url: "artifacts/run-1/manual.docx",
  downloadUrl: "artifacts/run-1/manual.docx", contentKind: "office",
};
const capabilities = { token: "token", platform: "darwin" as const, maxBytes: 1024 };
const callbacks = { onDownload: jest.fn(), onFullscreen: jest.fn(), onClose: jest.fn() };
function dropdown() { return jest.mocked(Dropdown).mock.calls.at(-1)![0]; }
function items() {
  return dropdown().menu!.items as Array<{
    key: string; label: string; disabled?: boolean; title?: string; onClick: () => void;
  }>;
}
function item(key: string) { return items().find((entry) => entry.key === key)!; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("standalone viewer tab menu", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    jest.mocked(isAppMode).mockReturnValue(false);
    jest.mocked(canUseStandaloneFileActions).mockReturnValue(true);
    jest.mocked(getStandaloneFileCapabilities).mockReset().mockResolvedValue(capabilities);
    jest.mocked(openStandaloneViewerTarget).mockReset().mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  });
  async function render(nextTarget = target, chatId = "chat-1") {
    await act(async () => root.render(React.createElement(
      I18nProvider, { locale: "zh-CN", persistLocale: false },
      React.createElement(ViewerTabContextMenu, {
        ...callbacks, target: nextTarget, chatId, teamChat: true,
        children: React.createElement("span", null, nextTarget.name),
      }),
    )));
  }
  async function openMenu(open = true) {
    await act(async () => dropdown().onOpenChange!(open, { source: "trigger" }));
  }

  it("shows actions in standalone without a Desktop bridge and enables them after connecting", async () => {
    const checking = deferred<typeof capabilities>();
    jest.mocked(getStandaloneFileCapabilities).mockReturnValue(checking.promise);
    await render();
    await openMenu();
    expect(items().map((entry) => entry.key)).toEqual(["download", "reveal", "open-default", "fullscreen", "close"]);
    expect(item("reveal").disabled).toBe(true);
    expect(item("reveal").title).toContain("正在连接");
    await act(async () => checking.resolve(capabilities));
    expect(item("reveal").label).toBe("在 Finder 中显示");
    expect(item("open-default").label).toBe("用默认应用打开");
    expect(item("reveal").disabled).toBe(false);
    expect(item("reveal").title).toContain("本地副本");
    for (const action of ["reveal", "open-default"]) {
      await act(async () => item(action).onClick());
      expect(openStandaloneViewerTarget).toHaveBeenLastCalledWith(action, target, { chatId: "chat-1", teamChat: true }, capabilities);
    }
    ["download", "fullscreen", "close"].forEach((key) => item(key).onClick());
    Object.values(callbacks).forEach((callback) => expect(callback).toHaveBeenCalledTimes(1));
  });

  it.each(["win32", "linux"] as const)("uses the service platform %s for the label", async (platform) => {
    jest.mocked(getStandaloneFileCapabilities).mockResolvedValue({ ...capabilities, platform });
    await render();
    await openMenu();
    expect(item("reveal").label).toBe(platform === "win32" ? "在文件资源管理器中显示" : "在文件管理器中显示");
  });

  it("leaves Desktop native actions alone", async () => {
    jest.mocked(isAppMode).mockReturnValue(true);
    jest.mocked(canUseStandaloneFileActions).mockReturnValue(false);
    await render();
    await openMenu();
    expect(items().map((entry) => entry.key)).toEqual(["download", "fullscreen", "close"]);
    expect(getStandaloneFileCapabilities).not.toHaveBeenCalled();
  });

  it("keeps actions visible with an explanation if the service needs restarting", async () => {
    jest.mocked(getStandaloneFileCapabilities).mockResolvedValueOnce(null);
    await render();
    await openMenu();
    expect(item("reveal").disabled).toBe(true);
    expect(item("reveal").title).toContain("重启");
    await act(async () => item("reveal").onClick());
    expect(openStandaloneViewerTarget).not.toHaveBeenCalled();
    await openMenu(false);
    await openMenu();
    expect(item("reveal").disabled).toBe(false);
  });

  it("explains remote browser limitations without hiding the menu", async () => {
    jest.mocked(canUseStandaloneFileActions).mockReturnValue(false);
    await render();
    await openMenu();
    expect(item("reveal").disabled).toBe(true);
    expect(item("reveal").title).toContain("localhost");
    expect(getStandaloneFileCapabilities).not.toHaveBeenCalled();
  });

  it("opens the selected workspace file and chat after switching targets", async () => {
    await render();
    await openMenu();
    const nextTarget: ViewerTarget = { type: "file", agentKey: "coder", path: "report.docx", name: "report.docx", contentKind: "office" };
    await render(nextTarget, "chat-2");
    await act(async () => item("open-default").onClick());
    expect(openStandaloneViewerTarget).toHaveBeenCalledWith("open-default", nextTarget, { chatId: "chat-2", teamChat: true }, capabilities);
  });

  it("ignores a late capability response after closing the menu", async () => {
    const checking = deferred<typeof capabilities>();
    jest.mocked(getStandaloneFileCapabilities).mockReturnValue(checking.promise);
    await render();
    await openMenu();
    await openMenu(false);
    await act(async () => checking.resolve(capabilities));
    expect(item("reveal").disabled).toBe(true);
  });

  it("prevents duplicate opens and reports errors", async () => {
    const action = deferred<void>();
    jest.mocked(openStandaloneViewerTarget).mockReturnValueOnce(action.promise);
    await render();
    await openMenu();
    await act(async () => { item("reveal").onClick(); item("open-default").onClick(); });
    expect(openStandaloneViewerTarget).toHaveBeenCalledTimes(1);
    expect(item("open-default").disabled).toBe(true);
    await act(async () => action.resolve());
    expect(item("open-default").disabled).toBe(false);
    jest.mocked(openStandaloneViewerTarget).mockRejectedValueOnce(new Error("file not found"));
    await act(async () => item("open-default").onClick());
    expect(message.error).toHaveBeenCalledWith("file not found");
  });
});
