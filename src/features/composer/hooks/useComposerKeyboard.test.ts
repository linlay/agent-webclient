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
    onSelectSlashItem: jest.fn(),
    handleSend: jest.fn(),
    onTogglePlanningMode: jest.fn(),
    canUsePlanningMode: true,
    isComposingRef: { current: false },
    isVoiceMode: false,
    mentionActiveIndex: 0,
    mentionOpen: false,
    mentionSuggestionsLength: 0,
    selectMentionByIndex: jest.fn(),
    selectSlashItem: jest.fn(),
    setActiveSlashIndex: jest.fn(),
    setSlashDismissed: jest.fn(),
    showSlashPalette: false,
    slashItemsLength: 0,
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
  it("selects the active slash skill with Enter", () => {
    const onSelectSlashItem = jest.fn();
    const selectedSkill = {
      kind: "skill" as const,
      key: "pdf",
      name: "PDF",
      label: "PDF",
      description: "Read PDFs",
      agentHasSkill: false,
      command: "/pdf" as const,
    };
    const preventDefault = jest.fn();
    const handler = renderKeyboardHook({
      showSlashPalette: true,
      slashItemsLength: 1,
      selectSlashItem: () => selectedSkill,
      onSelectSlashItem,
    });

    handler({
      key: "Enter",
      shiftKey: false,
      preventDefault,
    } as unknown as React.KeyboardEvent<HTMLTextAreaElement>);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSelectSlashItem).toHaveBeenCalledWith(selectedSkill);
  });

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

  it("ignores Shift+Tab when planning mode is unavailable", () => {
    const onTogglePlanningMode = jest.fn();
    const preventDefault = jest.fn();
    const handler = renderKeyboardHook({
      canUsePlanningMode: false,
      onTogglePlanningMode,
    });

    handler({
      key: "Tab",
      shiftKey: true,
      preventDefault,
    } as unknown as React.KeyboardEvent<HTMLTextAreaElement>);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(onTogglePlanningMode).not.toHaveBeenCalled();
  });
});
