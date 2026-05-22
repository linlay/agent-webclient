import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useComposerKeyboard } from "@/features/composer/hooks/useComposerKeyboard";

function renderKeyboardHook(
  props: Partial<Parameters<typeof useComposerKeyboard>[0]> = {},
) {
  let handler: ReturnType<typeof useComposerKeyboard> | null = null;
  const defaults: Parameters<typeof useComposerKeyboard>[0] = {
    closeMention: jest.fn(),
    dispatch: jest.fn(),
    executeSlashCommand: jest.fn(),
    handleSend: jest.fn(),
    onTogglePlanningMode: jest.fn(),
    isComposingRef: { current: false },
    isVoiceMode: false,
    mentionActiveIndex: 0,
    mentionOpen: false,
    mentionSuggestionsLength: 0,
    selectMentionByIndex: jest.fn(),
    selectSlashCommand: jest.fn(),
    setActiveSlashIndex: jest.fn(),
    setSlashDismissed: jest.fn(),
    showSlashPalette: false,
    slashCommandsLength: 0,
  };

  function Harness() {
    handler = useComposerKeyboard({ ...defaults, ...props });
    return null;
  }

  renderToStaticMarkup(React.createElement(Harness));
  if (!handler) {
    throw new Error("useComposerKeyboard did not return a handler");
  }
  return handler;
}

describe("useComposerKeyboard", () => {
  it("toggles planning mode with Shift+Tab", () => {
    const onTogglePlanningMode = jest.fn();
    const preventDefault = jest.fn();
    const handler = renderKeyboardHook({ onTogglePlanningMode });

    handler({
      key: "Tab",
      shiftKey: true,
      preventDefault,
    } as unknown as React.KeyboardEvent<HTMLTextAreaElement>);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onTogglePlanningMode).toHaveBeenCalledTimes(1);
  });

  it("leaves regular Tab alone", () => {
    const onTogglePlanningMode = jest.fn();
    const preventDefault = jest.fn();
    const handler = renderKeyboardHook({ onTogglePlanningMode });

    handler({
      key: "Tab",
      shiftKey: false,
      preventDefault,
    } as unknown as React.KeyboardEvent<HTMLTextAreaElement>);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(onTogglePlanningMode).not.toHaveBeenCalled();
  });
});
