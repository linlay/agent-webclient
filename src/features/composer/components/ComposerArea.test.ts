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
  Flex: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { className: "ant-flex" }, children),
  Tag: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", { className: "ant-tag" }, children),
  Tooltip: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { className: "ant-tooltip" }, children),
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

jest.mock("@/features/composer/components/AwaitingShell", () => ({
  AwaitingShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { className: "awaiting-shell" }, children),
}));

jest.mock("@/features/tools/components/AwaitingHtmlContainer", () => ({
  AwaitingHtmlContainer: () => React.createElement("div", null, "awaiting"),
}));

jest.mock("@/features/composer/components/MentionSuggest", () => ({
  MentionSuggest: () => React.createElement("div", null, "mention"),
}));

const mockSlashPaletteProps: Array<Record<string, any>> = [];

jest.mock("@/features/composer/components/SlashPalette", () => ({
  SlashPalette: (props: Record<string, any>) => {
    mockSlashPaletteProps.push(props);
    return React.createElement("div", { className: "slash-palette" }, props.children);
  },
}));

jest.mock("@/features/composer/components/SteerBar", () => ({
  SteerBar: () => React.createElement("div", null, "steer"),
}));

jest.mock("@/features/workers/components/CommandOverlayProvider", () => ({
  useCommandOverlayOpen: () => false,
}));

jest.mock("@/features/search/components/GlobalSearchOverlayProvider", () => ({
  useGlobalSearchOpen: () => false,
}));

jest.mock("@/shared/config/featureFlags", () => ({
  isVoiceEnabled: () => false,
}));

jest.mock("@/features/runs/lib/runRuntimeState", () => ({
  resolveMainChatRuntime: () => ({ running: false }),
}));

jest.mock("@/shared/ui/UiButton", () => ({
  UiButton: ({ children, ...rest }: Record<string, unknown>) =>
    React.createElement("button", rest, children),
}));

jest.mock("@/shared/icons/material", () => ({
  MaterialIcon: ({ name }: { name: string }) =>
    React.createElement("span", { "data-icon": name }),
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
const mockResolveCurrentWorkerSummary = jest.fn(() => null);
const mockIsDedicatedKbaseWorker = jest.fn(() => false);
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
  resolveCurrentWorkerSummary: () => mockResolveCurrentWorkerSummary(),
  isDedicatedKbaseWorker: () => mockIsDedicatedKbaseWorker(),
  buildCurrentWorkerDetailView: () => ({ skills: [] }),
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
    steerSubmitting: false,
  }),
}));

const mockUseComposerSlash = jest.fn(
  (_input: Record<string, unknown>) => ({
    activeSlashIndex: 0,
    refetchSlashSkills: jest.fn(),
    selectSlashItem: jest.fn(),
    setActiveSlashIndex: jest.fn(),
    setSlashDismissed: jest.fn(),
    showSlashPalette: false,
    slashCommands: [],
    slashItems: [],
    slashDismissed: false,
    slashPaletteRef: React.createRef(),
    slashPopoverWidth: 320,
    slashSkillError: null,
    slashSkillStatus: "idle",
    slashSkills: [],
  }),
);

jest.mock("@/features/composer/hooks/useComposerSlash", () => ({
  useComposerSlash: (input: Record<string, unknown>) =>
    mockUseComposerSlash(input),
}));

jest.mock("@/features/composer/hooks/useComposerHash", () => ({
  useComposerHash: () => ({
    showAddMenu: false,
    setHashDismissed: jest.fn(),
    hashPaletteRef: React.createRef(),
    hashPopoverWidth: 320,
  }),
}));

jest.mock("@/features/composer/components/ComposerAddMenu", () => ({
  AddMenuPopover: (props: Record<string, any>) =>
    React.createElement("div", { className: "add-menu-popover" }, props.children),
  AddMenuTrigger: () => React.createElement("div", { className: "add-menu-trigger" }),
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
  document?: {
    body: unknown;
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
    mockSlashPaletteProps.length = 0;
    mockComposerAttachmentsState.sendAttachmentMeta = [];
    mockComposerAttachmentsState.sendReferences = [];
    mockComposerAwaitingState.isAwaitingActive = false;
    mockUseRuntimeAccessLevel.mockClear();
    mockResolveCurrentWorkerSummary.mockReset();
    mockResolveCurrentWorkerSummary.mockReturnValue(null);
    mockIsDedicatedKbaseWorker.mockReset();
    mockIsDedicatedKbaseWorker.mockReturnValue(false);
    mockUseComposerSlash.mockClear();
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
        activeRunOwner: { kind: "agent", agentKey: "agent_a" },
        isRunActive: true,
      }),
    );
  });

  it("treats current chat activeRun as active even when streaming is not connected", () => {
    useAppState.mockReturnValue({
      ...createInitialState(),
      chatId: "chat_1",
      currentChatActiveRun: {
        chatId: "chat_1",
        runId: "run_1",
        agentKey: "agent_a",
      },
      currentRunAgentKey: "agent_a",
      streaming: false,
    });

    renderToStaticMarkup(React.createElement(ComposerArea));

    expect(mockUseRuntimeAccessLevel).toHaveBeenCalledWith(
      expect.objectContaining({
        activeRunId: "run_1",
        activeRunOwner: { kind: "agent", agentKey: "agent_a" },
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
        activeRunOwner: { kind: "agent", agentKey: "agent_a" },
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

  it("enables the editing switch and slash command for a dedicated KBASE Agent", () => {
    mockResolveCurrentWorkerSummary.mockReturnValue({
      type: "agent",
      sourceId: "knowledge",
      displayName: "Knowledge",
      relatedChats: [],
      raw: { mode: "KBASE" },
    });
    mockIsDedicatedKbaseWorker.mockReturnValue(true);

    renderToStaticMarkup(React.createElement(ComposerArea));

    expect(mockComposerActionsProps[0]).toEqual(
      expect.objectContaining({
        canUseEditingMode: true,
        editingMode: false,
      }),
    );
    expect(mockUseComposerSlash).toHaveBeenCalledWith(
      expect.objectContaining({
        canUseEditingMode: true,
        currentAgentKey: "knowledge",
      }),
    );
  });

  it("mounts slash palette popover outside clipped composer containers", () => {
    const originalDocument = globalWithStorage.document;
    const body = {};
    globalWithStorage.document = { body };

    renderToStaticMarkup(React.createElement(ComposerArea));

    expect(mockSlashPaletteProps[0].getPopupContainer()).toBe(body);

    if (originalDocument) {
      globalWithStorage.document = originalDocument;
      return;
    }
    delete globalWithStorage.document;
  });
});
