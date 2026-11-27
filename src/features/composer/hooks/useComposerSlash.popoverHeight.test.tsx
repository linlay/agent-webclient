/** @jest-environment jsdom */
import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useComposerSlash } from "@/features/composer/hooks/useComposerSlash";

jest.mock("@/features/composer/hooks/useComposerSkillMenuQuery", () => ({
  useComposerSkillMenuQuery: () => ({
    pinnedSkillIds: [],
    status: "success",
    data: { agentKey: "agent-a", skills: [], packages: [] },
    error: null,
    refetch: jest.fn(),
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let latest: ReturnType<typeof useComposerSlash> | null = null;
let host: HTMLDivElement;
let root: Root;
let anchorTop = 225;
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

function Harness() {
  const composerStackRef = useRef<HTMLDivElement>(null);
  latest = useComposerSlash({
    composerPillRef: React.createRef(),
    composerRef: React.createRef(),
    composerStackRef,
    inputValue: "/",
    currentAgentKey: "agent-a",
    isAwaitingActive: false,
    isFrontendActive: false,
    isVoiceMode: false,
    commandOverlayOpen: false,
    canUsePlanningMode: false,
    canUseEditingMode: false,
    addMenuOpen: false,
  });
  return <div ref={composerStackRef} />;
}

beforeEach(() => {
  anchorTop = 225;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  // jsdom 没有布局：用 getBoundingClientRect 模拟锚点在视口里的位置。
  jest
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement): DOMRect {
      const top = this.tagName === "DIV" ? anchorTop : 0;
      return {
        top,
        bottom: top,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

describe("useComposerSlash popover height", () => {
  it("caps the palette by the space above the composer instead of 100vh", () => {
    act(() => root.render(<Harness />));
    expect(latest!.showSlashPalette).toBe(true);
    // 视口 441px、锚点 225px：旧公式 min(360, 100vh - 120) 给 321px，会顶出视口。
    expect(latest!.slashPopoverMaxHeight).toBe(213);
  });

  it("keeps the 360px cap on a tall window", () => {
    anchorTop = 900;
    act(() => root.render(<Harness />));
    expect(latest!.slashPopoverMaxHeight).toBe(360);
  });

  it("re-measures when the window or the composer changes size", () => {
    act(() => root.render(<Harness />));
    expect(latest!.slashPopoverMaxHeight).toBe(213);

    anchorTop = 500;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(latest!.slashPopoverMaxHeight).toBe(360);
  });
});
