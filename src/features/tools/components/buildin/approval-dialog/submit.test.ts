/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ApprovalDialog } from "./index";
import type { ApprovalActiveAwaiting } from "@/features/tools/lib/toolsState";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string, params?: any) => params?.detail ? `Submit failed: ${params.detail}` : key }) }));
jest.mock("@/shared/ui/useAppMessage", () => ({ useAppMessage: () => ({ warning: jest.fn() }) }));
jest.mock("@/shared/utils/useKeyboard", () => ({ useKeyboard: () => {} }));
jest.mock("@/features/tools/components/awaitingTimeout", () => ({ useAwaitingTimeoutCountdown: () => ({ label: "" }) }));
jest.mock("@/features/tools/components/buildin/useAwaitingResolutionNotice", () => ({ useAwaitingResolutionNotice: () => {} }));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: () => null }));
jest.mock("@/shared/ui/Pager", () => ({ Pager: ({ panels, index }: any) => panels[index] }));
jest.mock("lodash/debounce", () => (fn: any) => fn);
jest.mock("antd", () => {
  const R = require("react");
  const Box = ({ children }: any) => R.createElement("div", null, children);
  const Radio = R.forwardRef(({ children, value, onClick }: any, _ref: any) => R.createElement("button", { "data-decision": value, onClick }, children));
  Radio.Group = Box;
  return { Radio, Typography: { Paragraph: Box, Text: Box },
    Alert: ({ message, role }: any) => R.createElement("div", { role }, message) };
});
jest.mock("antd/es", () => {
  const R = require("react");
  return { Flex: R.forwardRef(({ children }: any, ref: any) => R.createElement("div", { ref }, children)),
    Input: () => null,
    Button: ({ children, onClick, disabled, loading }: any) => R.createElement("button", { "data-submit": true, onClick, disabled: disabled || loading }, children) };
});
const data = { key: "run:wait", mode: "approval", runId: "run", awaitingId: "wait",
  approvals: [{ id: "tool", description: "Check directories", allowFreeText: true, options: [{ decision: "approve" }] }] } as ApprovalActiveAwaiting;

test.each(["returned", "thrown"])("shows %s submit errors and retries with the existing decision", async (failure) => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const error = new Error("agentKey does not match run");
  const submit = jest.fn();
  if (failure === "returned") submit.mockResolvedValueOnce(error);
  else submit.mockRejectedValueOnce(error);
  submit.mockResolvedValueOnce(undefined);
  try {
    await act(async () => root.render(React.createElement(ApprovalDialog, { data, onSubmit: submit })));
    await act(async () => (host.querySelector('[data-decision="approve"]') as HTMLButtonElement).click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Submit failed: agentKey does not match run");
    const retry = host.querySelector('[data-submit]') as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    await act(async () => retry.click());
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).toEqual({ runId: "run", awaitingId: "wait", params: [{ id: "tool", decision: "approve" }] });
    expect(host.querySelector('[role="alert"]')).toBeNull();
  } finally { act(() => root.unmount()); }
});
