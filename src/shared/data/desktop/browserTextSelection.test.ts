/** @jest-environment jsdom */

import {
  readBrowserTextSelection,
  registerDesktopContextMenuTarget,
  resolveBrowserSelectedTextFragment,
} from "./desktopContextMenu";
import { SELECTED_TEXT_MAX_CHARACTERS } from "@/shared/contracts/selectedTextReference";

function rect(left = 100, top = 100, width = 100, height = 20): DOMRect {
  return { left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function select(start: Node, startOffset = 0, end: Node = start, endOffset = (end.textContent || "").length) {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe("browser selection semantic boundary", () => {
  const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
  const originalPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const originalPoints = Object.getOwnPropertyDescriptor(document, "elementsFromPoint");
  let hitElement: Element | null;
  let rectangles: DOMRect[];
  const cleanups: Array<() => void> = [];

  function target(text = "selected text", kind: "message" | "code" = "message", targetId = "message-1") {
    const element = document.createElement(kind === "code" ? "pre" : "article");
    element.textContent = text;
    document.body.appendChild(element);
    cleanups.push(registerDesktopContextMenuTarget(element, { targetId, kind, handlers: {} }));
    hitElement = element;
    return element;
  }

  beforeEach(() => {
    document.body.innerHTML = "";
    document.getSelection()?.removeAllRanges();
    rectangles = [rect()];
    hitElement = null;
    Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => rectangles });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => hitElement });
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => hitElement ? [hitElement] : [] });
  });

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    jest.restoreAllMocks();
    document.getSelection()?.removeAllRanges();
    document.body.innerHTML = "";
    for (const [object, key, original] of [
      [Range.prototype, "getClientRects", originalRects],
      [document, "elementFromPoint", originalPoint],
      [document, "elementsFromPoint", originalPoints],
    ] as const) {
      if (original) Object.defineProperty(object, key, original);
      else Reflect.deleteProperty(object, key);
    }
  });

  it.each(["message", "code"] as const)("captures one registered %s and only creates its reference at execution", (kind) => {
    const element = target("  selected text  ", kind);
    select(element.firstChild!);
    const snapshot = readBrowserTextSelection();
    expect(snapshot).toMatchObject({ targetId: "message-1", targetKind: kind, text: "selected text" });
    expect(snapshot?.targetElement).toBe(element);
    const fragment = resolveBrowserSelectedTextFragment(snapshot!);
    expect(fragment).toMatchObject({
      targetId: "message-1",
      reference: { type: "selection", meta: { text: "selected text", sourceKind: kind } },
    });
    expect(element.attributes.length).toBe(0);
  });

  it("rejects a range crossing messages even when their target IDs match", () => {
    const first = target("first");
    const second = target("second");
    select(first.firstChild!, 0, second.firstChild!, 6);
    expect(readBrowserTextSelection()).toBeNull();
  });

  it("rejects a message range that crosses nested code despite matching message endpoints", () => {
    const message = target();
    message.innerHTML = "before <pre>nested code</pre> after";
    const code = message.querySelector("pre")!;
    cleanups.push(registerDesktopContextMenuTarget(code, { targetId: "code-1", kind: "code", handlers: {} }));
    select(message.firstChild!, 0, message.lastChild!, 6);
    expect(readBrowserTextSelection()).toBeNull();
    hitElement = code;
    select(code.firstChild!);
    expect(readBrowserTextSelection()?.targetKind).toBe("code");
  });

  it.each(["input", "textarea", "contenteditable", "textbox"])("excludes an active %s and stale document selections behind it", (kind) => {
    const message = target();
    select(message.firstChild!);
    const editor = document.createElement(kind === "input" || kind === "textarea" ? kind : "div");
    if (kind === "contenteditable") editor.setAttribute("contenteditable", "true");
    if (kind === "textbox") editor.setAttribute("role", "textbox");
    editor.tabIndex = 0;
    document.body.appendChild(editor);
    editor.focus();
    expect(readBrowserTextSelection()).toBeNull();
  });

  it("rejects editable text inside a registered message without relying on focus", () => {
    const message = target();
    message.innerHTML = '<span contenteditable="true">editable text</span>';
    select(message.firstChild!.firstChild!);
    expect(readBrowserTextSelection()).toBeNull();
  });

  it("enforces the mounted owning scope and refuses an unrelated registered target", () => {
    const own = target("own");
    const other = target("other", "message", "other-message");
    select(other.firstChild!);
    expect(readBrowserTextSelection({ scopeElement: own })).toBeNull();
    expect(readBrowserTextSelection({ scopeElement: null })).toBeNull();
    expect(readBrowserTextSelection({ scopeElement: other })?.targetId).toBe("other-message");
  });

  it("rejects detached, changed, or newly selected text instead of using a cached fragment", () => {
    const message = target("same same");
    const text = message.firstChild!;
    select(text, 0, text, 4);
    const snapshot = readBrowserTextSelection()!;
    select(text, 5, text, 9);
    expect(resolveBrowserSelectedTextFragment(snapshot)).toBeNull();
    select(text, 0, text, 4);
    text.textContent = "new! same";
    expect(resolveBrowserSelectedTextFragment(snapshot)).toBeNull();
    message.remove();
    expect(resolveBrowserSelectedTextFragment(snapshot)).toBeNull();
  });

  it("rechecks target registration and geometry before executing", () => {
    const message = target();
    select(message.firstChild!);
    const snapshot = readBrowserTextSelection()!;
    rectangles = [rect(100, 130)];
    expect(resolveBrowserSelectedTextFragment(snapshot)).toBeNull();
    rectangles = [rect()];
    cleanups.push(registerDesktopContextMenuTarget(message, { targetId: "replacement", kind: "message", handlers: {} }));
    expect(resolveBrowserSelectedTextFragment(snapshot)).toBeNull();
  });

  it("requires coordinate hits on the same semantic target, with an exception only for its own toolbar", () => {
    const message = target();
    select(message.firstChild!);
    const overlay = document.createElement("div");
    const button = document.createElement("button");
    overlay.appendChild(button);
    document.body.appendChild(overlay);
    hitElement = button;
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => [button, message, document.body] });
    expect(readBrowserTextSelection()).toBeNull();
    expect(readBrowserTextSelection({ ignoreElement: overlay })?.targetId).toBe("message-1");
  });

  it("bounds selections to 50,000 characters and excludes invisible ranges", () => {
    const message = target("x".repeat(SELECTED_TEXT_MAX_CHARACTERS + 1));
    const text = message.firstChild!;
    select(text);
    expect(readBrowserTextSelection()).toBeNull();
    select(text, 0, text, SELECTED_TEXT_MAX_CHARACTERS);
    expect(readBrowserTextSelection()?.text.length).toBe(SELECTED_TEXT_MAX_CHARACTERS);
    rectangles = [];
    expect(readBrowserTextSelection()).toBeNull();
  });

  it("rejects multiple or collapsed selections", () => {
    const message = target();
    select(message.firstChild!, 0, message.firstChild!, 0);
    expect(readBrowserTextSelection()).toBeNull();
    jest.spyOn(document, "getSelection").mockReturnValue({ isCollapsed: false, rangeCount: 2 } as Selection);
    expect(readBrowserTextSelection()).toBeNull();
  });
});
