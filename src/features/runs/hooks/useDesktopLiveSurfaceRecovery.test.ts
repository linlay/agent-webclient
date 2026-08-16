import { recoverDesktopLiveSurface } from "@/features/runs/hooks/useDesktopLiveSurfaceRecovery";

describe("recoverDesktopLiveSurface", () => {
  it("forces HTTP replay when an active Desktop surface has a current chat", async () => {
    const loadChat = jest.fn().mockResolvedValue(undefined);

    await expect(recoverDesktopLiveSurface({
      active: true,
      chatId: " chat-1 ",
      loadChat,
    })).resolves.toBe(true);

    expect(loadChat).toHaveBeenCalledWith("chat-1", {
      forceReload: true,
      focusComposerOnComplete: false,
    });
  });

  it("does not replay or attach while inactive or without a current chat", async () => {
    const loadChat = jest.fn().mockResolvedValue(undefined);

    await expect(recoverDesktopLiveSurface({
      active: false,
      chatId: "chat-1",
      loadChat,
    })).resolves.toBe(false);
    await expect(recoverDesktopLiveSurface({
      active: true,
      chatId: "",
      loadChat,
    })).resolves.toBe(false);

    expect(loadChat).not.toHaveBeenCalled();
  });
});
