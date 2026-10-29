/** @jest-environment jsdom */
import React, { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useComposerPastedText } from "./useComposerPastedText";

const longText = "运行日志\r\n" + "  保留缩进和原文内容。\r\n".repeat(25);

describe("useComposerPastedText controlled draft", () => {
  let root: Root;
  let container: HTMLDivElement;
  let hook: ReturnType<typeof useComposerPastedText>;
  let value: string;
  let setValue: React.Dispatch<React.SetStateAction<string>>;
  let scope: string;
  let filePaste: jest.Mock;
  let input: HTMLTextAreaElement;

  function Harness() {
    const [text, update] = useState("");
    value = text;
    setValue = update;
    const textareaRef = useRef<TextAreaRef>(null);
    hook = useComposerPastedText({ value: text, scopeKey: scope, onChange: update, onFilePaste: filePaste, textareaRef });
    return <textarea value={hook.inputValue} onPaste={hook.handlePaste} onSelect={hook.captureSelection}
      onBeforeInput={hook.captureSelection} onKeyDown={hook.captureSelection}
      onChange={event => hook.handleInputChange(event.target.value, event.target.selectionStart)} />;
  }

  function paste(text: string, files: File[] = []) {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { files, getData: () => text } });
    act(() => input.dispatchEvent(event));
    return event;
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.requestAnimationFrame = jest.fn();
    scope = "chat-a";
    filePaste = jest.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
    input = container.querySelector("textarea")!;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("collapses a paste while the canonical draft remains sendable and complete", () => {
    expect(paste(longText).defaultPrevented).toBe(true);
    expect(input.value).toBe("");
    expect(hook.pastes).toHaveLength(1);
    expect(value).toBe(longText);
    act(() => hook.handleInputChange("请分析以上日志", 8));
    expect(value).toBe(longText + "请分析以上日志");
    act(() => hook.removePaste(hook.pastes[0].id));
    expect(value).toBe("请分析以上日志");
    expect(hook.pastes).toEqual([]);
  });

  it("replaces the selection and keeps subsequent pastes in their original position", () => {
    act(() => setValue("前文被替换后文"));
    input.setSelectionRange(2, 5);
    paste(longText);
    expect(value).toBe("前文" + longText + "后文");
    expect(input.value).toBe("前文后文");
    input.setSelectionRange(2, 2);
    paste(longText + "第二段");
    expect(value).toBe("前文" + longText + longText + "第二段后文");
  });

  it("lets short text and clipboard files use their existing paste behavior", () => {
    expect(paste("普通短文本").defaultPrevented).toBe(false);
    expect(paste(longText, [new File(["image"], "image.png")]).defaultPrevented).toBe(false);
    expect(filePaste).toHaveBeenCalledTimes(2);
    expect(hook.pastes).toEqual([]);
  });

  it("respects a paste already consumed by the attachment handler", () => {
    filePaste.mockImplementation(event => event.preventDefault());
    paste(longText);
    expect(hook.pastes).toEqual([]);
    expect(value).toBe("");
  });

  it("isolates presentation by chat and restores it when returning to an unchanged draft", () => {
    paste(longText);
    scope = "chat-b";
    act(() => { setValue("其他会话"); root.render(<Harness />); });
    expect(hook.pastes).toEqual([]);
    expect(input.value).toBe("其他会话");
    scope = "chat-a";
    act(() => { setValue(longText); root.render(<Harness />); });
    expect(hook.pastes).toHaveLength(1);
    expect(input.value).toBe("");
  });

  it("clears the card after send and keeps the original text on a failed submission restore", () => {
    paste(longText);
    const sent = value;
    act(() => setValue(""));
    expect(hook.pastes).toEqual([]);
    act(() => setValue(sent));
    expect(hook.pastes[0].text).toBe(longText);
    act(() => setValue("其他恢复内容\n" + sent));
    expect(input.value).toBe(("其他恢复内容\n" + sent).replace(/\r\n/g, "\n"));
    expect(hook.pastes).toEqual([]);
    expect(value).toBe("其他恢复内容\n" + sent);
  });

  it("can put a card back into the editable input without changing the canonical value", () => {
    const text = longText.replace(/\r\n/g, "\n");
    paste(text);
    act(() => hook.expandPaste(hook.pastes[0].id));
    expect(input.value).toBe(text);
    expect(value).toBe(text);
    expect(hook.pastes).toEqual([]);
  });

  it("uses the actual selection when typing into repeated text", () => {
    act(() => setValue("aaaa"));
    input.setSelectionRange(2, 2);
    paste(longText);
    input.setSelectionRange(1, 1);
    act(() => hook.captureSelection({ currentTarget: input }));
    act(() => hook.handleInputChange("aaaaa", 2));
    expect(value).toBe("aaa" + longText + "aa");
  });
});
