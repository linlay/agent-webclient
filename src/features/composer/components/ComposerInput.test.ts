import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerInput } from "@/features/composer/components/ComposerInput";

const mockTextAreaProps: Array<Record<string, any>> = [];

jest.mock("antd", () => ({
  Input: {
    TextArea: (props: Record<string, any>) => {
      mockTextAreaProps.push(props);
      return React.createElement("textarea", {
        id: props.id,
        placeholder: props.placeholder,
      });
    },
  },
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

function renderComposerInput(props: Partial<React.ComponentProps<typeof ComposerInput>> = {}) {
  return renderToStaticMarkup(
    React.createElement(ComposerInput, {
      isVoiceMode: false,
      isFrontendActive: false,
      isTimelineEmpty: false,
      inputValue: "",
      currentWorkerName: "",
      voiceStatus: "idle",
      voiceError: "",
      partialUserText: "",
      partialAssistantText: "",
      onInputChange: jest.fn(),
      onKeyDown: jest.fn(),
      onPaste: jest.fn(),
      onDragOver: jest.fn(),
      onDrop: jest.fn(),
      onCompositionStart: jest.fn(),
      onCompositionEnd: jest.fn(),
      textareaRef: React.createRef(),
      ...props,
    }),
  );
}

describe("ComposerInput", () => {
  beforeEach(() => {
    mockTextAreaProps.length = 0;
  });

  it("uses the desktop auto-size defaults", () => {
    renderComposerInput({ isTimelineEmpty: true });

    expect(mockTextAreaProps[0].autoSize).toEqual({
      minRows: 5,
      maxRows: 10,
    });
  });

  it("allows compact shells to cap input at six rows", () => {
    renderComposerInput({
      emptyInputMinRows: 1,
      inputMaxRows: 6,
      isTimelineEmpty: true,
    });

    expect(mockTextAreaProps[0].autoSize).toEqual({
      minRows: 1,
      maxRows: 6,
    });
  });

  it("uses a sampled greeting placeholder when provided", () => {
    renderComposerInput({
      placeholder: "我可以帮你检查项目状态",
    });

    expect(mockTextAreaProps[0].placeholder).toBe("我可以帮你检查项目状态");
  });

  it("keeps the frontend active placeholder above sampled greetings", () => {
    renderComposerInput({
      isFrontendActive: true,
      placeholder: "我可以帮你检查项目状态",
    });

    expect(mockTextAreaProps[0].placeholder).toBe(
      "composer.input.placeholder.frontendActive",
    );
  });
});
