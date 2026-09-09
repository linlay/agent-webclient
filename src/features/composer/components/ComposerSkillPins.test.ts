/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { AddMenuTrigger, type AddMenuTriggerProps } from "./ComposerAddMenu";
import { dataQueryCache } from "@/shared/data/query/serverState";
import { usePinnedSkills } from "@/features/composer/hooks/usePinnedSkills";
import { useComposerSlash } from "@/features/composer/hooks/useComposerSlash";

let serverOrder: string[] = [];
const getSkillOrderMock = jest.fn();
const putSkillOrderMock = jest.fn();
let sessionToken = "alice";
jest.mock("@/shared/data/api/routedClient", () => ({
  ...jest.requireActual("@/shared/data/api/routedClient"),
  getCurrentAccessToken: () => sessionToken,
  getSkillOrder: (...args: unknown[]) => getSkillOrderMock(...args),
  putSkillOrder: (...args: unknown[]) => putSkillOrderMock(...args),
}));

const skills = [
  { key: "platform-admin", name: "Platform Admin", description: "Manage platform", agentHasSkill: true },
  { key: "pdf", name: "PDF", description: "Read documents", agentHasSkill: false },
  { key: "slides", name: "Slides", description: "Create documents", agentHasSkill: false },
];

jest.mock("@/shared/data/query/queries", () => ({
  useAgentSkillsQuery: () => ({ status: "success", data: { skills }, error: null, refetch: jest.fn() }),
}));
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
    getSkillOrderMock.mockReset().mockImplementation(async () => ({ data: { version: 1, order: [...serverOrder] } }));
    putSkillOrderMock.mockReset().mockImplementation(async ({ key, pinned }: { key: string; pinned: boolean }) => {
      serverOrder = serverOrder.filter((item) => item !== key);
      if (pinned) serverOrder.unshift(key);
      return { data: { version: 1, order: [...serverOrder] } };
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    props = {
      disabled: false, loading: false, currentChatId: "chat", currentAgentKey: "agent-a",
      planningMode: false, editingMode: false, canUsePlanningMode: false, canUseEditingMode: false,
      isMainChatRunning: false, selectedSkillKeys: [],
      onOpenFilePicker: jest.fn(), onAddReference: jest.fn(), onTogglePlanningMode: jest.fn(),
      onEditingModeChange: jest.fn(), onSelectSkill: jest.fn(),
    };
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  const render = () => act(() => root.render(React.createElement(AddMenuTrigger, props)));
  const click = (selector: string) => act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
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

    click(".composer-add-menu-skill-select");
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
    render();
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
    expect(names()).toEqual(["PDF", "Slides"]);
    props.currentAgentKey = "agent-a";
    render();
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
  });

  it("allows pinning during a run while skill selection stays disabled", async () => {
    props.isMainChatRunning = true;
    props.selectedSkillKeys = ["pdf"];
    render();
    await openSkills();
    await pin("PDF");
    expect(names()[0]).toBe("PDF");
    const select = container.querySelector<HTMLButtonElement>(".composer-add-menu-skill-select")!;
    expect(select.disabled).toBe(true);
    expect(select.querySelector('[data-material-icon="check"]')).not.toBeNull();
    click(".composer-add-menu-skill-select");
    expect(props.onSelectSkill).not.toHaveBeenCalled();
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
    putSkillOrderMock.mockRejectedValueOnce(new Error("offline"));
    await pin("PDF");
    expect(names()).toEqual(["Platform Admin", "PDF", "Slides"]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("composer.addMenu.skill.pinFailed");
    await pin("PDF");
    expect(names()[0]).toBe("PDF");
    expect(putSkillOrderMock).toHaveBeenLastCalledWith({ key: "pdf", pinned: true });
    expect(localStorage.getItem("agent-webclient.pinnedSkills.v1:agent-a")).toBe('["slides"]');
  });

  it("waits for the server to confirm and blocks duplicate pin submissions", async () => {
    render();
    await openSkills();
    let confirm: (response: unknown) => void;
    putSkillOrderMock.mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }));
    click('[aria-label="composer.addMenu.skill.pin PDF"]');
    expect(names()).toEqual(["Platform Admin", "PDF", "Slides"]);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="composer.addMenu.skill.pin PDF"]')!.disabled).toBe(true);
    click('[aria-label="composer.addMenu.skill.pin PDF"]');
    expect(putSkillOrderMock).toHaveBeenCalledTimes(1);
    await act(async () => confirm!({ data: { version: 1, order: ["pdf"] } }));
    expect(names()[0]).toBe("PDF");
  });

  it("disables pinning until the platform loads and does not reuse another user's cache", async () => {
    getSkillOrderMock.mockRejectedValueOnce(new Error("offline"));
    render();
    await openSkills();
    expect(container.querySelector<HTMLButtonElement>(".composer-add-menu-skill-pin")!.disabled).toBe(true);
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
