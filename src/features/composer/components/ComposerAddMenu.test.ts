/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AddMenuTrigger,
  type AddMenuTriggerProps,
} from "@/features/composer/components/ComposerAddMenu";

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

let mockSkillData: any = { skills: [] };
let mockPinnedSkillKeys: string[] = [];

jest.mock("@/features/composer/hooks/useComposerSkillMenuQuery", () => ({
  useComposerSkillMenuQuery: () => ({
    pinnedSkillKeys: mockPinnedSkillKeys, toggleSkillPin: jest.fn(), pinsDisabled: false, pinError: null, refreshPins: jest.fn(),
    status: "success",
    data: mockSkillData,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/features/connectors/components/AgentConnectorPicker", () => ({
  AgentConnectorPicker: () => null,
}));

// 面板内联渲染展开的 Popover 内容，便于直接断言一级/二级菜单
jest.mock("antd", () => {
  const actual = jest.requireActual("antd");
  return {
    ...actual,
    Popover: ({ children, content, open, onOpenChange }: any) =>
      React.createElement(
        "div",
        null,
        React.cloneElement(children, {
          onClick: (event: React.MouseEvent) => {
            children.props.onClick?.(event);
            onOpenChange?.(!open);
          },
        }),
        open ? content : null,
      ),
  };
});

describe("AddMenuTrigger", () => {
  let container: HTMLDivElement;
  let root: Root;
  let props: AddMenuTriggerProps;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    mockSkillData = { skills: [] };
    mockPinnedSkillKeys = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    props = {
      disabled: false,
      loading: false,
      currentChatId: "chat",
      currentAgentKey: "agent-a",
      planningMode: false,
      editingMode: false,
      canUsePlanningMode: false,
      canUseEditingMode: false,
      isMainChatRunning: false,
      canCaptureDesktopScreenshot: true,
      isCapturingDesktopScreenshot: false,
      selectedSkillKeys: [],
      onOpenFilePicker: jest.fn(),
      onCaptureScreenshot: jest.fn(),
      onAddReference: jest.fn(),
      onTogglePlanningMode: jest.fn(),
      onEditingModeChange: jest.fn(),
      onSelectSkill: jest.fn(),
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = () => act(() => root.render(React.createElement(AddMenuTrigger, props)));
  const click = (selector: string) =>
    act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
  const openFiles = () => {
    click('[aria-label="composer.addMenu.open"]');
    const section = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent?.includes("composer.addMenu.section.files"))!;
    act(() => section.click());
  };
  const openMenu = () => click('[aria-label="composer.addMenu.open"]');
  const screenshotItem = () => [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .find((button) => button.textContent?.includes("composer.addMenu.screenshot"));
  const fileItems = () => [...container.querySelectorAll<HTMLButtonElement>(".composer-add-menu-detail-item")];
  const fileItem = (label: string) =>
    fileItems().find((button) => button.textContent?.includes(label))!;

  it("renders a plus button", () => {
    render();

    const trigger = container.querySelector('[aria-label="composer.addMenu.open"]')!;
    expect(trigger).not.toBeNull();
    expect(trigger.querySelector('[data-material-icon="add"]')).not.toBeNull();
  });

  it("shows screenshot directly in the add menu and keeps file picking in the files section", () => {
    render();
    openMenu();
    expect(screenshotItem()).toBeDefined();
    const files = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent?.includes("composer.addMenu.section.files"))!;
    act(() => files.click());
    expect(fileItems().map((button) => button.textContent)).toEqual(["composer.addMenu.file"]);

    click(".composer-add-menu-detail-item");
    expect(props.onOpenFilePicker).toHaveBeenCalledTimes(1);
    expect(props.onCaptureScreenshot).not.toHaveBeenCalled();
  });

  it("captures a screenshot and closes the menu without opening the file picker", () => {
    render();
    openMenu();

    act(() => screenshotItem()!.click());

    expect(props.onCaptureScreenshot).toHaveBeenCalledTimes(1);
    expect(props.onOpenFilePicker).not.toHaveBeenCalled();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("hides the screenshot action when the desktop bridge is unavailable", () => {
    props.canCaptureDesktopScreenshot = false;
    render();
    openFiles();

    expect(fileItems().map((button) => button.textContent)).toEqual(["composer.addMenu.file"]);
    expect(screenshotItem()).toBeUndefined();
  });

  it("disables the screenshot action while a run is active or while capturing", () => {
    props.isMainChatRunning = true;
    props.screenshotDisabledReason = "composer.actions.screenshotDisabled.streaming";
    render();
    openMenu();

    const duringRun = screenshotItem()!;
    expect(duringRun.disabled).toBe(true);
    expect(duringRun.getAttribute("title")).toBe("composer.actions.screenshotDisabled.streaming");
    act(() => duringRun.click());
    expect(props.onCaptureScreenshot).not.toHaveBeenCalled();

    act(() => root.unmount());
    props.isMainChatRunning = false;
    props.isCapturingDesktopScreenshot = true;
    root = createRoot(container);
    render();
    openMenu();

    const capturing = screenshotItem()!;
    expect(capturing.disabled).toBe(true);
    expect(capturing.className).toContain("is-loading");
  });

  it("keeps the whole files section reachable while a run is active", () => {
    props.isMainChatRunning = true;
    render();
    openFiles();

    expect(fileItem("composer.addMenu.file").disabled).toBe(false);
  });

  it("closes the menu when the chat or agent changes so the popover cannot detach from the moved trigger", () => {
    render();
    openMenu();
    expect(container.querySelector('[role="menu"]')).not.toBeNull();

    props.currentChatId = "chat-next";
    render();
    expect(container.querySelector('[role="menu"]')).toBeNull();

    openMenu();
    props.currentAgentKey = "agent-b";
    render();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
  it("groups package members under a tree without duplicate standalone rows", () => {
    mockSkillData = {
      skills: [{ key: "word", name: "Word", configured: false }, { key: "other", name: "Other", configured: false }],
      packages: [{ id: "office", name: "Office", version: "1", skills: [{ id: "word" }], missingSkillIds: [], status: "ready" }],
    };
    props.onSelectSkills = jest.fn();
    render();
    openMenu();
    const section = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find(button => button.textContent?.includes("composer.addMenu.section.skills"))!;
    act(() => section.click());
    expect(container.querySelector("summary")?.textContent).toContain("Office");
    const standalone = [...container.querySelectorAll(".composer-add-menu-skill-row")].map(row => row.textContent);
    expect(standalone).toHaveLength(1);
    expect(standalone[0]).toContain("Other");
    expect(standalone[0]).not.toContain("Word");
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="packageComposer.select"]')!.click());
    expect(props.onSelectSkills).toHaveBeenCalledWith([mockSkillData.skills[0]], true);
  });

  it("puts pinned standalone skills before packages and returns unpinned skills to their group", () => {
    mockSkillData = {
      skills: [
        { key: "first", displayName: "First", configured: false },
        { key: "latest", displayName: "Latest", configured: false },
        { key: "office/first", displayName: "Package member", configured: false },
      ],
      packages: [{ id: "office", displayName: "Office", skills: [{ id: "office/first" }], status: "ready" }],
    };
    mockPinnedSkillKeys = ["latest", "first", "office/first"];
    render(); openMenu();
    const section = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find(button => button.textContent?.includes("composer.addMenu.section.skills"))!;
    act(() => section.click());
    const rows = () => [...container.querySelectorAll('.composer-add-menu-skill-row, summary')].map(row => row.textContent);
    expect(rows()[0]).toContain("Latest");
    expect(rows()[1]).toContain("First");
    expect(rows()[2]).toContain("Office");
    expect(container.querySelectorAll('.composer-add-menu-skill-row')).toHaveLength(2);
    mockPinnedSkillKeys = ["latest"];
    render();
    expect(rows()[0]).toContain("Latest");
    expect(rows()[1]).toContain("Office");
    expect(rows()[2]).toContain("First");
  });

});
