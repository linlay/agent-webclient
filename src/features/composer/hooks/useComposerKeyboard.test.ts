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
      id: "pdf",
      name: "PDF",
      label: "PDF",
      description: "Read PDFs",
      configured: false,
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


describe("queued steer shortcut", () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(global, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    } else {
      delete (global as unknown as { navigator?: unknown }).navigator;
    }
  });

  const keyEvent = (overrides = {}) => ({
    key: "Enter", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, repeat: false,
    preventDefault: jest.fn(), stopPropagation: jest.fn(), ...overrides,
  } as unknown as React.KeyboardEvent<HTMLTextAreaElement>);

  it("submits queued steer with Cmd+Enter on Mac without sending the new draft or selecting suggestions", () => {
    Object.defineProperty(global, "navigator", {
      value: { platform: "MacIntel" },
      configurable: true,
    });
    const onSubmitQueuedSteer = jest.fn();
    const handleSend = jest.fn();
    const onSelectSlashItem = jest.fn();
    const event = keyEvent({ metaKey: true, ctrlKey: false });
    renderKeyboardHook({ onSubmitQueuedSteer, handleSend, showSlashPalette: true, onSelectSlashItem })(event);
    expect(onSubmitQueuedSteer).toHaveBeenCalledTimes(1);
    expect(handleSend).not.toHaveBeenCalled();
    expect(onSelectSlashItem).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("submits queued steer with Ctrl+Enter on Windows/Linux", () => {
    Object.defineProperty(global, "navigator", {
      value: { platform: "Win32" },
      configurable: true,
    });
    const onSubmitQueuedSteer = jest.fn();
    const handleSend = jest.fn();
    const event = keyEvent({ metaKey: false, ctrlKey: true });
    renderKeyboardHook({ onSubmitQueuedSteer, handleSend })(event);
    expect(onSubmitQueuedSteer).toHaveBeenCalledTimes(1);
    expect(handleSend).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("does not submit queued steer on Windows when pressing Cmd+Enter", () => {
    Object.defineProperty(global, "navigator", {
      value: { platform: "Win32" },
      configurable: true,
    });
    const onSubmitQueuedSteer = jest.fn();
    const handleSend = jest.fn();
    const event = keyEvent({ metaKey: true, ctrlKey: false });
    renderKeyboardHook({ onSubmitQueuedSteer, handleSend })(event);
    expect(onSubmitQueuedSteer).not.toHaveBeenCalled();
  });

  it("keeps ordinary Enter on the existing enqueue path", () => {
    const onSubmitQueuedSteer = jest.fn();
    const handleSend = jest.fn();
    renderKeyboardHook({ onSubmitQueuedSteer, handleSend })(keyEvent({ metaKey: false }));
    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(onSubmitQueuedSteer).not.toHaveBeenCalled();
  });

  it.each([
    { repeat: true }, { shiftKey: true }, { nativeEvent: { isComposing: true } },
    { nativeEvent: { keyCode: 229 } },
  ])("does not submit queued steer for %j", overrides => {
    const onSubmitQueuedSteer = jest.fn();
    renderKeyboardHook({ onSubmitQueuedSteer })(keyEvent(overrides));
    expect(onSubmitQueuedSteer).not.toHaveBeenCalled();
  });

  it("sends a draft like ordinary Enter when queued steering is unavailable", () => {
    const handleSend = jest.fn();
    const event = keyEvent();
    renderKeyboardHook({ handleSend })(event);
    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});
