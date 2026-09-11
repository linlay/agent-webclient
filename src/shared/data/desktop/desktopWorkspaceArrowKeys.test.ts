/** @jest-environment jsdom */

import {
  initializeDesktopWorkspaceArrowKeys,
  resolveDesktopWorkspaceArrowKey,
} from "./desktopWorkspaceArrowKeys";

function keyboardEvent(
  key: string,
  init: KeyboardEventInit = {},
) {
  return new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

function resolveFromTarget(target: Element, event: KeyboardEvent) {
  let result: ReturnType<typeof resolveDesktopWorkspaceArrowKey> = null;
  target.addEventListener("keydown", (currentEvent) => {
    result = resolveDesktopWorkspaceArrowKey(currentEvent as KeyboardEvent);
  }, { once: true });
  target.dispatchEvent(event);
  return result;
}

describe("Desktop Main Chat workspace arrow keys", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  it("maps plain left and right arrows from the non-interactive chat surface", () => {
    expect(resolveDesktopWorkspaceArrowKey(keyboardEvent("ArrowLeft"))).toBe("left");
    expect(resolveDesktopWorkspaceArrowKey(keyboardEvent("ArrowRight"))).toBe("right");
  });

  it("allows the explicitly marked focusable Main Chat message scroller", () => {
    const messages = document.createElement("div");
    messages.id = "messages";
    messages.tabIndex = 0;
    messages.dataset.desktopWorkspaceArrowKeys = "allow";
    document.body.append(messages);
    messages.focus();

    expect(document.activeElement).toBe(messages);
    expect(resolveFromTarget(messages, keyboardEvent("ArrowLeft"))).toBe("left");
    expect(resolveFromTarget(messages, keyboardEvent("ArrowRight"))).toBe("right");
  });

  it("keeps interactive descendants blocked inside the allowed message scroller", () => {
    const messages = document.createElement("div");
    messages.tabIndex = 0;
    messages.dataset.desktopWorkspaceArrowKeys = "allow";
    const button = document.createElement("button");
    messages.append(button);
    document.body.append(messages);
    button.focus();

    expect(resolveFromTarget(button, keyboardEvent("ArrowRight"))).toBeNull();
  });

  it.each(["ArrowUp", "ArrowDown", "1", "4", "Enter"])(
    "does not claim unrelated key %s",
    (key) => {
      expect(resolveDesktopWorkspaceArrowKey(keyboardEvent(key))).toBeNull();
    },
  );

  it.each([
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { repeat: true },
    { isComposing: true },
  ])("does not claim modified, repeated, or composing keys: %o", (init) => {
    expect(
      resolveDesktopWorkspaceArrowKey(keyboardEvent("ArrowLeft", init)),
    ).toBeNull();
  });

  it.each([
    "input",
    "textarea",
    "button",
    "a",
    "pre",
    "[contenteditable]",
    "[tabindex]",
    "[role=menuitem]",
    ".monaco-editor",
  ])("leaves arrows to interactive target %s", (kind) => {
    const target = document.createElement(
      kind === "input" || kind === "textarea" || kind === "button" ||
        kind === "a" || kind === "pre"
        ? kind
        : "div",
    );
    if (kind === "a") target.setAttribute("href", "#target");
    if (kind === "[contenteditable]") target.setAttribute("contenteditable", "true");
    if (kind === "[tabindex]") target.setAttribute("tabindex", "0");
    if (kind === "[role=menuitem]") target.setAttribute("role", "menuitem");
    if (kind === ".monaco-editor") target.className = "monaco-editor";
    document.body.append(target);

    const event = keyboardEvent("ArrowRight");
    expect(resolveFromTarget(target, event)).toBeNull();
  });

  it.each([
    '<section id="awaiting-html-panel"></section>',
    '<section class="hitl-dialog-surface"></section>',
    '<div role="dialog" aria-modal="true"></div>',
    '<div class="ant-modal-wrap"></div>',
  ])("does not override an active awaiting or modal surface", (markup) => {
    document.body.innerHTML = markup;
    expect(resolveDesktopWorkspaceArrowKey(keyboardEvent("ArrowRight"))).toBeNull();
  });

  it("keeps arrows inside an active awaiting even when the message scroller is focused", () => {
    const messages = document.createElement("div");
    messages.tabIndex = 0;
    messages.dataset.desktopWorkspaceArrowKeys = "allow";
    const awaiting = document.createElement("section");
    awaiting.id = "awaiting-html-panel";
    document.body.append(messages, awaiting);
    messages.focus();

    expect(resolveFromTarget(messages, keyboardEvent("ArrowLeft"))).toBeNull();
    expect(resolveFromTarget(messages, keyboardEvent("ArrowRight"))).toBeNull();
  });

  it("does not claim arrows while selecting text or during pointer/drag gestures", () => {
    jest.spyOn(document, "getSelection").mockReturnValue({
      isCollapsed: false,
    } as Selection);
    expect(resolveDesktopWorkspaceArrowKey(keyboardEvent("ArrowLeft"))).toBeNull();
    expect(
      resolveDesktopWorkspaceArrowKey(keyboardEvent("ArrowLeft"), {
        gestureActive: true,
      }),
    ).toBeNull();
  });

  it("publishes and consumes only accepted keys, and removes all listeners", () => {
    const publish = jest.fn(() => true);
    const cleanup = initializeDesktopWorkspaceArrowKeys(publish);

    const first = keyboardEvent("ArrowRight");
    window.dispatchEvent(first);
    expect(publish).toHaveBeenCalledWith("right");
    expect(first.defaultPrevented).toBe(true);

    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(keyboardEvent("ArrowLeft"));
    expect(publish).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("pointerup"));
    window.dispatchEvent(keyboardEvent("ArrowLeft"));
    expect(publish).toHaveBeenLastCalledWith("left");

    cleanup();
    window.dispatchEvent(keyboardEvent("ArrowRight"));
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("keeps the key available when the Desktop bridge declines the request", () => {
    const cleanup = initializeDesktopWorkspaceArrowKeys(() => false);
    const event = keyboardEvent("ArrowLeft");
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    cleanup();
  });
});
