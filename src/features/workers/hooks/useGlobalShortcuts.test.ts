/* ---- Global mocks for document/navigator (node environment) ---- */

const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();
const mockCreateElement = jest.fn((tag: string) => {
  const lower = tag.toLowerCase();
  return {
    tagName: tag,
    nodeName: tag,
    closest: jest.fn(() => null),
    addEventListener: jest.fn(),
    isContentEditable: false,
  };
});

(globalThis as Record<string, unknown>).document = {
  addEventListener: mockAddEventListener,
  removeEventListener: mockRemoveEventListener,
  createElement: mockCreateElement,
  body: mockCreateElement("body"),
};

(globalThis as Record<string, unknown>).navigator = { platform: "MacIntel" };

/* ---- End global mocks ---- */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GlobalShortcutLayer } from "@/features/workers/hooks/useGlobalShortcuts";

/* ---- Mock all context providers ---- */

const mockDispatch = jest.fn();
let mockAppState: Record<string, unknown> = {};

jest.mock("@/app/state/AppContext", () => ({
  useAppState: () => mockAppState,
  useAppDispatch: () => mockDispatch,
}));

const mockSettingsOverlay = {
  isAnyOverlayOpen: false,
};

jest.mock("@/features/settings/components/SettingsOverlayProvider", () => ({
  useSettingsOverlayState: () => mockSettingsOverlay,
  useSettingsOverlayActions: () => ({
    openOverlay: jest.fn(),
    closeOverlay: jest.fn(),
  }),
  SettingsOverlayProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

const mockOpenCommandOverlay = jest.fn();
let mockCommandOverlayOpen = false;

jest.mock("@/features/workers/components/CommandOverlayProvider", () => ({
  useCommandOverlayActions: () => ({
    openCommandOverlay: mockOpenCommandOverlay,
    patchCommandOverlay: jest.fn(),
    closeCommandOverlay: jest.fn(),
  }),
  useCommandOverlayOpen: () => mockCommandOverlayOpen,
  useCommandOverlayHostState: () => ({
    open: false,
    type: null,
    searchText: "",
    historySearch: "",
    activeIndex: 0,
    scope: "all" as const,
    focusArea: "search" as const,
  }),
  CommandOverlayProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

const mockOpenGlobalSearch = jest.fn();
let mockGlobalSearchOpen = false;

jest.mock("@/features/search/components/GlobalSearchOverlayProvider", () => ({
  useGlobalSearchActions: () => ({
    openGlobalSearch: mockOpenGlobalSearch,
    closeGlobalSearch: jest.fn(),
  }),
  useGlobalSearchOpen: () => mockGlobalSearchOpen,
  GlobalSearchOverlayProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

jest.mock("@/features/workers/lib/currentWorker", () => ({
  isCoderAgent: jest.fn(() => false),
}));

jest.mock("@/features/tools/components/buildin/confirm-dialog/state", () => ({
  isEditableKeyboardTarget: jest.fn(() => false),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

const { isEditableKeyboardTarget } = jest.requireMock(
  "@/features/tools/components/buildin/confirm-dialog/state",
) as {
  isEditableKeyboardTarget: jest.Mock;
};

/* ---- Helpers ---- */

type TestKeyboardEventInit = Partial<
  Omit<KeyboardEventInit, "code" | "key">
> & {
  code?: string;
  key?: string;
};

function createFakeEvent(init: TestKeyboardEventInit): KeyboardEvent {
  const doc = (globalThis as Record<string, unknown>).document as { body: unknown };
  return {
    code: init.code || "",
    key: init.key || init.code || "",
    metaKey: init.metaKey || false,
    ctrlKey: init.ctrlKey || false,
    altKey: init.altKey || false,
    shiftKey: init.shiftKey || false,
    defaultPrevented: false,
    repeat: init.repeat ?? false,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    target: init.target ?? doc.body,
    ...init,
  } as unknown as KeyboardEvent;
}

describe("useGlobalShortcuts", () => {
  let currentHandler: ((e: KeyboardEvent) => void) | null = null;

  const mockEffect = (effect: React.EffectCallback) => {
    effect();
  };

  beforeEach(() => {
    currentHandler = null;
    mockAddEventListener.mockImplementation((_type: string, handler: unknown) => {
      if (_type === "keydown") {
        currentHandler = handler as (e: KeyboardEvent) => void;
      }
    });

    mockAppState = {
      activeFrontendTool: null,
      activeAwaiting: null,
    };
    mockSettingsOverlay.isAnyOverlayOpen = false;
    mockCommandOverlayOpen = false;
    mockOpenCommandOverlay.mockClear();
    isEditableKeyboardTarget.mockReturnValue(false);
    mockCreateElement.mockClear();
    mockCreateElement.mockImplementation((tag: string) => {
      const lower = tag.toLowerCase();
      return {
        tagName: tag,
        nodeName: tag,
        closest: jest.fn(() => null),
        addEventListener: jest.fn(),
        isContentEditable: false,
      };
    });

    jest.spyOn(React, "useEffect").mockImplementation(mockEffect);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders nothing (returns null)", () => {
    const html = renderToStaticMarkup(
      React.createElement(GlobalShortcutLayer),
    );
    expect(html).toBe("");
  });

  it("registers keydown listener on mount", () => {
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    expect(mockAddEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("opens global command overlay on Meta+K (Mac)", () => {
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyK",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });
    currentHandler?.(event);
    expect(mockOpenGlobalSearch).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("opens global command overlay on Ctrl+K (non-Mac)", () => {
    const nav = (globalThis as Record<string, unknown>).navigator as { platform: string };
    const savedPlatform = nav.platform;
    nav.platform = "Win32";

    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    /* Need to re-render with the new platform - reset the mock and re-trigger */
    mockAddEventListener.mockClear();
    currentHandler = null;
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));

    const event = createFakeEvent({
      code: "KeyK",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    });
    currentHandler?.(event);
    expect(mockOpenGlobalSearch).toHaveBeenCalled();

    nav.platform = savedPlatform;
  });

  it("does not trigger on Meta+N", () => {
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyN",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does not trigger on Meta+Shift+H", () => {
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyH",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
    });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does not trigger on Meta+Shift+W", () => {
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyW",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
    });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does not trigger on plain key A", () => {
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyA",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
  });

  it("does not trigger when defaultPrevented", () => {
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyK",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });
    Object.defineProperty(event, "defaultPrevented", { value: true });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
  });

  it("does not trigger on editable target (INPUT)", () => {
    isEditableKeyboardTarget.mockReturnValue(true);
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyK",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
  });

  it("triggers Meta+K on message input despite editable target guard", () => {
    isEditableKeyboardTarget.mockReturnValue(true);
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyK",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });
    const messageInput = {
      id: "message-input",
      tagName: "TEXTAREA",
      closest: jest.fn(() => null),
    };
    Object.defineProperty(event, "target", {
      value: messageInput,
      configurable: true,
    });
    currentHandler?.(event);
    expect(mockOpenGlobalSearch).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("does not trigger when settings overlay is open", () => {
    mockSettingsOverlay.isAnyOverlayOpen = true;
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyK",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
  });

  it("does not trigger when command overlay is open", () => {
    mockCommandOverlayOpen = true;
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyK",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
  });

  it("does not trigger when activeFrontendTool is set", () => {
    mockAppState.activeFrontendTool = { name: "test-tool" };
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyK",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
  });

  it("does not trigger when activeAwaiting is set", () => {
    mockAppState.activeAwaiting = { id: "await-1" };
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyK",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
  });

  it("does not trigger with Ctrl+Alt+K (wrong modifier)", () => {
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyK",
      metaKey: true,
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
    });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
  });

  it("does not trigger on repeat events", () => {
    renderToStaticMarkup(React.createElement(GlobalShortcutLayer));
    const event = createFakeEvent({
      code: "KeyK",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      repeat: true,
    });
    currentHandler?.(event);
    expect(mockOpenCommandOverlay).not.toHaveBeenCalled();
  });
});