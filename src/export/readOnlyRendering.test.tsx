/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { ImageGenerationCard } from "@/features/timeline/components/ImageGenerationCard";
import { ReferenceCard } from "@/features/artifacts/components/ReferenceCard";
import { PlanningTimeline } from "@/features/timeline/components/planning";
import { TimelineInteractionProvider } from "@/features/timeline/components/TimelineInteractionContext";
import { ShareMediaPreview } from "./ShareMediaPreview";
import { AwaitingAnswerBlock } from "@/features/timeline/components/AwaitingAnswerBlock";
import { ConversationExportDocument } from "./ConversationExportDocument";
import { I18nProvider } from "@/shared/i18n";
import type { ConversationSnapshotV1 } from "./conversationSnapshotV1";
import { TimelineRow } from "@/features/timeline/components/TimelineRow";
import { parseConversationSnapshotV1, snapshotV1PreviewData } from "./conversationSnapshotV1";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
jest.mock("@/export/brand-icons/assistant-default.svg", () => "default-icon");
jest.mock("@/shared/ui/markdown-code/ConversationMarkdownCode", () => ({ ConversationMarkdownCode: () => null }));

it("folds the entire shared run process and preserves guidance, tool and approval order", () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const at = 1_800_000_000_000;
  const endedAt = at + 283_000;
  const message = { kind: "message", role: "user", at, runId: "run" } as const;
  const original = "检查目录\n<原文>保留换行和符号";
  const attachmentId = "1".repeat(24);
  const snapshot: ConversationSnapshotV1 = {
    version: 1, title: "分享对话", locale: "zh-CN", createdAt: at, capturedAt: endedAt,
    turns: [{ runId: "run", queryAt: at, startedAt: at, endedAt, outcome: "completed", nodes: [
      { ...message, id: "query", text: "继续" },
      { ...message, id: "agent-steer", at: at + 1, steerId: "agent", origin: { type: "agent" },
        text: original, attachmentIds: [attachmentId] },
      { kind: "tool", id: "tool", runId: "run", at: at + 2, toolName: "test", toolLabel: "检查结果", status: "success" },
      { ...message, id: "user-steer", at: at + 3, steerId: "user", text: "用户引导的原文" },
      { ...message, kind: "awaiting-answer", id: "approval", at: at + 4, taskId: "child",
        text: JSON.stringify({ status: "answered", items: [{ question: "是否继续？", answer: "继续执行" }] }) },
      { kind: "tool", id: "second-tool", runId: "run", at: at + 5, toolName: "test", toolLabel: "执行结果", status: "success" },
      { kind: "content", id: "final", runId: "run", at: endedAt, role: "assistant", text: "最终答复" },
    ] }],
    attachments: [{ id: attachmentId, name: "附件.txt", sourceRef: "note.txt", mimeType: "text/plain" }],
  };
  try {
    act(() => root.render(<I18nProvider locale="zh-CN" persistLocale={false}>
      <ConversationExportDocument snapshot={snapshot} />
    </I18nProvider>));
    const headers = host.querySelectorAll<HTMLElement>(".timeline-run-collapse .ant-collapse-header");
    expect(Array.from(headers, header => header.textContent)).toEqual(["已处理 4分43秒"]);
    const [process] = headers;
    const visibleText = () => host.textContent || "";
    const history = ["智能体引导", "检查结果", "用户引导", "已提交 1 项回答", "执行结果"];
    expect(visibleText()).toContain("最终答复");
    for (const text of history) expect(visibleText()).not.toContain(text);
    act(() => process.click());
    expect(visibleText()).toMatch(new RegExp(["继续", ...history, "最终答复"].join(".*"), "s"));
    expect(visibleText()).toContain("继续执行");
    const collapsedGuidance = (id: string, label: string) => {
      const row = host.querySelector(`[data-node-id="${id}"]`)!;
      expect(row.querySelector('.timeline-marker [data-material-icon="reply"]')).not.toBeNull();
      const toggle = row.querySelector<HTMLElement>(".ant-collapse-header")!;
      expect(toggle).not.toBeNull();
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(toggle.querySelector(".ant-collapse-arrow")).not.toBeNull();
      expect(toggle.textContent).toBe(label);
      return toggle;
    };
    const agent = collapsedGuidance("agent-steer", "智能体引导");
    const user = collapsedGuidance("user-steer", "用户引导");
    expect(visibleText()).not.toContain(original);
    act(() => agent.click());
    const details = agent.closest(".ant-collapse-item")?.querySelector(".ant-collapse-content");
    expect(details?.textContent).toBe(`${original}附件.txt`);
    expect(agent.getAttribute("aria-expanded")).toBe("true");
    expect(user.getAttribute("aria-expanded")).toBe("false");
    act(() => agent.click());
    expect(host.textContent).not.toContain(original);
    act(() => process.click());
    for (const text of history) expect(visibleText()).not.toContain(text);
    expect(visibleText()).toContain("最终答复");
  } finally { act(() => root.unmount()); }
});

it.each([undefined, { code: "provider_not_configured", message: "运行失败" }])("renders and copies only saved failure details (error=%s)", async error => {
  const previousObserver = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true,
    value: class { observe() {} unobserve() {} disconnect() {} } });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const copy = jest.fn().mockResolvedValue(undefined);
  const epoch = 1_800_000_000_000;
  const snapshot = parseConversationSnapshotV1(JSON.stringify({
    version: 1, title: "现在几点了", locale: "zh-CN", createdAt: epoch, capturedAt: epoch,
    turns: [{ runId: "failed-run", queryAt: epoch, startedAt: epoch, endedAt: epoch, outcome: "failed", error,
      nodes: [{ id: "query", kind: "message", role: "user", text: "现在几点了", at: epoch, runId: "failed-run" }] }], attachments: [],
  }));
  try {
    expect(snapshot).not.toBeNull();
    const node = snapshotV1PreviewData(snapshot!).nodes.find(item => item.systemMessageLevel === "error")!;
    act(() => root.render(<I18nProvider locale="zh-CN" persistLocale={false}>
      <TimelineInteractionProvider value={{ readOnly: true, copyText: copy }}>
        <TimelineRow node={node} agents={[]} />
      </TimelineInteractionProvider>
    </I18nProvider>));
    expect(host.textContent).toContain(error?.message ?? "运行失败。");
    const details = host.querySelector("details");
    if (error) {
      expect(details).not.toBeNull();
      expect(details!.open).toBe(false);
      expect(details!.querySelector("summary")!.textContent).toBe("技术详情");
      act(() => details!.querySelector("summary")!.click());
      expect(details!.open).toBe(true);
      expect(Array.from(details!.querySelectorAll("dd"), item => item.textContent)).toEqual([error.code, error.message]);
    } else {
      expect(details).toBeNull();
    }
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="复制"]')!.click());
    expect(copy).toHaveBeenCalledTimes(1);
    if (error) expect(copy.mock.calls[0][0]).toContain(`"code": "${error.code}"`);
    else expect(copy).toHaveBeenCalledWith("运行失败。");
  } finally {
    act(() => root.unmount()); host.remove();
    if (previousObserver) Object.defineProperty(globalThis, "ResizeObserver", previousObserver);
    else Reflect.deleteProperty(globalThis, "ResizeObserver");
  }
});

it("expands saved choices and timeout records without submission controls", () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  function History() {
    const [expanded, setExpanded] = useState(true);
    return <I18nProvider locale="zh-CN" persistLocale={false}>
      <TimelineInteractionProvider value={{ readOnly: true, setExpanded: (_id, value) => setExpanded(value) }}>
        <AwaitingAnswerBlock node={{ id: "answer", kind: "awaiting-answer", expanded,
          text: JSON.stringify({ status: "answered", items: [{ description: "像素扫描", command: "python3 probe.py", decision: "approve_rule_run" }, { question: "次数", answer: 0 }, { question: "开启", answer: false }] }) }} />
        <AwaitingAnswerBlock node={{ id: "timeout", kind: "awaiting-answer", expanded: true,
          text: JSON.stringify({ status: "error", error: { code: "timeout", message: "等待用户回应超时。" } }) }} />
      </TimelineInteractionProvider>
    </I18nProvider>;
  }
  try {
    act(() => root.render(<History />));
    expect(host.textContent).toContain("同意（本次运行同规则都放行）");
    expect(host.textContent).toContain("等待用户回应超时。");
    expect(host.textContent).toContain("false");
    expect(host.textContent).toContain("0");
    expect(host.querySelector('form, input, button[type="submit"]')).toBeNull();
    const toggle = host.querySelector<HTMLElement>('[aria-expanded="true"]')!;
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(host.textContent).toContain("python3 probe.py");
  } finally { act(() => root.unmount()); host.remove(); }
});
it("renders successful generation, references and planning without an application provider and keeps failures local", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const copy = jest.fn().mockRejectedValue(new Error("denied"));
  try {
    await act(async () => root.render(<TimelineInteractionProvider value={{ readOnly: true, copyText: copy,
      renderAttachment: (attachment) => <ShareMediaPreview attachment={{ id: "1".repeat(24), sourceRef: "image.png", name: attachment.name, mimeType: "image/png" }} url="/frozen.png" unavailable="missing image" />,
    }}>
      <ImageGenerationCard nodes={[{ id: "image", kind: "tool", ts: 1, toolName: "image_generate", status: "completed", result: { text: '{"images":[{"url":"image.png","artifactId":"original-id"}]}', isCode: true } }]} />
      <ReferenceCard reference={{ id: "skill", name: "skill", type: "skill" }} variant="timeline" />
      <PlanningTimeline node={{ id: "plan", kind: "planning", planningId: "plan-id", text: "Plan remains readable", status: "completed", ts: 1 }} />
    </TimelineInteractionProvider>));
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/frozen.png");
    expect(host.textContent).toContain("Plan remains readable");
    expect(host.querySelector('[data-reference-type="skill"]')?.getAttribute("role")).toBeNull();
    expect(host.querySelector('[data-material-icon="open_in_new"]')).toBeNull();
    const copyButton = host.querySelector('[data-material-icon="content_copy"]')?.closest("button");
    expect(copyButton).not.toBeNull();
    await act(async () => copyButton!.click());
    expect(copy).toHaveBeenCalledWith("Plan remains readable");
    expect(host.querySelector('[role="status"]')?.textContent).toBeTruthy();
    act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.textContent).toContain("missing image");
    expect(host.textContent).toContain("Plan remains readable");
  } finally { act(() => root.unmount()); host.remove(); }
});

it("keeps planning copy feedback in the application host when supplied", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const copyText = jest.fn().mockResolvedValue(undefined);
  const onCopyResult = jest.fn();
  try {
    await act(async () => root.render(<TimelineInteractionProvider value={{copyText,onCopyResult}}>
      <PlanningTimeline node={{id:"plan",kind:"planning",text:"Plan",status:"completed",ts:1}} />
    </TimelineInteractionProvider>));
    const button = host.querySelector('[data-material-icon="content_copy"]')!.closest("button")!;
    await act(async () => button.click());
    expect(onCopyResult).toHaveBeenCalledWith(true,expect.any(String));
    expect(host.querySelector('[role="status"]')).toBeNull();
    copyText.mockRejectedValueOnce(new Error("denied"));
    await act(async () => button.click());
    expect(onCopyResult).toHaveBeenLastCalledWith(false,expect.any(String));
    expect(host.querySelector('[role="status"]')).toBeNull();
  } finally {act(() => root.unmount());}
});
