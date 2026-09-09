/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { message } from "antd";
import { createInitialState } from "@/app/state/state";
import { deriveChat } from "@/shared/data";
import { dispatchDerivedChatNavigation, useDeriveChatAction } from "./useDeriveChatAction";

let mockState = createInitialState();
const mockDispatch = jest.fn();
jest.mock("@/app/state/AppContext", () => ({
  useAppContext: () => ({
    state: mockState,
    stateRef: { current: mockState },
    dispatch: mockDispatch,
    activeQuerySessionRequestIdRef: { current: "" },
    querySessionsRef: { current: new Map() },
  }),
}));
jest.mock("@/shared/data", () => ({ deriveChat: jest.fn() }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("antd", () => ({ message: { success: jest.fn(), error: jest.fn() } }));
const mockDeriveChat = deriveChat as jest.Mock;

function readAction() {
  let action!: ReturnType<typeof useDeriveChatAction>;
  function Probe() {
    action = useDeriveChatAction();
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  return action;
}

describe("derive chat conversation action", () => {
  let dispatchEvent: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = { ...createInitialState(), chatId: "chat_1" };
    mockDeriveChat.mockReset();
    mockDeriveChat.mockResolvedValue({ status: 200, code: 0, msg: "ok", data: { chatId: "chat_new" } });
    dispatchEvent = jest.spyOn(window, "dispatchEvent");
  });
  afterEach(() => dispatchEvent.mockRestore());

  it("refreshes the directory then opens the created chat with composer focus", async () => {
    await readAction().execute("run_1");

    expect(mockDeriveChat).toHaveBeenCalledWith({ sourceChatId: "chat_1", sourceRunId: "run_1" });
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(dispatchEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: "agent:refresh-chats" }));
    expect(dispatchEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "agent:load-chat", detail: { chatId: "chat_new", focusComposerOnComplete: true },
    }));
    expect(message.success).toHaveBeenCalledWith("timeline.run.deriveChatSuccess");
    expect(message.error).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it.each(["missing chat", "missing run", "running", "awaiting"])(
    "blocks both availability and direct execution when %s",
    async (condition) => {
      let runId = "run_1";
      if (condition === "missing chat") mockState.chatId = " ";
      if (condition === "missing run") runId = " ";
      if (condition === "running") mockState.currentChatActiveRun = { chatId: "chat_1", runId: "run_live", agentKey: "agent_1" };
      if (condition === "awaiting") mockState.activeAwaiting = { mode: "question" } as NonNullable<typeof mockState.activeAwaiting>;
      const action = readAction();

      expect(action.isDisabled(runId)).toBe(true);
      await action.execute(runId);

      expect(mockDeriveChat).not.toHaveBeenCalled();
      expect(dispatchEvent).not.toHaveBeenCalled();
      expect(message.success).not.toHaveBeenCalled();
      expect(message.error).not.toHaveBeenCalled();
    },
  );

  it("allows derivation after the current run finishes despite stale streaming state", async () => {
    mockState.currentChatActiveRun = { chatId: "chat_1", runId: "run_live", agentKey: "agent_1" };
    expect(readAction().isDisabled("run_1")).toBe(true);
    mockState = { ...mockState, currentChatActiveRun: null, streaming: true };
    const action = readAction();
    expect(action.isDisabled("run_1")).toBe(false);
    await action.execute("run_1");
    expect(mockDeriveChat).toHaveBeenCalledTimes(1);
  });

  it.each([new Error("request failed"), "plain failure", "missing chatId"])(
    "reports %s without navigating or rejecting the UI action",
    async (error) => {
      if (error === "missing chatId") {
        mockDeriveChat.mockResolvedValue({ status: 200, code: 0, msg: "ok", data: { chatId: " " } });
      } else {
        mockDeriveChat.mockRejectedValue(error);
      }

      await expect(readAction().execute("run_1")).resolves.toBeUndefined();

      expect(dispatchEvent).not.toHaveBeenCalled();
      expect(message.success).not.toHaveBeenCalled();
      expect(message.error).toHaveBeenCalledWith("timeline.run.deriveChatFailed");
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "APPEND_DEBUG",
        line: `[deriveChat error] ${error === "missing chatId" ? "derive response missing chatId" : error instanceof Error ? error.message : error}`,
      });
    },
  );

  it("ignores blank navigation targets", () => {
    dispatchDerivedChatNavigation(" ");
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
