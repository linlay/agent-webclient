/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShareAttachmentViewer } from "./ShareAttachmentViewer";
import { ShareAttachmentPage } from "./ShareAttachmentPage";
import { buildShareAttachmentLinks } from "./shareAttachmentLinks";
import type { ConversationSnapshotV1, SnapshotAttachmentV1 } from "./conversationSnapshotV1";
import { copyWebText } from "@/shared/utils/webClipboard";

jest.mock("@/shared/utils/webClipboard", () => ({ copyWebText: jest.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const files: SnapshotAttachmentV1[] = [
  { id: "0123456789abcdef01234567", name: "报告 v1.html", mimeType: "text/html", sourceRef: "v1.html" },
  { id: "abcdef0123456789abcdef01", name: "报告 v2.html", mimeType: "text/html", sourceRef: "v2.html" },
  { id: "fedcba9876543210fedcba98", name: "报告.pdf", mimeType: "application/pdf", sourceRef: "report.pdf" },
];
const sharePath = "/share/share-1";
let host: HTMLDivElement;
let root: Root;
const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
const click = (name: string) => act(() => button(name).click());
const fileButton = () => host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
const selectFile = (id: string) => {
  act(() => fileButton().click());
  act(() => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((item) => item.getAttribute("data-menu-id")?.endsWith(id))!.click());
};

beforeEach(() => {
  jest.mocked(copyWebText).mockReset().mockResolvedValue();
  window.history.replaceState({}, "", sharePath);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

function Viewer({ attachments = files, canReshare = true }: { attachments?: SnapshotAttachmentV1[]; canReshare?: boolean }) {
  const [id, setId] = React.useState(attachments[0].id);
  return <ShareAttachmentViewer attachments={attachments} selectedId={id} onSelect={setId}
    links={buildShareAttachmentLinks(sharePath, id, window.location.origin)} locale="zh-CN" canReshare={canReshare} />;
}

it("selects files without a previous/next row and offers unsupported files for download", () => {
  act(() => root.render(<Viewer />));
  expect(host.querySelector("nav")).toBeNull();
  expect(host.textContent).not.toContain("上一个");
  expect(host.textContent).not.toContain("下一个");
  expect(host.textContent).not.toContain("1 / 3");
  expect(host.querySelector("iframe")?.title).toBe(files[0].name);
  const firstFrame = host.querySelector("iframe");
  selectFile(files[1].id);
  expect(host.querySelector("iframe")?.title).toBe(files[1].name);
  expect(host.querySelector("iframe")).not.toBe(firstFrame);
  selectFile(files[2].id);
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.textContent).toContain("此类型暂不支持在线预览");
  expect(host.querySelector('a[aria-label="下载"]')?.getAttribute("href")).toContain(`${files[2].id}/download`);
  selectFile(files[0].id);
  expect(host.querySelector("iframe")?.title).toBe(files[0].name);
  expect(host.querySelector("iframe")?.getAttribute("sandbox")).toBe("");
  expect(host.querySelector("iframe")?.getAttribute("referrerpolicy")).toBe("no-referrer");
});

it("omits navigation for a single file and disables resharing when not allowed", () => {
  act(() => root.render(<Viewer attachments={[files[0]]} canReshare={false} />));
  expect(fileButton()).toBeNull();
  expect(host.querySelector("header strong")?.textContent).toBe(files[0].name);
  expect(host.querySelector("header strong")?.getAttribute("tabindex")).toBe("0");
  expect(host.querySelector("nav")).toBeNull();
  expect(button("分享链接").disabled).toBe(true);
  expect(button("分享链接").getAttribute("aria-description")).toContain("一次性分享不支持转发");
  expect(host.querySelector("header")?.textContent).not.toContain("一次性分享不支持转发");
  click("分享链接");
  expect(copyWebText).not.toHaveBeenCalled();
});

it("keeps long filenames intact in the title and menu, marks the selection, and scopes Escape to the menu", () => {
  const longFiles = [
    { ...files[0], name: `${"会议纪要与服务上线计划".repeat(15)}-v1.html` },
    { ...files[1], name: `${"会议纪要与服务上线计划".repeat(15)}-v2.html` },
    { ...files[2], name: `${"ContinuousFilename".repeat(30)}.pdf` },
  ];
  const onEscape = jest.fn();
  document.addEventListener("keydown", onEscape);
  try {
    act(() => root.render(<Viewer attachments={longFiles} />));
    const title = fileButton();
    expect(title.textContent).toBe(longFiles[0].name);
    expect(title.getAttribute("aria-label")).toContain(longFiles[0].name);
    expect(document.activeElement).not.toBe(title);
    act(() => title.click());
    expect(title.getAttribute("aria-expanded")).toBe("true");
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items.map((item) => item.textContent)).toEqual(longFiles.map((item) => item.name));
    expect(items[0].getAttribute("aria-current")).toBe("true");
    expect(items[1].hasAttribute("aria-current")).toBe(false);
    const frame = host.querySelector("iframe");
    act(() => items[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })));
    expect(onEscape).not.toHaveBeenCalled();
    expect(title.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(title);
    expect(host.querySelector("iframe")).toBe(frame);
    act(() => title.click());
    const second = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.getAttribute("aria-label") === longFiles[1].name)!;
    const selection = new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true, cancelable: true });
    act(() => second.dispatchEvent(selection));
    expect(selection.defaultPrevented).toBe(true);
    expect(title.getAttribute("aria-expanded")).toBe("false");
    expect(title.textContent).toBe(longFiles[1].name);
    expect(host.querySelector("iframe")?.title).toBe(longFiles[1].name);
    expect(document.activeElement).toBe(title);
  } finally {
    document.removeEventListener("keydown", onEscape);
  }
});

it("copies the current file entry and exposes a selectable link on failure", async () => {
  act(() => root.render(<Viewer />));
  selectFile(files[1].id);
  const header = host.querySelector("header")!;
  const headerBefore = header.innerHTML;
  const frame = host.querySelector("iframe");
  await act(async () => button("分享链接").click());
  expect(copyWebText).toHaveBeenLastCalledWith(`${window.location.origin}${sharePath}?attachment=${files[1].id}`);
  const notice = document.querySelector('[role="status"]');
  expect(notice?.textContent).toBe("链接已复制");
  expect(host.contains(notice)).toBe(false);
  expect(header.innerHTML).toBe(headerBefore);
  expect(host.querySelector("iframe")).toBe(frame);
  jest.mocked(copyWebText).mockRejectedValueOnce(new Error("clipboard denied"));
  await act(async () => button("分享链接").click());
  const input = document.querySelector("input")!;
  expect(input.readOnly).toBe(true);
  expect(input.value).toContain(`attachment=${files[1].id}`);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("请手动复制");
  expect(header.innerHTML).toBe(headerBefore);
  expect(host.querySelector("iframe")).toBe(frame);
  selectFile(files[2].id);
  expect(document.querySelector("input")).toBeNull();
  expect(document.querySelector('[role="status"]')).toBeNull();
});

it("does not show a delayed copy result for a different attachment", async () => {
  let finish: () => void = () => undefined;
  jest.mocked(copyWebText).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  act(() => root.render(<Viewer />));
  click("分享链接");
  selectFile(files[1].id);
  await act(async () => finish());
  expect(document.querySelector('[role="status"]')).toBeNull();
});

it("automatically dismisses success feedback without changing the header", async () => {
  jest.useFakeTimers();
  try {
    act(() => root.render(<Viewer />));
    const header = host.querySelector("header")!.innerHTML;
    await act(async () => button("分享链接").click());
    expect(document.querySelector('[role="status"]')?.textContent).toBe("链接已复制");
    await act(async () => jest.advanceTimersByTime(5000));
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector("header")!.innerHTML).toBe(header);
  } finally {
    act(() => root.unmount());
    root = createRoot(host);
    jest.useRealTimers();
  }
});

it("does not display pending copy feedback after the viewer is closed", async () => {
  let finish: () => void = () => undefined;
  jest.mocked(copyWebText).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  act(() => root.render(<Viewer />));
  click("分享链接");
  act(() => root.unmount());
  root = createRoot(host);
  await act(async () => finish());
  expect(document.querySelector('[role="status"]')).toBeNull();
});

const snapshot: ConversationSnapshotV1 = {
  version: 1, title: "Conversation", locale: "zh-CN", createdAt: 1, capturedAt: 1, turns: [], attachments: files,
};
const page = (id: string) => <ShareAttachmentPage snapshot={snapshot} initialAttachmentId={id}
  sharePath={sharePath} origin={window.location.origin} canReshare />;

it("opens the requested file, updates the URL without adding history, and restores it on reload", () => {
  const historyLength = window.history.length;
  act(() => root.render(page(files[1].id)));
  expect(document.title).toBe(files[1].name);
  expect(host.querySelector("iframe")?.title).toBe(files[1].name);
  expect(button("展开")).toBeNull();
  expect(host.querySelector('a[aria-label="独立打开"]')).toBeNull();
  expect(button("关闭")).toBeNull();
  selectFile(files[0].id);
  expect(window.location.search).toBe(`?attachment=${files[0].id}`);
  expect(window.history.length).toBe(historyLength);
  expect(document.title).toBe(files[0].name);
  act(() => root.unmount());
  root = createRoot(host);
  act(() => root.render(page(new URLSearchParams(window.location.search).get("attachment")!)));
  expect(host.querySelector("iframe")?.title).toBe(files[0].name);
  expect(host.querySelector('a[aria-label="返回对话"]')?.getAttribute("href")).toBe(sharePath);
});

it.each(["", "missing", "../other"])("shows an error for invalid attachment %s without opening a fallback", (id) => {
  act(() => root.render(page(id)));
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("附件不存在或链接无效");
});
