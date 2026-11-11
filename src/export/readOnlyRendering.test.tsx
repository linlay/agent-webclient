/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { ImageGenerationCard } from "@/features/timeline/components/ImageGenerationCard";
import { ReferenceCard } from "@/features/artifacts/components/ReferenceCard";
import { PlanningTimeline } from "@/features/timeline/components/planning";
import { TimelineInteractionProvider } from "@/features/timeline/components/TimelineInteractionContext";
import { ShareMediaPreview } from "./ShareMediaPreview";
import { AwaitingAnswerBlock } from "@/features/timeline/components/AwaitingAnswerBlock";
import { I18nProvider } from "@/shared/i18n";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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
