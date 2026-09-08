/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AwaitingHtmlContainer } from "./AwaitingHtmlContainer";
import { getView } from "@/shared/data";
import { patchActiveAwaiting, type FormActiveAwaiting } from "@/features/tools/lib/toolsState";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let mockExpire: () => void;
jest.mock("@/shared/data", () => ({ getView: jest.fn(), getViewport: jest.fn() }));
jest.mock("@/app/state/provider", () => ({ useOptionalAppContext: () => ({ state: { chatId: "chat" } }) }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/utils/useKeyboard", () => ({ useKeyboard: () => {} }));
jest.mock("./awaitingTimeout", () => ({ useAwaitingTimeoutCountdown: (args: any) => { mockExpire = args.onExpire; return { enabled: false, label: "" }; } }));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: () => null }));
jest.mock("antd", () => {
  const R = require("react");
  const Box = ({ children }: any) => R.createElement("div", null, children);
  const Radio = R.forwardRef(({ children, value, disabled, onClick }: any, _ref: any) => R.createElement("button", { "data-decision": value, disabled, onClick }, children));
  Radio.Group = Box;
  return { Radio, Flex: Box, Button: ({ children, onClick, disabled }: any) => R.createElement("button", { onClick, disabled }, children),
    Input: ({ value, onChange }: any) => R.createElement("input", { value, onChange }), message: { info: jest.fn() } };
});
const ref = { connectorId: "forms", key: "edit", hash: "a".repeat(64), renderer: "html" as const };
const awaiting = { key: "run:wait", chatId: "chat", runId: "run", awaitingId: "wait", mode: "form", view: ref,
  viewportKey: "edit", viewportHtml: "", loading: false, loadError: "", forms: [{ id: "name", form: { name: "old" } }] } as FormActiveAwaiting;
test("VIEW requires host collection, rejects unknown ids, and preserves submit routing", async () => {
  jest.mocked(getView).mockResolvedValue({ code: 0, msg: "success", data: { view: ref, html: "<p>edit</p>" } });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); const submit = jest.fn().mockResolvedValue(undefined);
  try {
    await act(async () => { root.render(React.createElement(AwaitingHtmlContainer, { data: awaiting, onSubmit: submit })); });
    const iframe = host.querySelector("iframe")!;
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    const post = jest.spyOn(iframe.contentWindow!, "postMessage");
    const respond = async (id = "name") => act(async () => { window.dispatchEvent(new MessageEvent("message", { source: iframe.contentWindow!, data: { type: "frontend_awaiting_submit", runId: "forged", params: [{ id, decision: "approve", form: { name: "new" } }] } })); });
    await respond(); expect(submit).not.toHaveBeenCalled();
    act(() => mockExpire());
    expect(post).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
    act(() => (host.querySelector('[data-decision="submit"]') as HTMLButtonElement).click());
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "awaiting_collect" }), "*");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await respond("other-member"); expect(submit).not.toHaveBeenCalled(); warn.mockRestore();
    await respond();
    expect(submit).toHaveBeenCalledWith({ runId: "run", awaitingId: "wait", params: [{ id: "name", decision: "approve", form: { name: "new" } }] });
    await respond(); expect(submit).toHaveBeenCalledTimes(1);
  } finally { act(() => root.unmount()); host.remove(); }
});
test("failed VIEW still offers a working host rejection", async () => {
  const host = document.createElement("div"); const root = createRoot(host);
  const submit = jest.fn().mockResolvedValue(undefined);
  try {
    await act(async () => root.render(React.createElement(AwaitingHtmlContainer, { data: { ...awaiting, view: { ...ref, hash: undefined }, viewError: "view_unavailable" }, onSubmit: submit })));
    const reject = host.querySelector('[data-decision="reject"]') as HTMLButtonElement;
    expect(reject.disabled).toBe(false);
    await act(async () => reject.click());
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ params: [{ id: "name", decision: "reject", form: { name: "old" } }] }));
  } finally { act(() => root.unmount()); host.remove(); }
});
test("switching member forms keeps collected drafts in the awaiting reducer", () => {
  const forms = [{ id: "name", form: { name: "edited" } }];
  expect((patchActiveAwaiting(awaiting, { forms }) as FormActiveAwaiting).forms).toEqual(forms);
});
