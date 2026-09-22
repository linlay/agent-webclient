/** @jest-environment jsdom */

import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { AddMenuTrigger, type AddMenuTriggerProps } from "./ComposerAddMenu";
import { dataQueryCache } from "@/shared/data/query/serverState";
import { usePinnedSkills } from "@/features/skills/hooks/usePinnedSkills";
import { useComposerSlash } from "@/features/composer/hooks/useComposerSlash";

let serverOrder: string[] = [];
const getAgentSkillsMock = jest.fn();
const putAgentSkillPinMock = jest.fn();
let sessionToken = "alice";
jest.mock("@/shared/data/api/routedClient", () => ({
  ...jest.requireActual("@/shared/data/api/routedClient"),
  getCurrentAccessToken: () => sessionToken,
  getAgentSkills: (...args: unknown[]) => getAgentSkillsMock(...args),
  putAgentSkillPin: (...args: unknown[]) => putAgentSkillPinMock(...args),
}));

const skills = [
  { key: "platform-admin", name: "Platform Admin", description: "Manage platform", configured: true },
  { key: "pdf", name: "PDF", description: "Read documents", configured: false },
  { key: "slides", name: "Slides", description: "Create documents", configured: false },
];

jest.mock("@/features/connectors/components/AgentConnectorPicker", () => ({ AgentConnectorPicker: () => null }));
jest.mock("@/features/skills/components/SkillIcon", () => ({ SkillIcon: () => null }));
jest.mock("@/shared/i18n", () => ({
  t: (key: string) => key,
  useI18n: () => ({ t: (key: string, params?: { name: string }) => params ? `${key} ${params.name}` : key }),
}));
jest.mock("antd", () => {
  const actual = jest.requireActual("antd");
  return {
    ...actual,
    Popover: ({ children, content, open, onOpenChange }: any) => React.createElement("div", null,
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

describe("Composer skill pins", () => {
  let container: HTMLDivElement;
  let root: Root;
  let props: AddMenuTriggerProps;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    localStorage.clear();
    dataQueryCache.clear();
    serverOrder = [];
    sessionToken = "alice";
    getAgentSkillsMock.mockReset().mockImplementation(async () => ({ data: { agentKey: "agent-a", skills, pinned: [...serverOrder] } }));
    putAgentSkillPinMock.mockReset().mockImplementation(async ({ key, pinned }: { key: string; pinned: boolean }) => {
      serverOrder = serverOrder.filter((item) => item !== key);
      if (pinned) serverOrder.unshift(key);
      return { data: { agentKey: "", skills: [], pinned: [...serverOrder] } };
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    props = {
      disabled: false, loading: false, currentChatId: "chat", currentAgentKey: "agent-a",
      planningMode: false, editingMode: false, canUsePlanningMode: false, canUseEditingMode: false,
      isMainChatRunning: false, canCaptureDesktopScreenshot: false, isCapturingDesktopScreenshot: false,
      selectedSkillKeys: [],
      onOpenFilePicker: jest.fn(), onCaptureScreenshot: jest.fn(), onAddReference: jest.fn(),
      onTogglePlanningMode: jest.fn(), onEditingModeChange: jest.fn(), onSelectSkill: jest.fn(),
    };
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  const render = () => act(() => root.render(React.createElement(AddMenuTrigger, props)));
  const click = (selector: string) => act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
  const skillRows = () => [
    ...container.querySelectorAll<HTMLElement>('.composer-add-menu-skill-select'),
  ];
  const clickSkillRow = (index = 0) => act(() => skillRows()[index].click());
  const openSkills = async () => {
    click('[aria-label="composer.addMenu.open"]');
    const section = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent?.includes("composer.addMenu.section.skills"))!;
    await act(async () => section.click());
  };
  const names = () => [...container.querySelectorAll(".composer-add-menu-skill-select b")].map((node) => node.textContent);
  const pin = async (name: string, pinned = false) => act(async () => click(`[aria-label="composer.addMenu.skill.${pinned ? "unpin" : "pin"} ${name}"]`));

  it("pins without selecting or closing, restores on remount, and unpins to catalog order", async () => {
    render();
    await openSkills();
    expect(getAgentSkillsMock).toHaveBeenCalledTimes(1);
    expect(getAgentSkillsMock).toHaveBeenCalledWith("agent-a");
    expect(container.textContent).toContain("slashPalette.skill.source.agent");
    await pin("PDF");
    await pin("Slides");
    expect(names()).toEqual(["Slides", "PDF", "Platform Admin"]);
    expect(props.onSelectSkill).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);

    act(() => root.render(null));
    render();
    await openSkills();
    expect(names()).toEqual(["Slides", "PDF", "Platform Admin"]);
    await pin("PDF", true);
    await pin("Slides", true);
    expect(names()).toEqual(["Platform Admin", "PDF", "Slides"]);

    clickSkillRow();
    expect(props.onSelectSkill).toHaveBeenCalledWith(skills[0]);
    expect(names()).toEqual([]);
  });

  it("keeps search filtering and shares pins when switching agents", async () => {
    render();
    await openSkills();
    await pin("Slides");
    const input = container.querySelector("input")!;
    act(() => Simulate.change(input, { target: { value: "documents" } } as any));
    expect(names()).toEqual(["Slides", "PDF"]);
    await pin("PDF");
    expect(input.value).toBe("documents");
    expect(names()).toEqual(["PDF", "Slides"]);

    props.currentAgentKey = "agent-b";
    await act(async () => render());
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
    expect(names()).toEqual(["PDF", "Slides"]);
    props.currentAgentKey = "agent-a";
    await act(async () => render());
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
  });

  it("allows pinning during a run while skill selection stays disabled", async () => {
    props.isMainChatRunning = true;
    props.selectedSkillKeys = ["pdf"];
    render();
    await openSkills();
    await pin("PDF");
    expect(names()[0]).toBe("PDF");
    expect(skillRows()[0].getAttribute("aria-disabled")).toBe("true");
    clickSkillRow();
    expect(props.onSelectSkill).not.toHaveBeenCalled();
  });

  it("renders direct skill actions without checkboxes and places pin at the right end of the title line", async () => {
    render();
    await openSkills();

    const rows = skillRows();
    expect(rows).toHaveLength(3);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(rows.map((row) => row.getAttribute("role"))).toEqual(["button", "button", "button"]);
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "composer.addMenu.skill.select Platform Admin",
      "composer.addMenu.skill.select PDF",
      "composer.addMenu.skill.select Slides",
    ]);

    const configuredTitle = rows[0].querySelector(".composer-add-menu-item-title")!;
    const configuredNodes = [...configuredTitle.children];
    expect(configuredNodes).toHaveLength(3);
    expect(configuredNodes[0].tagName).toBe("B");
    expect(configuredNodes[1].classList.contains("composer-add-menu-skill-tag")).toBe(true);
    expect(configuredNodes[1].textContent).toBe("slashPalette.skill.source.agent");

    // 置顶按钮位于标题末端，不占用描述右侧的独立列。
    const plainTitle = rows[1].querySelector(".composer-add-menu-item-title")!;
    const plainNodes = [...plainTitle.children];
    expect(plainNodes).toHaveLength(2);
    expect(plainNodes[0].tagName).toBe("B");
    for (const row of rows) {
      expect(row.querySelector(".composer-add-menu-item-title")?.lastElementChild?.classList.contains("composer-add-menu-skill-pin")).toBe(true);
      expect(row.querySelector(".composer-add-menu-item-copy")?.lastElementChild?.tagName).toBe("SMALL");
    }
    expect(plainTitle.querySelector(".composer-add-menu-skill-tag")).toBeNull();
  });

  it.each(["Enter", " "])("selects a skill with the %s key", async (key) => {
    render();
    await openSkills();
    act(() => Simulate.keyDown(skillRows()[0], { key }));
    expect(props.onSelectSkill).toHaveBeenCalledWith(skills[0]);
    expect(names()).toEqual([]);
  });

  it("updates slash keyboard selection and refreshes changes from another client", async () => {
    let slash: ReturnType<typeof useComposerSlash>;
    let pins: ReturnType<typeof usePinnedSkills>;
    function Harness() {
      pins = usePinnedSkills(false);
      slash = useComposerSlash({
        composerPillRef: React.createRef(), composerRef: React.createRef(), inputValue: "/",
        currentAgentKey: "agent-a", isAwaitingActive: false, isFrontendActive: false,
        isVoiceMode: false, commandOverlayOpen: false, canUsePlanningMode: false,
        canUseEditingMode: false, addMenuOpen: false,
      });
      return null;
    }
    await act(async () => root.render(React.createElement(Harness)));
    await act(async () => pins!.toggleSkillPin("slides"));
    expect(slash!.slashSkills[0].key).toBe("slides");
    expect(slash!.selectSlashItem(slash!.slashCommands.length)).toMatchObject({ key: "slides" });
    serverOrder = ["pdf"];
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(slash!.slashSkills[0].key).toBe("pdf");
  });

  it("does not change pins on save failure and ignores legacy local preferences", async () => {
    localStorage.setItem("agent-webclient.pinnedSkills.v1:agent-a", '["slides"]');
    render();
    await openSkills();
    expect(names()).toEqual(["Platform Admin", "PDF", "Slides"]);
    putAgentSkillPinMock.mockRejectedValueOnce(new Error("offline"));
    await pin("PDF");
    expect(names()).toEqual(["Platform Admin", "PDF", "Slides"]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("composer.addMenu.skill.pinFailed");
    await pin("PDF");
    expect(names()[0]).toBe("PDF");
    expect(putAgentSkillPinMock).toHaveBeenLastCalledWith({ key: "pdf", pinned: true });
    expect(localStorage.getItem("agent-webclient.pinnedSkills.v1:agent-a")).toBe('["slides"]');
  });

  it("waits for the server to confirm and blocks duplicate pin submissions", async () => {
    render();
    await openSkills();
    let confirm: (response: unknown) => void;
    putAgentSkillPinMock.mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }));
    click('[aria-label="composer.addMenu.skill.pin PDF"]');
    expect(names()).toEqual(["Platform Admin", "PDF", "Slides"]);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="composer.addMenu.skill.pin PDF"]')!.disabled).toBe(true);
    click('[aria-label="composer.addMenu.skill.pin PDF"]');
    expect(putAgentSkillPinMock).toHaveBeenCalledTimes(1);
    await act(async () => confirm!({ data: { agentKey: "", skills: [], pinned: ["pdf"] } }));
    expect(names()[0]).toBe("PDF");
  });

  it("disables pinning until the platform loads and does not reuse another user's cache", async () => {
    getAgentSkillsMock.mockRejectedValueOnce(new Error("offline"));
    render();
    await openSkills();
    expect(names()).toEqual([]);
    await act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    await pin("Slides");
    expect(names()[0]).toBe("Slides");
    sessionToken = "bob";
    serverOrder = [];
    await act(async () => render());
    expect(names()).toEqual(["Platform Admin", "PDF", "Slides"]);
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  });
});

/** 读取本面板样式模块中的单条规则（与 managementLayout.test.ts 同法）。 */
function readComposerStyleRule(selector: string): string {
  const css = fs
    .readFileSync(
      path.join(process.cwd(), "src/features/composer/components/ComposerCompat.module.css"),
      "utf8",
    )
    .replace(/:global\(([^)]+)\)/g, "$1");
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  const end = css.indexOf("}", start);
  return end < 0 ? "" : css.slice(start, end + 1);
}

describe("composer skill row layout", () => {
  it("keeps the content full width and aligns the pin to the right of the title", () => {
    const row = readComposerStyleRule(".composer-add-menu-skill-row");

    expect(row).toMatch(/display:\s*flex;/);
    expect(row).toMatch(/align-items:\s*center;/);
    // 文案列占满图标右侧的剩余宽度。
    expect(readComposerStyleRule(".composer-add-menu-item-copy")).toMatch(/flex:\s*1;/);
    // 名称、来源标记与置顶图标同处一行。
    expect(readComposerStyleRule(".composer-add-menu-item-title")).toMatch(/display:\s*flex;/);
  });
});
