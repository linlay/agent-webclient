/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { getChats, searchGlobal } from "@/shared/data";
import {
  AddMenuTrigger,
  type AddMenuTriggerProps,
} from "@/features/composer/components/ComposerAddMenu";

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en-US" }),
}));

jest.mock("@/shared/data", () => ({
  ...jest.requireActual("@/shared/data"),
  getChats: jest.fn(),
  searchGlobal: jest.fn(),
}));

let mockSkillData: any = { skills: [] };
let mockPinnedSkillIds: string[] = [];

jest.mock("@/features/composer/hooks/useComposerSkillMenuQuery", () => ({
  useComposerSkillMenuQuery: () => ({
    pinnedSkillIds: mockPinnedSkillIds, toggleSkillPin: jest.fn(), pinsDisabled: false, pinError: null, refreshPins: jest.fn(),
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
    Popover: ({ children, content, open, onOpenChange, trigger }: any) =>
      React.createElement(
        "div",
        { "data-popover-trigger": Array.isArray(trigger) ? trigger.join(",") : trigger, onMouseLeave: () => onOpenChange?.(false) },
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
    jest.mocked(getChats).mockReset().mockResolvedValue({
      status: 200, code: 0, msg: "", data: [{ chatId: "recent", chatName: "Recent chat" }],
    });
    jest.mocked(searchGlobal).mockReset().mockResolvedValue({
      status: 200, code: 0, msg: "", data: { query: "needle", count: 1, results: [{
        chatId: "older", chatName: "Body match with unrelated title", kind: "message", timestamp: 1, snippet: "needle", score: 1,
      }] },
    });
    mockSkillData = { skills: [] };
    mockPinnedSkillIds = [];
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
      selectedSkillIds: [],
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
    jest.useRealTimers();
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
  const openChats = () => {
    openMenu();
    const section = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find(button => button.textContent?.includes("composer.addMenu.section.chat"))!;
    act(() => section.click());
  };
  const openSkills = () => {
    openMenu();
    const section = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find(button => button.textContent?.includes("composer.addMenu.section.skills"))!;
    act(() => section.click());
  };
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

  it("switches from bounded preview to server search and adds a body-matched Chat reference", async () => {
    jest.useFakeTimers();
    render();
    openChats();
    await act(async () => {});
    expect(getChats).toHaveBeenCalledWith({ agentKey: "agent-a", limit: 25 });
    expect(searchGlobal).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Recent chat");
    const input = container.querySelector<HTMLInputElement>('input[placeholder="composer.addMenu.chat.search"]')!;
    await act(async () => {
      Simulate.change(input, { target: { value: "needle" } } as any);
    });
    await act(async () => jest.advanceTimersByTime(250));
    expect(searchGlobal).toHaveBeenCalledWith({ query: "needle", agentKey: "agent-a", limit: 75 });
    const row = [...container.querySelectorAll<HTMLButtonElement>(".composer-add-menu-detail-item")]
      .find(button => button.textContent?.includes("Body match with unrelated title"))!;
    expect(row).toBeDefined();
    await act(async () => row.click());
    expect(props.onAddReference).toHaveBeenCalledWith({
      type: "chat", id: "older", name: "Body match with unrelated title",
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("pauses chat search during composition and restores the preview when cleared", async () => {
    jest.useFakeTimers();
    render();
    openChats();
    await act(async () => {});
    const input = container.querySelector<HTMLInputElement>('input[placeholder="composer.addMenu.chat.search"]')!;
    await act(async () => {
      Simulate.compositionStart(input);
      Simulate.change(input, { target: { value: "你好" } } as any);
    });
    await act(async () => jest.advanceTimersByTime(1000));
    expect(searchGlobal).not.toHaveBeenCalled();
    await act(async () => Simulate.compositionEnd(input));
    await act(async () => jest.advanceTimersByTime(250));
    expect(searchGlobal).toHaveBeenCalledWith({ query: "你好", agentKey: "agent-a", limit: 75 });
    await act(async () => Simulate.change(input, { target: { value: "" } } as any));
    expect(container.textContent).toContain("Recent chat");
    expect(container.textContent).not.toContain("Body match with unrelated title");
    expect(getChats).toHaveBeenCalledTimes(1);
  });

  it("shows request failures with a working retry instead of an empty Chat list", async () => {
    jest.mocked(getChats).mockRejectedValueOnce(new Error("offline"));
    render();
    openChats();
    await act(async () => {});
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("composer.addMenu.chat.loadFailed");
    expect(container.textContent).not.toContain("composer.addMenu.chat.empty");
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent === "composer.addMenu.chat.retry")!;
    await act(async () => retry.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Recent chat");
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

  it("selects a library without checkboxes and closes the whole menu while preserving other choices", () => {
    props.selectedKbases = [{ id: "existing", name: "Existing library" }];
    props.kbaseCatalog = {
      status: "success",
      refresh: jest.fn(),
      data: {
        agentKey: "agent-a",
        capability: { available: true },
        libraries: [
          { id: "existing", name: "Existing library", collections: [], readable: true, indexing: false, degraded: false },
          { id: "new", name: "New library", collections: [], readable: true, indexing: false, degraded: false },
          { id: "unavailable", name: "Unavailable library", collections: [], readable: false, indexing: true, degraded: false },
        ],
      },
    };
    props.onSelectKbases = jest.fn(items => {
      props.selectedKbases = items;
      render();
    });
    const openKbases = () => {
      openMenu();
      const section = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find(button => button.textContent?.includes("kbase.title"))!;
      act(() => section.click());
      return section;
    };
    render();
    const nav = openKbases();
    act(() => Simulate.focus(container.querySelector<HTMLInputElement>('input[aria-label="kbase.search"]')!));
    act(() => Simulate.mouseLeave(nav.closest('[data-popover-trigger="hover,click"]')!));
    expect(container.querySelector('[data-section="kbases"]')).not.toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Existing library"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Unavailable library"]')?.disabled).toBe(true);
    click('button[aria-label="Unavailable library"]');
    expect(props.onSelectKbases).not.toHaveBeenCalled();
    expect(container.querySelector('[role="menu"]')).not.toBeNull();

    click('button[aria-label="New library"]');
    expect(props.onSelectKbases).toHaveBeenLastCalledWith([
      { id: "existing", name: "Existing library" },
      { id: "new", name: "New library" },
    ]);
    expect(container.querySelector('[data-section="kbases"]')).toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();

    openKbases();
    expect(container.querySelector('button[aria-label="New library"]')?.getAttribute("aria-pressed")).toBe("true");
    click('button[aria-label="Existing library"]');
    expect(props.onSelectKbases).toHaveBeenLastCalledWith([{ id: "new", name: "New library" }]);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("groups package members under a tree without duplicate standalone rows", () => {
    mockSkillData = {
      skills: [{ id: "word", name: "Word", configured: false }, { id: "other", name: "Other", configured: false }],
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
    expect(props.onSelectSkills).toHaveBeenCalledWith([mockSkillData.skills[0]], true, "office");
  });

  it("keeps pinned skills first in the mixed list and sorts unpinned items by name", () => {
    mockSkillData = {
      skills: [
        { id: "first", displayName: "First", configured: false },
        { id: "latest", displayName: "Latest", configured: false },
        { id: "office/first", displayName: "Package member", configured: false },
      ],
      packages: [{ id: "office", displayName: "Office", skills: [{ id: "office/first" }], status: "ready" }],
    };
    mockPinnedSkillIds = ["latest", "first", "office/first"];
    render(); openMenu();
    const section = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find(button => button.textContent?.includes("composer.addMenu.section.skills"))!;
    act(() => section.click());
    const rows = () => [...container.querySelectorAll('.composer-add-menu-skill-row, summary')].map(row => row.textContent);
    expect(rows()[0]).toContain("Latest");
    expect(rows()[1]).toContain("First");
    expect(rows()[2]).toContain("Office");
    expect(container.querySelectorAll('.composer-add-menu-skill-row')).toHaveLength(2);
    mockPinnedSkillIds = ["latest"];
    render();
    expect(rows()[0]).toContain("Latest");
    expect(rows()[1]).toContain("First");
    expect(rows()[2]).toContain("Office");
  });

  it("puts selected skills and partially selected packages before pins without treating Agent configuration as selection", () => {
    mockSkillData = {
      skills: [
        { id: "zulu", displayName: "Zulu", configured: false },
        { id: "alpha", displayName: "Alpha", configured: true },
        { id: "latest", displayName: "Latest", configured: false },
        { id: "office/member", displayName: "Word", configured: false },
        { id: "office/other", displayName: "Slides", configured: false },
        { id: "archive/member", displayName: "Excel", configured: true },
      ],
      packages: [
        { id: "office", displayName: "Office", skills: [{ id: "office/member" }, { id: "office/other" }], status: "ready" },
        { id: "archive", displayName: "Archive", skills: [{ id: "archive/member" }], status: "ready" },
      ],
    };
    mockPinnedSkillIds = ["latest", "archive", "zulu"];
    props.selectedSkillIds = [" ZULU ", " OFFICE/MEMBER "];
    props.lockedSkillIds = ["office/member"];
    render(); openSkills();
    const rows = [...container.querySelectorAll('.composer-add-menu-skill-row, summary')];
    expect(rows).toHaveLength(5);
    ["Zulu", "Office", "Latest", "Archive", "Alpha"].forEach((name, index) => expect(rows[index].textContent).toContain(name));
    expect(rows[0].getAttribute("aria-pressed")).toBe("true");
    expect(rows[0].querySelector('[data-material-icon="check"]')).not.toBeNull();
    expect(rows[1].getAttribute("data-selection")).toBe("partial");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Word"]')?.disabled).toBe(true);
    expect(rows[4].getAttribute("aria-pressed")).toBe("false");
    expect(rows[4].textContent).toContain("slashPalette.skill.source.agent");
    expect(rows[4].querySelector('[data-material-icon="check"]')).toBeNull();
    expect(container.querySelectorAll('.composer-add-menu-skill-row')).toHaveLength(3);
    expect(props.onSelectSkill).not.toHaveBeenCalled();
    expect(mockPinnedSkillIds).toEqual(["latest", "archive", "zulu"]);
  });

  it("keeps selection ranking stable until reopening while updating marks and preserving selection actions", () => {
    mockSkillData = { skills: [
      { id: "alpha", displayName: "Alpha", configured: false },
      { id: "zulu", displayName: "Zulu", configured: false },
    ] };
    props.selectedSkillIds = ["zulu"];
    render(); openSkills();
    const rows = () => [...container.querySelectorAll<HTMLElement>('.composer-add-menu-skill-row')];
    expect(rows().map(row => row.querySelector('b')?.textContent)).toEqual(["Zulu", "Alpha"]);
    props.selectedSkillIds = ["alpha"];
    render();
    expect(rows().map(row => row.querySelector('b')?.textContent)).toEqual(["Zulu", "Alpha"]);
    expect(rows().map(row => row.getAttribute('aria-pressed'))).toEqual(["false", "true"]);
    openMenu(); openSkills();
    expect(rows().map(row => row.querySelector('b')?.textContent)).toEqual(["Alpha", "Zulu"]);
    act(() => rows()[0].click());
    expect(props.onSelectSkill).toHaveBeenCalledWith(mockSkillData.skills[0]);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    props.selectedSkillIds = [];
    render(); openSkills();
    expect(rows().map(row => row.getAttribute('aria-pressed'))).toEqual(["false", "false"]);
  });

  it("filters one mixed list by type and restores all when the active filter is cleared", () => {
    mockSkillData = {
      skills: [
        {id:"solo",displayName:"Alpha",configured:false},
        {id:"office/member",displayName:"Member",configured:false},
      ],
      packages: [{id:"office",displayName:"Office",skills:[{id:"office/member"}],status:"ready"}],
    };
    props.selectedSkillIds = ["solo", "office/member"];
    props.onSelectSkills = jest.fn();
    render(); openMenu();
    const section = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find(button=>button.textContent?.includes("composer.addMenu.section.skills"))!;
    act(()=>section.click());
    const filter = (kind: string) => {
      const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="skillCatalog.kindFilter"]')!;
      if (trigger.getAttribute('aria-expanded') !== 'true') act(() => trigger.click());
      return document.querySelector<HTMLElement>(`.ant-dropdown:not(.ant-dropdown-hidden) [data-skill-kind="${kind}"]`)!;
    };
    const chooseKind = (kind: string) => { const option = filter(kind); act(() => option.click()); };
    const entries = () => [...container.querySelectorAll('.composer-add-menu-skill-row, summary')];
    expect(entries()).toHaveLength(2);
    expect(entries()[0].textContent).toContain('Alpha');
    expect(container.querySelector('.composer-skill-group-label')).toBeNull();
    expect(String(filter('package').closest('.ant-dropdown-menu-item')!.classList.contains('ant-dropdown-menu-item-selected'))).toBe('false');
    expect(String(filter('standalone').closest('.ant-dropdown-menu-item')!.classList.contains('ant-dropdown-menu-item-selected'))).toBe('false');
    chooseKind('package');
    expect(entries()).toHaveLength(1); expect(entries()[0].tagName).toBe('SUMMARY');
    chooseKind('standalone');
    expect(String(filter('package').closest('.ant-dropdown-menu-item')!.classList.contains('ant-dropdown-menu-item-selected'))).toBe('false');
    expect(entries()).toHaveLength(1); expect(entries()[0].textContent).toContain('Alpha');
    chooseKind('all');
    expect(entries()).toHaveLength(2);
    const input=container.querySelector<HTMLInputElement>('input[placeholder="composer.addMenu.search.skills"]')!;
    act(()=>Simulate.change(input,{target:{value:'Member'}} as any));
    expect(entries()).toHaveLength(1); expect(entries()[0].tagName).toBe('SUMMARY');
    chooseKind('standalone');
    expect(entries()).toHaveLength(0);
    expect(container.textContent).toContain('composer.addMenu.empty');
    expect(props.onSelectSkills).not.toHaveBeenCalled();
    expect(props.onSelectSkill).not.toHaveBeenCalled();
  });

  it.each(["Member", "packageComposer.select"])("keeps the skill picker open while browsing, then closes after selecting %s", (choice) => {
    mockSkillData = {
      skills: [{id:"office/member",displayName:"Member",configured:false}],
      packages: [{id:"office",displayName:"Office",skills:[{id:"office/member"}],status:"ready"}],
    };
    props.onSelectSkills = jest.fn();
    render(); openMenu();
    const nav = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find(button=>button.textContent?.includes("composer.addMenu.section.skills"))!;
    act(()=>nav.click());
    const filter=container.querySelector<HTMLButtonElement>('button[aria-label="skillCatalog.kindFilter"]')!;
    act(()=>{ Simulate.pointerDown(filter); filter.click(); });
    act(()=>document.querySelector<HTMLElement>('.ant-dropdown:not(.ant-dropdown-hidden) [data-skill-kind="package"]')!.click());
    const submenu=nav.closest('[data-popover-trigger="hover,click"]')!;
    act(()=>Simulate.mouseLeave(submenu));
    expect(filter.getAttribute("data-active")).toBe("true");
    const summary=container.querySelector('summary')!;
    act(()=>summary.click());
    act(()=>container.querySelector<HTMLButtonElement>(`button[aria-label="${choice}"]`)!.click());
    expect(props.onSelectSkills).toHaveBeenCalledWith([mockSkillData.skills[0]],true,choice === "packageComposer.select" ? "office" : undefined);
    expect(container.querySelector('[data-skill-kind="package"]')).toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

});
