/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MailAskCard } from "./MailAskCard";
import { TimelineInteractionProvider } from "./TimelineInteractionContext";
import { getMailDetail } from "@/shared/data/api/requests/mailbox";
jest.mock("@/shared/data/api/requests/mailbox", () => ({ ...jest.requireActual("@/shared/data/api/requests/mailbox"), getMailDetail: jest.fn() }));
const mockSubmitAwaiting = jest.fn();
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ useRunTransport: () => ({ submitAwaiting: mockSubmitAwaiting }) }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/features/tools/hooks/useAwaitingFrameDocument", () => {
    const document = { key: "run:await", html: "<p>Platform approval</p>", loading: false, error: "" };
    return { useAwaitingFrameDocument: jest.fn(() => document) };
});
jest.mock("@/shared/ui/useAppMessage", () => ({ useAppMessage: () => ({ warning: jest.fn() }) }));
const detail = jest.mocked(getMailDetail);
const submit = mockSubmitAwaiting;
const owner = { kind: "agent", agentKey: "worker" };
beforeEach(() => { detail.mockReset(); submit.mockReset(); });
beforeAll(() => { Object.defineProperty(window, "matchMedia", { writable: true, value: () => ({ matches: false, addListener: () => { }, removeListener: () => { }, addEventListener: () => { }, removeEventListener: () => { } }) }); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
const mail = { mailId: "m", kind: "ask" as const, status: "delivered" as const, createdAt: 1, toAgentKey: "lead", toChatId: "parent", fromAgentKey: "worker", fromChatId: "child", fromRunId: "run", awaitingId: "await", awaitingMode: "question", message: JSON.stringify({ questions: [{ id: "q", question: "Choose", options: [{ label: "Yes", value: "yes" }] }] }) };
it("refreshes an ask card after mail.updated and disables resolved actions", async () => {
    detail.mockResolvedValue({ code: 0, data: mail } as any);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const openChat = jest.fn();
    const interaction = {
        getChatHref: ({ chatId }: { chatId: string }) => `/agent/worker?chatId=${chatId}`,
        openChat,
        agents: [{ key: "worker", name: "Worker", mode: "GENERAL", icon: { name: "general" } }] as never,
    };
    await act(async () => { root.render(<TimelineInteractionProvider value={interaction}><MailAskCard mailId="m"/></TimelineInteractionProvider>); });
    expect(host.textContent).toContain("worker");
    expect(host.querySelector("form")).not.toBeNull();
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/agent/worker?chatId=child");
    await act(async () => { host.querySelector("a")!.click(); });
    expect(openChat).toHaveBeenCalledWith({ chatId: "child", agentKey: "worker" });
    const before = detail.mock.calls.length;
    await act(async () => {window.dispatchEvent(new CustomEvent("agent:mail-updated", {detail: {mailId: "unrelated"}}));});
    expect(detail).toHaveBeenCalledTimes(before);
    detail.mockResolvedValue({ code: 0, data: { ...mail, status: "done" } } as any);
    await act(async () => { window.dispatchEvent(new CustomEvent("agent:mail-updated", {detail: {mailId: "m"}})); });
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).toContain("mailbox.status.done");
    await act(async () => root.unmount());
    host.remove();
});
it("submits as the human to the frozen worker waiting item", async () => {
    detail.mockResolvedValue({ code: 0, data: { ...mail, awaitingMode: "form", message: JSON.stringify({ fields: [] }) } } as any);
    submit.mockResolvedValue({ code: 0 } as any);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<MailAskCard mailId="m"/>); });
    await act(async () => { host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ runId: "run", owner, awaitingId: "await", param: { decision: "approve", data: {} } }));
    expect(submit.mock.calls.at(-1)?.[0]).not.toHaveProperty("origin");
    await act(async () => root.unmount());
    host.remove();
});

it("renders tool approval choices vertically and never uses an internal call ID as validation text", async () => {
    const callId = "call_private_approval_id";
    detail.mockResolvedValue({ code: 0, data: { ...mail, awaitingMode: "form", awaitingSource: "tool_approval", message: JSON.stringify({ fields: [
        { name: callId, type: "select", label: "diskutil apfs list\n" + "long argument ".repeat(60), required: true, options: ["approve", "reject"] },
        { name: "second_call", type: "select", label: "inspect a second disk", required: true, options: ["approve", "reject"] },
    ] }) } } as any);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MailAskCard mailId="m" />));
    try {
        expect(host.querySelector(".ant-select")).toBeNull();
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(4);
        await act(async () => {
            host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            await new Promise(resolve => setTimeout(resolve, 100));
        });
        expect(host.textContent).toContain("mailbox.ask.required");
        expect(host.textContent).not.toContain(callId);
    } finally { await act(async () => root.unmount()); host.remove(); }
});

it("keeps native approval IDs in the payload and removes controls after acceptance even before status refresh", async () => {
    detail.mockResolvedValue({ code: 0, data: { ...mail, awaitingMode: "approval", message: JSON.stringify({ approvals: [
        { id: "call_1", toolName: "bash", command: "diskutil info disk0", options: [{ decision: "approve" }] },
    ] }) } } as any);
    submit.mockReset(); submit.mockResolvedValue({ code: 0 } as any);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MailAskCard mailId="m" />));
    try {
        await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "approvalDialog.option.approve")!.click());
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({
            runId: "run", owner, awaitingId: "await", params: [{ id: "call_1", decision: "approve" }],
        }));
        expect(host.querySelector("form")).toBeNull();
        expect(host.textContent).toContain("mailbox.ask.submitted");
        expect(host.textContent).not.toContain("diskutil info disk0");
    } finally { await act(async () => root.unmount()); host.remove(); }
});

it("keeps the approval actionable when submission fails so the user can retry", async () => {
    detail.mockResolvedValue({ code: 0, data: { ...mail, awaitingMode: "approval", message: JSON.stringify({ approvals: [
        { id: "call_retry", command: "read-only inspection", options: [{ decision: "approve" }] },
    ] }) } } as any);
    submit.mockReset(); submit.mockRejectedValue(new Error("network unavailable"));
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MailAskCard mailId="m" />));
    try {
        await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "approvalDialog.option.approve")!.click());
        // The failure stays on the identity line instead of adding an alert block.
        expect(host.querySelector("header")!.textContent).toContain("network unavailable");
        expect(host.querySelector(".ant-alert")).toBeNull();
        expect(host.textContent).toContain("read-only inspection");
        expect([...host.querySelectorAll("button")].find(button => button.textContent === "approvalDialog.option.approve")!.disabled).toBe(false);
    } finally { await act(async () => root.unmount()); host.remove(); }
});


it("uses the original sandboxed form view and submits its collected data to the source Run", async () => {
    const formData = { command: "diskutil info disk0", approval: "original" };
    detail.mockResolvedValue({ code: 0, data: { ...mail, awaitingMode: "form", awaitingSource: "tool_approval", message: JSON.stringify({
        view: { source: "builtin", key: "platform_control_review" }, form: { title: "Review", data: formData },
        fields: [{ name: "internal_call", type: "select", required: true, options: ["approve", "reject"] }],
    }) } } as any);
    submit.mockReset(); submit.mockResolvedValue({ code: 0 } as any);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MailAskCard mailId="m" />));
    try {
        const frame = host.querySelector("iframe")!;
        expect(frame).not.toBeNull(); expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
        const frameDocument = jest.requireMock("@/features/tools/hooks/useAwaitingFrameDocument").useAwaitingFrameDocument;
        expect(frameDocument).toHaveBeenCalledWith(expect.objectContaining({ chatId: "child", runId: "run",
            forms: [{ id: "await", title: "Review", form: formData }],
        }), "child");
        expect(host.textContent).not.toContain("internal_call");
        const reply = () => window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow,
            data: { type: "frontend_awaiting_submit", param: { decision: "approve", data: { approved: true } } },
        }));
        await act(async () => { reply(); }); expect(submit).not.toHaveBeenCalled();
        await act(async () => { frame.dispatchEvent(new Event("load")); });
        await act(async () => (host.querySelector('input[value="submit"]') as HTMLInputElement).click());
        await act(async () => { reply(); reply(); });
        expect(submit).toHaveBeenCalledTimes(1);
        expect(submit).toHaveBeenCalledWith({ runId: "run", owner, awaitingId: "await", param: { decision: "approve", data: { approved: true } } });
        expect(host.querySelector("iframe")).toBeNull();
    } finally { await act(async () => root.unmount()); host.remove(); }
});

it("submits a single declared tool approval choice without asking for an internal field value", async () => {
    detail.mockResolvedValue({ code: 0, data: { ...mail, awaitingMode: "form", awaitingSource: "tool_approval", message: JSON.stringify({ fields: [
        { name: "call_internal", type: "select", label: "diskutil apfs list", required: true, options: ["approve", "reject"] },
    ] }) } } as any);
    submit.mockResolvedValue({ code: 0 } as any);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MailAskCard mailId="m" />));
    try {
        expect(host.querySelector("form")).toBeNull();
        expect(host.textContent).not.toContain("call_internal");
        await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "approvalDialog.option.approve")!.click());
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({
            param: { decision: "approve", data: { call_internal: "approve" } }, runId: "run", owner, awaitingId: "await",
        }));
    } finally { await act(async () => root.unmount()); host.remove(); }
});

it("names the sender and links the asking Chat before the body loads", async () => {
    detail.mockReturnValue(new Promise(() => {}) as any);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const openChat = jest.fn();
    const interaction = {
        getChatHref: ({ chatId }: { chatId: string }) => `/agent/worker?chatId=${chatId}`,
        openChat,
        agents: [{ key: "worker", name: "Worker", mode: "GENERAL", icon: { name: "general" } }] as never,
    };
    await act(async () => {
        root.render(<TimelineInteractionProvider value={interaction}>
            <MailAskCard mailId="m" metadata={{ id: "m", kind: "ask", fromAgentKey: "worker", fromChatId: "child" }} />
        </TimelineInteractionProvider>);
    });
    try {
        expect(host.textContent).toContain("mailbox.kind.ask");
        expect(host.textContent).toContain("worker");
        expect(host.querySelector("form")).toBeNull();
        expect(host.querySelector("[data-header-only]")).not.toBeNull();
        const link = host.querySelector("a")!;
        expect(link.getAttribute("href")).toBe("/agent/worker?chatId=child");
        const avatar = link.querySelector("[data-agent-avatar]")!;
        expect(avatar).not.toBeNull();
        expect(link.textContent).toContain("worker");
        await act(async () => { link.click(); });
        expect(openChat).toHaveBeenCalledWith({ chatId: "child", agentKey: "worker" });
    } finally { await act(async () => root.unmount()); host.remove(); }
});

it("keeps the sender line when the detail fetch fails but the timeline named the ask", async () => {
    detail.mockRejectedValue(new Error("network unavailable"));
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
        root.render(<MailAskCard mailId="m" metadata={{ id: "m", kind: "ask", fromAgentKey: "worker", fromChatId: "child" }} />);
    });
    try {
        const header = host.querySelector("header")!;
        expect(header.textContent).toContain("worker");
        expect(header.textContent).toContain("mailbox.unavailable");
        expect(host.querySelector('[role="alert"]')!.textContent).toBe("mailbox.unavailable");
        // One line only: no alert block below the header.
        expect(host.querySelector(".ant-alert")).toBeNull();
        expect(host.querySelector("form")).toBeNull();
        // No body yet: the identity line centers like the inbound mail line.
        expect(host.querySelector("[data-header-only]")).not.toBeNull();
    } finally { await act(async () => root.unmount()); host.remove(); }
});


it("centers a resolved ask that has no body left to answer", async () => {
    detail.mockResolvedValue({ code: 0, data: { ...mail, status: "done" } } as any);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MailAskCard mailId="m" />));
    try {
        expect(host.querySelector("form")).toBeNull();
        expect(host.querySelector("[data-header-only]")).not.toBeNull();
    } finally { await act(async () => root.unmount()); host.remove(); }
});

it("keeps an actionable ask left aligned for its form box", async () => {
    detail.mockResolvedValue({ code: 0, data: mail } as any);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MailAskCard mailId="m" />));
    try {
        expect(host.querySelector("form")).not.toBeNull();
        expect(host.querySelector("[data-header-only]")).toBeNull();
    } finally { await act(async () => root.unmount()); host.remove(); }
});
