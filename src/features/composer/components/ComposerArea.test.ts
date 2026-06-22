import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/state";
import { ComposerArea } from "@/features/composer/components/ComposerArea";

const mockAntdMessage = {
  warning: jest.fn(),
  error: jest.fn(),
};

jest.mock("antd", () => ({
  App: {
    useApp: () => ({ message: mockAntdMessage }),
  },
}));

jest.mock("@/app/state/AppContext", () => ({
  useAppContext: jest.fn(),
  useAppState: jest.fn(),
  useAppDispatch: jest.fn(),
}));

jest.mock("@/features/tools/components/buildin", () => ({
  Buildin: {
    ApprovalDialog: () => React.createElement("div", null, "approval"),
    PlanDialog: () => React.createElement("div", null, "plan"),
    QuestionDialog: () => React.createElement("div", null, "question"),
  },
}));

jest.mock("@/features/tools/components/AwaitingHtmlContainer", () => ({
  AwaitingHtmlContainer: () => React.createElement("div", null, "awaiting"),
}));

jest.mock("@/features/composer/components/MentionSuggest", () => ({
  MentionSuggest: () => React.createElement("div", null, "mention"),
}));

jest.mock("@/features/composer/components/SlashPalette", () => ({
  SlashPalette: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { className: "slash-palette" }, children),
}));

jest.mock("@/features/composer/components/SteerBar", () => ({
  SteerBar: () => React.createElement("div", null, "steer"),
}));

jest.mock("@/features/composer/components/ComposerContext", () => ({
  ComposerProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { className: "composer-provider" }, children),
}));

jest.mock("@/features/composer/components/ComposerAttachments", () => ({
  ComposerAttachments: () =>
    React.createElement("div", { className: "composer-attachments" }),
}));

const mockComposerInputProps: Array<Record<string, any>> = [];
const mockComposerActionsProps: Array<Record<string, any>> = [];
const mockComposerAttachmentsState = {
  sendAttachmentMeta: [] as unknown[],
  sendReferences: [] as unknown[],
};

jest.mock("@/features/composer/components/ComposerInput", () => ({
  ComposerInput: (props: Record<string, any>) => {
    mockComposerInputProps.push(props);
    return React.createElement("div", { className: "composer-input" });
  },
}));

jest.mock("@/features/composer/components/ComposerActions", () => ({
  ComposerActions: (props: Record<string, any>) => {
    mockComposerActionsProps.push(props);
    return React.createElement("div", { className: "composer-actions" });
  },
}));

jest.mock("@/features/composer/components/QuerySettingsControls", () => ({
  QuerySettingsControls: () =>
    React.createElement("div", { className: "query-settings-controls" }, "权限"),
}));

jest.mock("@/features/composer/components/ComposerWonders", () => ({
  ComposerWonders: () =>
    React.createElement("div", { className: "composer-wonders" }, "wonder"),
}));

jest.mock("@/features/workers/lib/currentWorker", () => ({
  resolveCurrentWorkerSummary: () => null,
}));

jest.mock("@/features/composer/lib/slashCommands", () => ({
  getLatestQueryText: () => "",
}));

jest.mock("@/features/timeline/lib/timelineDisplay", () => ({
  buildTimelineDisplayItems: () => [],
}));

jest.mock("@/features/composer/components/useSpeechInput", () => ({
  useSpeechInput: () => ({
    speechSupported: true,
    speechListening: false,
    speechState: "idle",
    speechStatus: "",
    toggleSpeechInput: jest.fn(),
    stopSpeechInput: jest.fn(),
  }),
}));

jest.mock("@/features/composer/hooks/useComposerAttachments", () => ({
  useComposerAttachments: () => ({
    attachmentChatId: "",
    attachmentScrollState: { canScrollLeft: false, canScrollRight: false },
    attachmentViewportRef: React.createRef(),
    attachments: [],
    canCaptureDesktopScreenshot: false,
    captureDesktopScreenshot: jest.fn(),
    clearComposerAttachments: jest.fn(),
    fileInputRef: React.createRef(),
    handleFileDragOver: jest.fn(),
    handleFileDrop: jest.fn(),
    handleFileSelection: jest.fn(),
    handleFilePaste: jest.fn(),
    handleRemoveAttachment: jest.fn(),
    hasComposerAttachmentOverflow: false,
    hasUploadingAttachments: false,
    isCapturingDesktopScreenshot: false,
    openFilePicker: jest.fn(),
    scrollComposerAttachments: jest.fn(),
    sendAttachmentMeta: mockComposerAttachmentsState.sendAttachmentMeta,
    sendReferences: mockComposerAttachmentsState.sendReferences,
    useUnifiedComposerAttachmentRow: false,
  }),
}));

const mockComposerAwaitingState = {
  isAwaitingActive: false,
};

const mockUseRuntimeAccessLevel = jest.fn(() => jest.fn());

jest.mock("@/features/composer/hooks/useComposerAwaiting", () => ({
  useComposerAwaiting: () => ({
    clearActiveAwaiting: jest.fn(),
    handleAwaitingSubmit: jest.fn(),
    handlePatchActiveAwaiting: jest.fn(),
    isAwaitingActive: mockComposerAwaitingState.isAwaitingActive,
  }),
}));

jest.mock("@/features/composer/hooks/useRuntimeAccessLevel", () => ({
  useRuntimeAccessLevel: (input: Record<string, any>) =>
    mockUseRuntimeAccessLevel(input),
}));

jest.mock("@/features/composer/hooks/useComposerKeyboard", () => ({
  useComposerKeyboard: () => jest.fn(),
}));

jest.mock("@/features/composer/hooks/useComposerLifecycle", () => ({
  useComposerLifecycle: jest.fn(),
}));

jest.mock("@/features/composer/hooks/useComposerMention", () => ({
  useComposerMention: () => ({
    closeMention: jest.fn(),
    selectMentionByIndex: jest.fn(),
    updateMentionSuggestions: jest.fn(),
  }),
}));

jest.mock("@/features/composer/hooks/useComposerSend", () => ({
  useComposerSend: () => ({
    applyComposerDraft: jest.fn(),
    executeSlashCommand: jest.fn(),
    handleCancelSteer: jest.fn(),
    handleSend: jest.fn(),
    handleSteer: jest.fn(),
    interruptCurrentRun: jest.fn(),
    mergedSteerDraft: "",
    steerSubmitting: false,
  }),
}));

jest.mock("@/features/composer/hooks/useComposerSlash", () => ({
  useComposerSlash: () => ({
    activeSlashIndex: 0,
    selectSlashCommand: jest.fn(),
    setActiveSlashIndex: jest.fn(),
    setSlashDismissed: jest.fn(),
    showSlashPalette: false,
    slashCommands: [],
    slashDismissed: false,
    slashPaletteRef: React.createRef(),
    slashPopoverWidth: 320,
  }),
}));

jest.mock("@/features/composer/hooks/useComposerWonders", () => ({
  useComposerWonders: jest.fn(() => ({
    sampledGreeting: "Greeting from detail",
    sampledWonders: ["Try this"],
  })),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

const { useAppContext, useAppState, useAppDispatch } = jest.requireMock(
  "@/app/state/AppContext",
) as {
  useAppContext: jest.Mock;
  useAppState: jest.Mock;
  useAppDispatch: jest.Mock;
};

const { useComposerWonders } = jest.requireMock(
  "@/features/composer/hooks/useComposerWonders",
) as {
  useComposerWonders: jest.Mock;
};

const globalWithStorage = globalThis as typeof globalThis & {
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
};

describe("ComposerArea", () => {
  const originalLocalStorage = globalWithStorage.localStorage;

  beforeEach(() => {
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    mockComposerInputProps.length = 0;
    mockComposerActionsProps.length = 0;
    mockComposerAttachmentsState.sendAttachmentMeta = [];
    mockComposerAttachmentsState.sendReferences = [];
    mockComposerAwaitingState.isAwaitingActive = false;
    mockUseRuntimeAccessLevel.mockClear();
    const initialState = createInitialState();
    useAppDispatch.mockReturnValue(jest.fn());
    useAppState.mockReturnValue(initialState);
    useAppContext.mockReturnValue({ stateRef: { current: initialState } });
    useComposerWonders.mockClear();
  });

  afterAll(() => {
    if (originalLocalStorage) {
      globalWithStorage.localStorage = originalLocalStorage;
      return;
    }
    delete globalWithStorage.localStorage;
  });

  it("hides wonders and forwards compact input sizing when configured", () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposerArea, {
        emptyInputMinRows: 1,
        inputMaxRows: 6,
        showWonders: false,
      }),
    );

    expect(html).not.toContain("composer-wonders");
    expect(mockComposerInputProps[0].emptyInputMinRows).toBe(1);
    expect(mockComposerInputProps[0].inputMaxRows).toBe(6);
    expect(mockComposerInputProps[0].placeholder).toBe("Greeting from detail");
    expect(useComposerWonders.mock.calls[0][0].isBlankConversation).toBe(true);
    expect(useComposerWonders.mock.calls[0][0].showWonders).toBe(false);
  });

  it("keeps runtime permission controls visible while awaiting approval", () => {
    const state = createInitialState();
    mockComposerAwaitingState.isAwaitingActive = true;
    useAppState.mockReturnValue({
      ...state,
      runId: "run_1",
      currentRunAgentKey: "agent_a",
      activeAwaiting: {
        mode: "approval",
        runId: "run_1",
        agentKey: "agent_a",
        awaitingId: "await_1",
        approvals: [],
      },
    });

    const html = renderToStaticMarkup(React.createElement(ComposerArea));

    expect(html).toContain("approval");
    expect(mockUseRuntimeAccessLevel).toHaveBeenCalledWith(
      expect.objectContaining({
        activeRunId: "run_1",
        activeRunAgentKey: "agent_a",
        isRunActive: true,
      }),
    );
  });

  it("treats a stale run id as inactive when the chat is not running", () => {
    useAppState.mockReturnValue({
      ...createInitialState(),
      runId: "run_stale",
      currentRunAgentKey: "agent_a",
      streaming: false,
      events: [{ type: "content.delta", runId: "run_stale" }],
    });

    renderToStaticMarkup(React.createElement(ComposerArea));

    expect(mockUseRuntimeAccessLevel).toHaveBeenCalledWith(
      expect.objectContaining({
        activeRunId: "run_stale",
        activeRunAgentKey: "agent_a",
        isRunActive: false,
      }),
    );
  });

  it("keeps send disabled for screenshot-only attachments until text is entered", () => {
    mockComposerAttachmentsState.sendReferences = [
      { type: "image", url: "/api/resource?file=screenshot.png" },
    ];
    mockComposerAttachmentsState.sendAttachmentMeta = [
      {
        name: "screenshot.png",
        size: 1024,
        type: "image",
        url: "/api/resource?file=screenshot.png",
      },
    ];

    renderToStaticMarkup(React.createElement(ComposerArea));

    expect(mockComposerActionsProps[0].sendDisabled).toBe(true);
  });
});
