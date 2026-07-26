import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SlashCommandId } from "@/features/composer/lib/slashCommands";
import { useSlashCommandExecution } from "@/features/composer/hooks/useSlashCommandExecution";

describe("useSlashCommandExecution", () => {
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
          workerHistoryCount: 0,
          workerCount: 1,
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
});
