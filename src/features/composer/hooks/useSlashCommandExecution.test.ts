import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SlashCommandId } from "@/features/composer/lib/slashCommands";
import { useSlashCommandExecution } from "@/features/composer/hooks/useSlashCommandExecution";

const mockOpenTarget = jest.fn();

jest.mock("@/features/surfaces/hooks/useOpenTarget", () => ({
  useOpenTarget: () => mockOpenTarget,
}));

describe("useSlashCommandExecution", () => {
  beforeEach(() => {
    mockOpenTarget.mockReset();
  });

  it("toggles the transient KBASE editing mode from /editing", async () => {
    const dispatch = jest.fn();
    const setInputValue = jest.fn();
    const setSlashDismissed = jest.fn();
    const closeMention = jest.fn();
    let executeSlashCommand:
      | ((commandId: SlashCommandId) => Promise<void>)
      | undefined;

    const Harness = () => {
      executeSlashCommand = useSlashCommandExecution({
        slashAvailability: {
          streaming: false,
          hasLatestQuery: false,
          isFrontendActive: false,
          canUsePlanningMode: false,
          canUseEditingMode: true,
          canUseVoiceMode: false,
          hasActiveChat: false,
          hasCurrentWorker: true,
          commandOverlayOpen: false,
          canShowUsage: false,
        },
        closeMention,
        latestQueryText: "",
        resetForNewConversation: jest.fn(),
        dispatch,
        toggleVoiceMode: jest.fn(),
        submitRememberCommand: jest.fn(),
        submitLearnCommand: jest.fn(),
        submitCompactCommand: jest.fn(),
        setInputValue,
        setSlashDismissed,
        openBTW: jest.fn(),
        state: {
          rightSidebarOpen: false,
          planningMode: false,
          editingMode: false,
          chatId: "",
          usagePopoverOpen: false,
        },
      });
      return null;
    };

    renderToStaticMarkup(React.createElement(Harness));
    await executeSlashCommand?.("editing");

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_EDITING_MODE",
      enabled: true,
    });
    expect(setInputValue).toHaveBeenCalledWith("");
    expect(setSlashDismissed).toHaveBeenCalledWith(true);
    expect(closeMention).toHaveBeenCalled();
  });

  it.each([
    ["simple", false, true],
    ["detailed", false, false],
    ["summary", false, true],
    ["summary", true, false],
    [undefined, false, false],
    ["simple", true, false],
  ] as const)("expands history only when available (detail=%s, running=%s)", async (chatDetail, streaming, allowed) => {
    const showChatDetails = jest.fn();
    const setInputValue = jest.fn();
    let execute: ReturnType<typeof useSlashCommandExecution> | undefined;
    const Harness = () => {
      execute = useSlashCommandExecution({
        slashAvailability: {
          streaming, chatDetail, hasLatestQuery: true, isFrontendActive: false,
          canUsePlanningMode: false, canUseVoiceMode: false, hasActiveChat: true,
          hasCurrentWorker: true, commandOverlayOpen: false, canShowUsage: false,
        },
        closeMention: jest.fn(), latestQueryText: "hello", resetForNewConversation: jest.fn(),
        dispatch: jest.fn(), toggleVoiceMode: jest.fn(), submitCompactCommand: jest.fn(),
        setInputValue, setSlashDismissed: jest.fn(), openBTW: jest.fn(), showChatDetails,
        state: { rightSidebarOpen: false, planningMode: false, chatId: "chat_1", usagePopoverOpen: false, runId: "" },
      });
      return null;
    };
    renderToStaticMarkup(React.createElement(Harness));
    await execute?.("detail");
    expect(showChatDetails).toHaveBeenCalledTimes(allowed ? 1 : 0);
    expect(setInputValue).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });

});
