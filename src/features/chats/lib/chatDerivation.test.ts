import { deriveChat } from "@/shared/data";
import { deriveChatFromRun, isDeriveChatActionDisabled } from "./chatDerivation";

jest.mock("@/shared/data", () => ({ deriveChat: jest.fn() }));
const mockDeriveChat = deriveChat as jest.Mock;

describe("chat derivation", () => {
  beforeEach(() => mockDeriveChat.mockReset());

  it("allows a run with both IDs and no running or awaiting state", () => {
    expect(isDeriveChatActionDisabled({ chatId: "chat_1", runId: "run_1" })).toBe(false);
  });

  it.each([
    { chatId: "", runId: "run_1" },
    { chatId: "chat_1", runId: "" },
    { chatId: "  ", runId: "run_1" },
    { chatId: "chat_1", runId: "  " },
    { chatId: "chat_1", runId: "run_1", running: true },
    { chatId: "chat_1", runId: "run_1", activeAwaiting: { mode: "question" } },
  ])("disables derivation for %j", (input) => {
    expect(isDeriveChatActionDisabled(input)).toBe(true);
  });

  it("sends normalized source IDs and returns the created chat ID", async () => {
    mockDeriveChat.mockResolvedValue({
      status: 200, code: 0, msg: "ok", data: { chatId: " chat_new " },
    });

    await expect(deriveChatFromRun(" chat_1 ", " run_1 ")).resolves.toBe("chat_new");
    expect(mockDeriveChat).toHaveBeenCalledWith({ sourceChatId: "chat_1", sourceRunId: "run_1" });
  });

  it.each([undefined, { chatId: "" }, { chatId: "  " }])(
    "rejects a response without a usable chat ID: %j",
    async (data) => {
      mockDeriveChat.mockResolvedValue({ status: 200, code: 0, msg: "ok", data });
      await expect(deriveChatFromRun("chat_1", "run_1")).rejects.toThrow("derive response missing chatId");
    },
  );

  it("preserves request errors for the conversation action to handle", async () => {
    const error = new Error("request failed");
    mockDeriveChat.mockRejectedValue(error);
    await expect(deriveChatFromRun("chat_1", "run_1")).rejects.toBe(error);
  });
});
