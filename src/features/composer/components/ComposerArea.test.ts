/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
jest.mock("@/features/composer/hooks/useDesktopAwaitingDigit", () => ({useDesktopAwaitingDigit: jest.fn()}));
jest.mock("@/features/composer/hooks/useDesktopNativeShare", () => ({
  useDesktopNativeShare: () => ({ pending: false, busy: false, blocked: false, error: "", retry: jest.fn(), complete: async () => true }),
}));
const mockAgentAvailability = { status: "available", retry: jest.fn() };
jest.mock("@/features/composer/hooks/useAgentAvailability", () => ({
  useAgentAvailability: () => mockAgentAvailability,
}));
import { interactionDefaults } from "@/shared/contracts/interaction";
import * as selectedTextHooks from "@/features/selection/hooks/useSelectedTextFragments";
import { createSelectedTextFragment, selectedTextReferenceToAttachment } from "@/features/selection/lib/selectedTextReference";
import React, { act } from "react";
import { randomUUID } from "node:crypto";
beforeAll(() => { Object.defineProperty(crypto, "randomUUID", {value: randomUUID, configurable: true}); });
afterAll(() => { Reflect.deleteProperty(crypto, "randomUUID"); });
import { createRoot } from "react-dom/client";
import { appReducer } from "@/app/state/reducer";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/state";
import { ComposerArea } from "@/features/composer/components/ComposerArea";
import * as engineSessionHooks from "@/features/composer/hooks/useEngineSession";

jest.mock("@/shared/data", () => ({ ...jest.requireActual("@/shared/data"), uploadFile: jest.fn() }));
jest.mock("@/shared/data/api/requests/agentEngine", () => ({ previewEngineConfig: jest.fn().mockResolvedValue({data: {engineId: "plugin/kimi", configOptions: []}}), prepareEngineSession: jest.fn(), configureEngineSession: jest.fn(), getEngineAuthStatus: jest.fn(), startEngineAuth: jest.fn(), cancelEngineAuth: jest.fn() }));

const mockAntdMessage = {
  warning: jest.fn(),
  error: jest.fn(),
};

jest.mock("@/features/terminal/components/TerminalPane", () => ({ TerminalPane: () => null }));

jest.mock("@/shared/icons/agent", () => ({ AgentIcon: () => React.createElement("span") }));

jest.mock("antd", () => ({
  Input: () => React.createElement("input"),
  Button: ({children, disabled}: React.PropsWithChildren<{disabled?: boolean}>) => React.createElement("button", {disabled}, children),
  Modal: ({open, children}: React.PropsWithChildren<{open?: boolean}>) => open ? React.createElement("div", {role: "dialog"}, children) : null,
  App: {
    useApp: () => ({ message: mockAntdMessage }),
  },
  Flex: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { className: "ant-flex" }, children),
  Popover: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { className: "ant-popover" }, children),
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

const mockComposerPopoverProps: Array<Record<string, any>> = [];

jest.mock("@/features/composer/components/ComposerPopover", () => ({
  ComposerPopover: (props: Record<string, any>) => {
    mockComposerPopoverProps.push(props);
    return React.createElement("div", { className: "composer-popover" }, props.children);
  },
}));

jest.mock("@/features/composer/components/SteerBar", () => ({
  SteerBar: () => React.createElement("div", null, "steer"),
}));

jest.mock("@/features/command-center/components/CommandOverlayProvider", () => ({
  useCommandOverlayOpen: () => false,
}));

jest.mock("@/features/search/components/GlobalSearchOverlayProvider", () => ({
  useGlobalSearchOpen: () => false,
}));

jest.mock("@/shared/config/featureFlags", () => ({
  isVoiceEnabled: () => false,
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
  ComposerAttachments: ({attachments}: {attachments: Array<{name:string}>}) =>
    React.createElement("div", { className: "composer-attachments" }, ...attachments.map(item=>React.createElement("span",{key:item.name},item.name))),
}));

const mockComposerInputProps: Array<Record<string, any>> = [];
const mockComposerActionsProps: Array<Record<string, any>> = [];
const mockResolveCurrentWorkerSummary = jest.fn(() => null);
const mockUseAgentSkillsQuery = jest.fn(() => ({
  data: null,
  status: "idle",
}));
const mockHostRequiredSkills = {
  agentKey: "",
  skills: [] as string[],
};
const mockHandleFileDrop = jest.fn();
let mockUseRealAttachments = false;
const mockCloseMention = jest.fn();
const mockSetSlashDismissed = jest.fn();
const mockComposerAttachmentsState = {
  sendAttachmentMeta: [] as unknown[],
  sendReferences: [] as unknown[],
};

jest.mock("@/features/composer/components/ComposerInput", () => ({
  ComposerInput: (props: Record<string, any>) => {
    mockComposerInputProps.push(props);
    return React.createElement("div", { className: "composer-input" }, props.renderAttachments?.(null, 0));
  },
}));

jest.mock("@/features/composer/components/ComposerActions", () => ({
  ComposerActions: (props: Record<string, any>) => {
    mockComposerActionsProps.push(props);
    return React.createElement("div", { className: "composer-actions" }, props.statusNotice);
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
  supportsActiveRunContextCompact: () => true,
}));

jest.mock("@/features/composer/hooks/useComposerSkillMenuQuery", () => ({
  useComposerSkillMenuQuery: (...args: unknown[]) => mockUseAgentSkillsQuery(...args),
}));

jest.mock("@/features/composer/components/HostRequiredSkillsContext", () => ({
  useHostRequiredSkills: () => mockHostRequiredSkills,
}));

jest.mock("@/features/composer/lib/slashCommands", () => ({
  getLatestQueryText: () => "",
}));

jest.mock("@/features/timeline/lib/timelineDisplay", () => ({
  buildTimelineDisplayItems: () => [],
}));

jest.mock("@/features/composer/hooks/useSpeechInput", () => ({
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
  useComposerAttachments: (input: unknown) => mockUseRealAttachments
    ? jest.requireActual("@/features/composer/hooks/useComposerAttachments").useComposerAttachments(input)
    : ({
    attachmentChatId: "",
    attachments: [],
    canCaptureDesktopScreenshot: false,
    captureDesktopScreenshot: jest.fn(),
    clearComposerAttachments: jest.fn(),
    fileInputRef: React.createRef(),
    handleFileDragOver: jest.fn(),
    handleFileDrop: mockHandleFileDrop,
    handleFileSelection: jest.fn(),
    handleFilePaste: jest.fn(),
    handleRemoveAttachment: jest.fn(),
    hasStagedAttachments: false,
    hasUploadingAttachments: false,
    isCapturingDesktopScreenshot: false,
    openFilePicker: jest.fn(),
    stageReviewAttachment: jest.fn(),
    sendAttachmentMeta: mockComposerAttachmentsState.sendAttachmentMeta,
    sendReferences: mockComposerAttachmentsState.sendReferences,
    useUnifiedComposerAttachmentRow: false,
    uploadStagedAttachments: jest.fn(async () => true),
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
    closeMention: mockCloseMention,
    selectMentionByIndex: jest.fn(),
    updateMentionSuggestions: jest.fn(),
  }),
}));

const mockComposerSendInputs: Array<Record<string, unknown>> = [];
jest.mock("@/features/composer/hooks/useComposerSend", () => ({
  useComposerSend: (input: Record<string, unknown>) => {
    mockComposerSendInputs.push(input);
    return {
    applyComposerDraft: jest.fn(),
    executeSlashCommand: jest.fn(),
    handleCancelSteer: jest.fn(),
    handleSend: jest.fn(),
    handleSteer: jest.fn(),
    interruptCurrentRun: jest.fn(),
    };
  },
}));
jest.mock("@/features/composer/hooks/useDesktopSelectionActions", () => ({
  useDesktopSelectionActions: () => ({ handleAction: jest.fn() }),
}));
jest.mock("@/features/selection/components/SelectionAnnotations", () => ({ SelectionAnnotations: () => null }));
jest.mock("@/features/selection/components/BrowserSelectionToolbar", () => ({ BrowserSelectionToolbar: () => null }));
jest.mock("@/features/composer/components/BrowserSelectionPanels", () => ({ BrowserSelectionPanels: () => null }));

const mockUseComposerSlash = jest.fn(
  (_input: Record<string, unknown>) => ({
    activeSlashIndex: 0,
    refetchSlashSkills: jest.fn(),
    selectSlashItem: jest.fn(),
    setActiveSlashIndex: jest.fn(),
    setSlashDismissed: mockSetSlashDismissed,
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

jest.mock("@/features/composer/hooks/useComposerWonders", () => ({
  useComposerWonders: jest.fn(() => ({
    sampledIntroduction: "Introduction from detail",
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
    mockUseRealAttachments = false;
    mockAgentAvailability.status = "available";
    mockHandleFileDrop.mockClear();
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    mockComposerInputProps.length = 0;
    mockComposerActionsProps.length = 0;
    mockComposerSendInputs.length = 0;
    mockComposerPopoverProps.length = 0;
    mockComposerAttachmentsState.sendAttachmentMeta = [];
    mockComposerAttachmentsState.sendReferences = [];
    mockComposerAwaitingState.isAwaitingActive = false;
    mockUseRuntimeAccessLevel.mockClear();
    mockResolveCurrentWorkerSummary.mockReset();
    mockResolveCurrentWorkerSummary.mockReturnValue(null);
    mockUseAgentSkillsQuery.mockReset();
    mockUseAgentSkillsQuery.mockReturnValue({ data: null, status: "idle" });
    mockHostRequiredSkills.agentKey = "";
    mockHostRequiredSkills.skills = [];
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

  function getDropZoneProps() {
    renderToStaticMarkup(React.createElement(ComposerArea));
    const stack = mockComposerPopoverProps[0].children;
    return React.Children.toArray(stack.props.children)
      .find((child: any) => child.props?.onDrop) as React.ReactElement<React.HTMLAttributes<HTMLDivElement>>;
  }

  it("handles file drops only on the composer frame", () => {
    mockResolveCurrentWorkerSummary.mockReturnValue({
      type: "agent", sourceId: "agent", relatedChats: [],
      raw: { mode: "REACT", interactionConfig: interactionDefaults("REACT") },
    });
    const zone = getDropZoneProps();
    const event = { dataTransfer: { types: ["Files"], files: [{ name: "sample.txt" }] }, preventDefault: jest.fn(), stopPropagation: jest.fn() };
    zone.props.onDrop!(event as any);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mockHandleFileDrop).toHaveBeenCalledTimes(1);
    expect(mockHandleFileDrop).toHaveBeenCalledWith(event);
    expect(mockComposerInputProps[0].onDrop).toBeUndefined();
    expect(mockComposerInputProps[0].onDragOver).toBeUndefined();
    expect(zone.props.onDragEnter).toBeDefined();
    expect(zone.props.onDragLeave).toBeDefined();
  });

  it("prevents file navigation without uploading while input is disabled", () => {
    mockAgentAvailability.status = "unavailable";
    const zone = getDropZoneProps();
    const event = { dataTransfer: { types: ["Files"], files: [{ name: "sample.txt" }] }, preventDefault: jest.fn(), stopPropagation: jest.fn() };
    zone.props.onDrop!(event as any);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mockHandleFileDrop).not.toHaveBeenCalled();
    zone.props.onDragOver!(event as any);
    expect((event.dataTransfer as any).dropEffect).toBe("none");
  });

  it("does not intercept plain text drops", () => {
    const zone = getDropZoneProps();
    const event = { dataTransfer: { types: ["text/plain"], files: [] }, preventDefault: jest.fn() };
    zone.props.onDragEnter!(event as any);
    zone.props.onDrop!(event as any);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mockHandleFileDrop).not.toHaveBeenCalled();
  });

  it("keeps disabled inputs mounted and shows the unavailable link in the action row", () => {
    mockAgentAvailability.status = "unavailable";
    mockResolveCurrentWorkerSummary.mockReturnValue({ type: "agent", sourceId: "deleted", relatedChats: [], raw: null });
    mockComposerAwaitingState.isAwaitingActive = true;
    const html = renderToStaticMarkup(React.createElement(ComposerArea));
    expect(html).toContain('href="/agents/deleted"');
    expect(html).toContain("composer.agent.unavailable");
    expect(html).not.toContain("awaiting-shell");
    expect(mockComposerInputProps[0].disabled).toBe(true);
    expect(mockComposerActionsProps[0].sendDisabled).toBe(true);
    expect(mockComposerActionsProps[0].interruptDisabled).toBe(false);
  });
  it.each(["checking", "authentication_required", "forbidden", "error"])("renders %s separately from configuration failure", status => {
    mockAgentAvailability.status = status;
    const html = renderToStaticMarkup(React.createElement(ComposerArea));
    expect(html).toContain(`composer.agent.${status}`);
    expect(html).not.toContain('href="/agents/');
    expect(mockComposerInputProps[0].disabled).toBe(status !== "checking");
    expect(mockComposerActionsProps[0].sendDisabled).toBe(true);
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
    expect(mockComposerInputProps[0].placeholder).toBe("Introduction from detail");
    expect(useComposerWonders.mock.calls[0][0].isBlankConversation).toBe(true);
    expect(useComposerWonders.mock.calls[0][0].showWonders).toBe(false);
  });

  it.each([
    [true, "", true],
    [true, "existing-chat", false],
    [false, "", false],
    [false, "existing-chat", false],
  ])("limits the context bar to an enabled new chat (%s, %s)", (enabled, chatId, visible) => {
    const state = { ...createInitialState(), chatId };
    useAppState.mockReturnValue(state);
    useAppContext.mockReturnValue({ stateRef: { current: state } });
    const html = renderToStaticMarkup(React.createElement(ComposerArea, {
      enableNewChatContext: enabled,
    }));
    expect(html.includes('aria-label="composer.context.label"')).toBe(visible);
  });

  it("does not opt other composer surfaces into the context bar by default", () => {
    const html = renderToStaticMarkup(React.createElement(ComposerArea));
    expect(html).not.toContain('aria-label="composer.context.label"');
  });

  it("disables the composer and hides stale awaiting UI during a chat transition", () => {
    const state = createInitialState();
    state.chatTransition = {
      seq: 1,
      sourceChatId: "chat_old",
      targetChatId: "chat_new",
      phase: "loading",
      kind: "history-switch",
      displayMode: "blocking",
      focusComposerOnReady: false,
      error: "",
    };
    state.activeAwaiting = {
      mode: "approval",
      awaitingId: "await_old",
    } as never;
    mockComposerAwaitingState.isAwaitingActive = true;
    useAppState.mockReturnValue(state);
    useAppContext.mockReturnValue({ stateRef: { current: state } });

    const html = renderToStaticMarkup(React.createElement(ComposerArea));

    expect(html).not.toContain("awaiting-shell");
    expect(mockComposerInputProps[0].disabled).toBe(true);
    expect(mockComposerActionsProps[0].interactionDisabled).toBe(true);
    expect(mockComposerActionsProps[0].sendDisabled).toBe(true);
  });

  it("activates engine configuration when the selected Chat is ready without composer interaction", () => {
    const probe = jest.spyOn(engineSessionHooks, "useEngineSession");
    mockResolveCurrentWorkerSummary.mockReturnValue({
      type: "agent", sourceId: "project", name: "Project", raw: {engine: "acp", meta: {engineId: "plugin/agent"}},
    });
    const state = createInitialState();
    state.chatId = "chat_new";
    state.chatTransition = {
      seq: 1, sourceChatId: "chat_old", targetChatId: "chat_new", phase: "loading",
      kind: "history-switch", displayMode: "blocking", focusComposerOnReady: false, error: "",
    };
    try {
      useAppState.mockReturnValue(state);
      useAppContext.mockReturnValue({stateRef: {current: state}});
      renderToStaticMarkup(React.createElement(ComposerArea));
      expect(probe).toHaveBeenLastCalledWith(expect.objectContaining({enabled: false, active: false, chatId: "chat_new"}));
      const ready = {...createInitialState(), chatId: "chat_new"};
      useAppState.mockReturnValue(ready);
      useAppContext.mockReturnValue({stateRef: {current: ready}});
      renderToStaticMarkup(React.createElement(ComposerArea));
      expect(probe).toHaveBeenLastCalledWith(expect.objectContaining({enabled: true, active: true, chatId: "chat_new"}));
    } finally { probe.mockRestore(); }
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

  it.each([true, false])("uses fresh selection references for send eligibility (running=%s)", (running) => {
    const fragment = createSelectedTextFragment({ text: "selected passage", targetId: "message-a", sourceKind: "message" })!;
    const hook = jest.spyOn(selectedTextHooks, "useSelectedTextFragments").mockReturnValue({
      fragments: [fragment], references: [fragment.reference], attachments: [selectedTextReferenceToAttachment(fragment)],
      addFragment: jest.fn(), removeFragment: jest.fn(), updateAnnotation: jest.fn(),
    });
    const state = { ...createInitialState(), chatId: "chat-a", streaming: running,
      currentChatActiveRun: running ? { chatId: "chat-a", runId: "run-a", agentKey: "agent-a" } : null };
    useAppState.mockReturnValue(state);
    useAppContext.mockReturnValue({ stateRef: { current: state } });
    try {
      renderToStaticMarkup(React.createElement(ComposerArea));
      expect(mockComposerActionsProps[0].sendDisabled).toBe(!running);
    } finally { hook.mockRestore(); }
  });

  it("previews restored steer selections but requires query text when idle", () => {
    const reference = { id: "selection-restored", type: "selection", name: "Selected text",
      size: 12, mimeType: "text/plain", text: "restored text", meta: { sourceKind: "message" } };
    mockComposerAttachmentsState.sendReferences = [reference];
    mockComposerAttachmentsState.sendAttachmentMeta = [reference];
    const html = renderToStaticMarkup(React.createElement(ComposerArea));
    expect(html).toContain("selection.fragment.annotations");
    expect(mockComposerActionsProps[0].sendDisabled).toBe(true);
  });

  it.each([
    ["GENERAL", true], ["KBASE", true], ["KBASE", false], ["CODER", false],
  ])("takes the %s editing entry (%p) from the Platform and starts it off", (mode, showEditingMode) => {
    mockResolveCurrentWorkerSummary.mockReturnValue({
      type: "agent",
      sourceId: "knowledge",
      displayName: "Knowledge",
      relatedChats: [],
      raw: { mode, interactionConfig: { ...interactionDefaults(mode), showEditingMode, showPlanningMode: !showEditingMode } },
    });

    renderToStaticMarkup(React.createElement(ComposerArea));

    // The mode decides nothing here: the same mode follows whatever is resolved.
    expect(mockComposerActionsProps[0]).toEqual(
      expect.objectContaining({
        canUseEditingMode: showEditingMode,
        canUsePlanningMode: !showEditingMode,
        editingMode: false,
      }),
    );
    expect(mockUseComposerSlash).toHaveBeenCalledWith(
      expect.objectContaining({
        canUseEditingMode: showEditingMode,
      }),
    );
  });

  it.each([true, false])("keeps host skill references when manual selection is enabled=%s", (skillsEnabled) => {
    const state = createInitialState();
    mockResolveCurrentWorkerSummary.mockReturnValue({
      type: "agent",
      sourceId: "cutej",
      displayName: "小君",
      relatedChats: [],
      raw: { mode: "REACT", engine: skillsEnabled ? "native" : "acp", interactionConfig: {
        ...interactionDefaults("REACT"), attachment: { ...interactionDefaults("REACT").attachment, skills: skillsEnabled },
      } },
    });
    mockHostRequiredSkills.agentKey = "cutej";
    mockHostRequiredSkills.skills = ["skill-creator"];
    mockUseAgentSkillsQuery.mockReturnValue({
      data: {
        agentKey: "cutej",
        skills: [
          {
            id: "skill-creator",
            displayName: "技能创建",
            configured: true,
          },
        ],
      },
      status: "success",
    });
    useAppState.mockReturnValue(state);
    useAppContext.mockReturnValue({ stateRef: { current: state } });

    const html = renderToStaticMarkup(React.createElement(ComposerArea));

    expect(html).toContain("技能创建");
    expect(mockComposerSendInputs.at(-1)?.sendReferences).toEqual([
      { type: "skill", id: "skill-creator", name: "技能创建" },
    ]);
    expect(mockUseAgentSkillsQuery).toHaveBeenCalledWith("cutej", {
      enabled: true,
    });
  });

  it("mounts slash palette popover outside clipped composer containers", () => {
    const body = document.body;

    renderToStaticMarkup(React.createElement(ComposerArea));

    expect(mockComposerPopoverProps[0].getPopupContainer()).toBe(body);
  });
  it("executes the component effects without losing choices while details are pending", () => {
    const state = {...createInitialState(), chatId: "chat", planningMode: true, editingMode: true};
    const dispatch = jest.fn();
    useAppState.mockReturnValue(state);
    useAppDispatch.mockReturnValue(dispatch);
    useAppContext.mockReturnValue({stateRef: {current: state}, dispatch});
    mockResolveCurrentWorkerSummary.mockReturnValue({
      type: "agent", sourceId: "agent", relatedChats: [], raw: {mode: "KBASE"},
    });
    const effects: React.EffectCallback[] = [];
    const spy = jest.spyOn(React, "useEffect").mockImplementation(effect => {effects.push(effect);});
    try {
      renderToStaticMarkup(React.createElement(ComposerArea));
      for (const name of ["shouldClearPlanningMode", "resolveEditingModeSync"]) {
        const effect = effects.find(callback => String(callback).includes(name));
        expect(effect).toBeDefined();
        effect!();
      }
      expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({type: "SET_PLANNING_MODE"}));
      expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({type: "SET_EDITING_MODE"}));
    } finally {
      spy.mockRestore();
    }
  });

  it.each([undefined, false])("executes the component effect to restore an active Run over %p", (current) => {
    const state = {...createInitialState(), chatId: "chat", editingMode: current,
      currentChatActiveRun: {chatId: "chat", runId: "running", editingMode: true}};
    const dispatch = jest.fn();
    useAppState.mockReturnValue(state);
    useAppDispatch.mockReturnValue(dispatch);
    useAppContext.mockReturnValue({stateRef: {current: state}, dispatch});
    mockResolveCurrentWorkerSummary.mockReturnValue({
      type: "agent", sourceId: "agent", relatedChats: [],
      raw: {mode: "KBASE", interactionConfig: interactionDefaults("KBASE")},
    });
    const effects: React.EffectCallback[] = [];
    const spy = jest.spyOn(React, "useEffect").mockImplementation(effect => {effects.push(effect);});
    try {
      renderToStaticMarkup(React.createElement(ComposerArea));
      const effect = effects.find(callback => String(callback).includes("resolveEditingModeSync"));
      expect(effect).toBeDefined();
      effect!();
      expect(dispatch).toHaveBeenCalledWith({type: "SET_EDITING_MODE", enabled: true});
    } finally {
      spy.mockRestore();
    }
  });

  it.each(["", "previous-upload-chat"])("uses one Chat for image upload, engine preparation and send (restored=%s)", async (uploadChatId) => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const descriptor = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
    Object.defineProperty(crypto, "randomUUID", {configurable:true,value:()=>"reserved-engine-chat"});
    mockUseRealAttachments = true;
    const worker = {type:"agent", sourceId:"kimi", relatedChats:[], raw:{engine:"acp", meta:{engineId:"plugin/kimi"}, interactionConfig:interactionDefaults("CODER")}};
    mockResolveCurrentWorkerSummary.mockReturnValue(worker);
    let state = {...createInitialState(), workerSelectionKey:"agent:kimi", pendingNewChatAgentKey:"kimi", composerUploadChatId:uploadChatId};
    const upload = jest.requireMock("@/shared/data").uploadFile as jest.Mock;
    upload.mockReset();
    upload.mockImplementation(async ({chatId,filename}: any) => ({data:{chatId:chatId || "server-upload-chat", upload:{type:"file",name:filename,url:"@chat/"+filename,mimeType:"image/png",sizeBytes:843408}}}));
    const prepare = jest.requireMock("@/shared/data/api/requests/agentEngine").prepareEngineSession as jest.Mock;
    prepare.mockReset();
    prepare.mockImplementation(async ({chatId}: any) => ({data:{chatId,engineId:"plugin/kimi",preparationId:"prepared",configRevision:1,configOptions:[]}}));
    function Harness() {
      const [current, dispatch] = React.useReducer(appReducer, state);
      state=current;
      useAppState.mockReturnValue(current); useAppDispatch.mockReturnValue(dispatch);
      useAppContext.mockReturnValue({stateRef:{current}});
      return React.createElement(ComposerArea);
    }
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const stack = mockComposerPopoverProps.at(-1)!.children;
      const dropZone = React.Children.toArray(stack.props.children)
        .find((child: any) => child.props?.onDrop) as React.ReactElement<React.HTMLAttributes<HTMLDivElement>>;
      await act(async () => dropZone.props.onDrop!({
        preventDefault: jest.fn(), stopPropagation: jest.fn(),
        dataTransfer: { types: ["Files"], files: [new File([new Uint8Array(843408)], "图片.png", {type: "image/png"})] },
      } as any));
      const send = mockComposerSendInputs.at(-1)!;
      await act(async () => { expect(await (send.prepareSend as () => Promise<boolean>)()).toBe(true); });
      const sentChatId = mockComposerSendInputs.at(-1)!.attachmentChatId;
      expect(upload).toHaveBeenCalledWith(expect.objectContaining({chatId:sentChatId}));
      expect(state.composerUploadChatId).toBe(sentChatId);
      expect(prepare).toHaveBeenLastCalledWith({chatId:sentChatId,agentKey:"kimi"}, expect.any(AbortSignal));
      if(uploadChatId) expect(sentChatId).toBe(uploadChatId);
    } finally {
      act(() => root.unmount());
      if (descriptor) Object.defineProperty(crypto,"randomUUID",descriptor); else Reflect.deleteProperty(crypto,"randomUUID");
    }
  });

  it("reselects skills without losing the restored image or resurrecting the previous skill", () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    mockUseRealAttachments = true;
    const worker = {type:"agent", sourceId:"kimi", relatedChats:[], raw:{mode:"CODER", interactionConfig:interactionDefaults("CODER")}};
    mockResolveCurrentWorkerSummary.mockReturnValue(worker);
    const image = {type:"file",id:"picture",name:"picture.png",url:"resource://picture",mimeType:"image/png"};
    let state = {...createInitialState(), workerSelectionKey:"agent:kimi", pendingNewChatAgentKey:"kimi"};
    let dispatch!: React.Dispatch<any>;
    const Harness = () => {
      const [current, send] = React.useReducer(appReducer, state);
      state = current; dispatch = send;
      useAppState.mockReturnValue(current);
      useAppDispatch.mockReturnValue(send);
      useAppContext.mockReturnValue({stateRef:{current}});
      return React.createElement(ComposerArea);
    };
    const root = createRoot(document.createElement("div"));
    const references = () => mockComposerSendInputs.at(-1)!.sendReferences as any[];
    try {
      act(() => root.render(React.createElement(Harness)));
      act(() => dispatch({type:"SET_RESTORED_STEER_REFERENCES",chatId:"",references:[image,{type:"skill",id:"design-a",name:"Design A"}]}));
      expect(references()).toHaveLength(2);
      act(() => mockComposerActionsProps.at(-1)!.onSelectSkill({id:"design-b",name:"Design B"}));
      expect(references()).toEqual(expect.arrayContaining([image,expect.objectContaining({type:"skill",id:"design-b"})]));
      expect(references()).toHaveLength(2);
      act(() => mockComposerActionsProps.at(-1)!.onSelectSkills([{id:"design-c",name:"Design C"}],true,"design-package"));
      expect(references()).toEqual(expect.arrayContaining([image,expect.objectContaining({type:"skill",id:"design-c"})]));
      expect(references().filter(ref=>ref.type==="skill").map(ref=>ref.id)).not.toContain("design-a");
    } finally { act(() => root.unmount()); }
  });

});
