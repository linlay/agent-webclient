/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { message } from "antd";
import { submitFeedback } from "@/shared/data";
import { useRunFeedbackAction } from "./useRunFeedbackAction";

let mockChatId = "chat_1";
const mockDispatch = jest.fn();
jest.mock("@/app/state/AppContext", () => ({
  useAppContext: () => ({ state: { chatId: mockChatId }, dispatch: mockDispatch }),
}));
jest.mock("@/shared/data", () => ({ submitFeedback: jest.fn() }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("antd", () => ({ message: { success: jest.fn() } }));
const mockSubmitFeedback = submitFeedback as jest.Mock;

function readAction() {
  let action!: ReturnType<typeof useRunFeedbackAction>;
  function Probe() {
    action = useRunFeedbackAction();
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  return action;
}

describe("run feedback action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatId = "chat_1";
    mockSubmitFeedback.mockReset().mockResolvedValue({});
  });

  it("updates feedback immediately, sends the reason as comment, then reports success", async () => {
    let finish!: () => void;
    mockSubmitFeedback.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    mockChatId = " chat_1 ";
    const pending = readAction()(" run_1 ", true, "  回答缺少依据\n请补充来源  ");

    expect(mockDispatch).toHaveBeenCalledWith({ type: "SET_RUN_DOWNVOTED", runKey: "run_1", downvoted: true });
    expect(mockDispatch.mock.invocationCallOrder[0]).toBeLessThan(mockSubmitFeedback.mock.invocationCallOrder[0]);
    expect(mockSubmitFeedback).toHaveBeenCalledWith({
      chatId: "chat_1", runId: "run_1", type: "thumbs_down", comment: "回答缺少依据\n请补充来源",
    });
    expect(message.success).not.toHaveBeenCalled();

    finish();
    await pending;
    expect(message.success).toHaveBeenCalledWith("timeline.feedback.downvoted");
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "", " \n "])("keeps feedback reasons optional: %j", async (comment) => {
    await readAction()("run_1", true, comment);
    expect(mockSubmitFeedback).toHaveBeenCalledWith({ chatId: "chat_1", runId: "run_1", type: "thumbs_down" });
  });

  it("clears feedback without resending a comment", async () => {
    await readAction()("run_1", false, "old reason");
    expect(mockSubmitFeedback).toHaveBeenCalledWith({ chatId: "chat_1", runId: "run_1", type: "clear" });
    expect(mockDispatch).toHaveBeenCalledWith({ type: "SET_RUN_DOWNVOTED", runKey: "run_1", downvoted: false });
    expect(message.success).toHaveBeenCalledWith("timeline.feedback.cleared");
  });

  it.each([true, false])("rolls back a rejected feedback change to downvoted=%s", async (nextDownvoted) => {
    mockSubmitFeedback.mockRejectedValue(new Error("request failed"));
    await expect(readAction()("run_1", nextDownvoted)).resolves.toBeUndefined();
    expect(mockDispatch).toHaveBeenNthCalledWith(1, { type: "SET_RUN_DOWNVOTED", runKey: "run_1", downvoted: nextDownvoted });
    expect(mockDispatch).toHaveBeenNthCalledWith(2, { type: "SET_RUN_DOWNVOTED", runKey: "run_1", downvoted: !nextDownvoted });
    expect(mockDispatch).toHaveBeenNthCalledWith(3, { type: "APPEND_DEBUG", line: "[feedback error] request failed" });
    expect(message.success).not.toHaveBeenCalled();
  });

  it.each(["chat", "run"])("skips requests and optimistic updates for a missing %s ID", async (missing) => {
    if (missing === "chat") mockChatId = " ";
    await readAction()(missing === "run" ? " " : "run_1", true, "reason");
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "APPEND_DEBUG", line: "[feedback error] missing chatId or runId" });
    expect(message.success).not.toHaveBeenCalled();
  });
});
