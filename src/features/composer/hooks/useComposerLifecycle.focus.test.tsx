/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useComposerLifecycle } from "./useComposerLifecycle";

function Harness({
  chatId,
  textareaRef,
}: {
  chatId: string;
  textareaRef: React.RefObject<TextAreaRef>;
}) {
  useComposerLifecycle({
    applyComposerDraft: () => undefined,
    chatId,
    closeMention: () => undefined,
    isFrontendActive: false,
    isVoiceMode: false,
    setInputValue: () => undefined,
    stageReviewAttachment: () => true,
    setSlashDismissed: () => undefined,
    stopSpeechInput: () => undefined,
    textareaRef,
  });
  return null;
}

describe("Composer lifecycle auto focus", () => {
  const originalRaf = window.requestAnimationFrame;
  let root: Root;
  let container: HTMLDivElement;
  let focus: jest.Mock;
  let innerFocus: jest.Mock;
  let textareaRef: React.RefObject<TextAreaRef>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.history.replaceState({}, "", "/");
    focus = jest.fn();
    innerFocus = jest.fn();
    textareaRef = {
      current: {
        focus,
        resizableTextArea: {
          textArea: {
            focus: innerFocus,
            value: "",
            setSelectionRange: jest.fn(),
          },
        },
      },
    } as unknown as React.RefObject<TextAreaRef>;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.requestAnimationFrame = originalRaf;
    window.history.replaceState({}, "", "/");
  });

  function render(chatId: string) {
    act(() => root.render(<Harness chatId={chatId} textareaRef={textareaRef} />));
  }

  it("focuses the Composer after a Chat change on the desktop shell", () => {
    render("chat-a");

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("leaves the Composer unfocused after a Chat change on /mobile", () => {
    window.history.replaceState({}, "", "/mobile?chatId=chat-a");

    render("chat-a");
    render("chat-b");

    expect(focus).not.toHaveBeenCalled();
  });

  it("still honors explicit focus requests on /mobile", () => {
    window.history.replaceState({}, "", "/mobile?chatId=chat-a");
    render("chat-a");

    act(() => {
      window.dispatchEvent(new Event("agent:focus-composer"));
    });

    expect(innerFocus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
