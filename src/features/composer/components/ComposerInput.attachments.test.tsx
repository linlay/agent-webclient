/** @jest-environment jsdom */
import React, { act, useImperativeHandle, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { ComposerInput } from "./ComposerInput";
import { ComposerAttachments } from "./ComposerAttachments";
import type { ComposerAttachment } from "../lib/composerAttachments";

jest.mock("antd", () => ({
  Input: { TextArea: React.forwardRef((props: any, ref) => {
    const input = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => ({ resizableTextArea: { textArea: input.current } }));
    return <textarea ref={input} value={props.value} onChange={props.onChange} onPaste={props.onPaste}
      onSelect={props.onSelect} onKeyDown={props.onKeyDown} />;
  }) },
  Tooltip: ({ children }: any) => <>{children}</>,
  Modal: ({ open, children, footer }: any) => open ? <div role="dialog">{children}{footer}</div> : null,
}));
jest.mock("@/features/surfaces/hooks/useOpenTarget", () => ({ useOpenTarget: () => jest.fn() }));
jest.mock("@/features/artifacts/components/AttachmentCard", () => ({
  AttachmentCard: ({ attachment, onRemove }: any) => <div data-testid="image-card">
    <img alt={attachment.name} /><button onClick={onRemove}>移除图片</button>
  </div>,
}));
jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
  t: (key: string) => key,
}));

const text = "长文本示例\n" + "需要完整保留的正文\n".repeat(24);
const image: ComposerAttachment = {
  id: "image", name: "sample.png", size: 12, type: "image", mimeType: "image/png",
  status: "ready", error: "", references: [],
};

describe("ComposerInput mixed image and pasted text", () => {
  let root: Root;
  let container: HTMLDivElement;
  let canonical: string;

  function Harness() {
    const [value, setValue] = useState("");
    const [images, setImages] = useState([image]);
    const textareaRef = useRef<TextAreaRef>(null);
    canonical = value;
    return <ComposerInput isVoiceMode={false} isFrontendActive={false} isTimelineEmpty inputValue={value}
      currentWorkerName="" voiceStatus="idle" voiceError="" partialUserText="" partialAssistantText=""
      onInputChange={setValue} onKeyDown={() => {}} onPaste={() => {}}
      onCompositionStart={() => {}} onCompositionEnd={() => {}} textareaRef={textareaRef}
      renderAttachments={(pastedTexts) => <ComposerAttachments attachments={images}
        useUnifiedComposerAttachmentRow={false} onRemoveAttachment={() => setImages([])}>
        {pastedTexts}</ComposerAttachments>} />;
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.requestAnimationFrame = jest.fn();
    container = document.createElement("div");
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });
  afterEach(() => { act(() => root.unmount()); });

  function paste() {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { files: [], getData: () => text } });
    act(() => container.querySelector("textarea")!.dispatchEvent(event));
  }

  it("keeps all attachments and extra content in a wrapping layout without overflow controls", () => {
    const attachments = Array.from({ length: 8 }, (_, index) => ({
      ...image, id: `image-${index}`, name: `sample-${index}.png`,
    }));
    act(() => root.render(<ComposerAttachments attachments={attachments}
      useUnifiedComposerAttachmentRow onRemoveAttachment={() => {}}>
      <div data-testid="extra-attachment">附加引用</div>
    </ComposerAttachments>));
    const list = container.querySelector(".composer-attachments")!;
    expect(list.classList.contains("tw:flex-wrap")).toBe(true);
    expect(list.classList.contains("tw:w-full")).toBe(true);
    expect(list.getAttribute("aria-live")).toBe("polite");
    expect(list.querySelectorAll('[data-testid="image-card"]')).toHaveLength(8);
    expect(list.querySelector('[data-testid="extra-attachment"]')).not.toBeNull();
    expect(container.querySelector(".composer-attachments-nav")).toBeNull();
    expect(container.querySelector(".composer-attachments-viewport")).toBeNull();
  });

  it("places both in the same attachment row and removes pasted text independently", () => {
    paste();
    const preview = container.querySelector('[aria-label="composer.pastedText.preview"]')!;
    const imageCard = container.querySelector('[data-testid="image-card"]')!;
    const attachments = preview.closest(".composer-attachments")!;
    expect(attachments).toBe(imageCard.closest(".composer-attachments"));
    expect(attachments.classList.contains("tw:flex-wrap")).toBe(true);
    expect(attachments.classList.contains("tw:flex-nowrap")).toBe(false);
    expect(attachments.classList.contains("tw:w-max")).toBe(false);
    expect(container.querySelector(".composer-attachments-nav")).toBeNull();
    expect(canonical).toBe(text);
    expect(container.querySelector("textarea")!.value).toBe("");
    act(() => (container.querySelector('[aria-label="composer.pastedText.remove"]') as HTMLButtonElement).click());
    expect(canonical).toBe("");
    expect(container.querySelector('[data-testid="image-card"]')).not.toBeNull();
  });

  function openPreview() {
    act(() => (container.querySelector('[aria-label="composer.pastedText.preview"]') as HTMLButtonElement).click());
    return container.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!;
  }

  function editPreview(editor: HTMLTextAreaElement, next: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setter.call(editor, next);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function dialogButton(label: string) {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
      .find(button => button.textContent === label)!;
  }

  it("edits the pasted text in place and keeps it collapsed after saving", () => {
    paste();
    const editor = openPreview();
    expect(editor.value).toBe(text);
    expect(dialogButton("composer.pastedText.save").disabled).toBe(true);
    editPreview(editor, `${text}追加内容`);
    act(() => dialogButton("composer.pastedText.save").click());
    expect(canonical).toBe(`${text}追加内容`);
    expect(container.querySelector("textarea")!.value).toBe("");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(openPreview().value).toBe(`${text}追加内容`);
  });

  it("discards unsaved edits on cancel and carries them when moved to the input", () => {
    paste();
    editPreview(openPreview(), "草稿修改");
    act(() => dialogButton("composer.pastedText.cancel").click());
    expect(canonical).toBe(text);
    editPreview(openPreview(), "放回的修改");
    act(() => dialogButton("composer.pastedText.expand").click());
    expect(canonical).toBe("放回的修改");
    expect(container.querySelector("textarea")!.value).toBe("放回的修改");
  });

  it("previews and expands the full original text while retaining its image", () => {
    paste();
    expect(openPreview().value).toBe(text);
    act(() => dialogButton("composer.pastedText.expand").click());
    expect(container.querySelector("textarea")!.value).toBe(text);
    expect(canonical).toBe(text);
    expect(container.querySelector('[data-testid="image-card"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="composer.pastedText.preview"]')).toBeNull();
  });
});
