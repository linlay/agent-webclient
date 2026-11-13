/** @jest-environment jsdom */
import React, { act, useReducer } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QuerySettingsControls, clearCoderModelOptionsCacheForTest } from "./QuerySettingsControls";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
import type { AppState } from "@/app/state/types";
import type { AppAction } from "@/app/state/actions";
import { interactionDefaults } from "@/shared/contracts/interaction";

let mockContext: { state: AppState; dispatch: React.Dispatch<AppAction> };
const mockWorker: { type: string; sourceId: string; raw: Record<string, unknown> | undefined } = {
  type: "agent",
  sourceId: "agent-a",
  raw: undefined,
};

jest.mock("@/app/state/AppContext", () => ({ useAppContext: () => mockContext }));
jest.mock("@/features/workers/lib/currentWorker", () => ({
  resolveCurrentWorkerSummary: () => mockWorker,
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/data", () => ({
  // 保持 pending，避免异步结果在断言之外更新组件。
  getModelOptions: jest.fn(() => new Promise(() => {})),
  updateAgentModelConfig: jest.fn(),
}));

// 内联渲染展开的菜单，便于直接断言哪个菜单还在文档里。
jest.mock("antd", () => {
  const React = jest.requireActual("react");
  return {
    ...jest.requireActual("antd"),
    Dropdown: ({ menu, open, onOpenChange, disabled, children }: any) =>
      React.createElement(
        "div",
        null,
        React.cloneElement(children, {
          onClick: (event: React.MouseEvent) => {
            children.props.onClick?.(event);
            if (!disabled) onOpenChange?.(!open);
          },
        }),
        open
          ? React.createElement("div", {
              "data-open-menu": menu.selectedKeys ? "access" : "model",
            })
          : null,
      ),
  };
});

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);
  mockContext = { state, dispatch };
  return (
    <QuerySettingsControls
      accessLevel="ask_for_approval"
      disabled={disabled}
      modelOverride={{}}
      interactionConfig={{ ...interactionDefaults("GENERAL"), model: true }}
      onAccessLevelChange={() => {}}
      onModelOverrideChange={() => {}}
    />
  );
}

describe("QuerySettingsControls menus", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    mockWorker.sourceId = "agent-a";
    clearCoderModelOptionsCacheForTest();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const accessTrigger = () =>
    container.querySelector<HTMLButtonElement>('[title="composer.query.access.title"]')!;
  const modelTrigger = () =>
    container.querySelector<HTMLButtonElement>('[title="composer.query.model.title"]')!;
  const openMenu = (name: "access" | "model") =>
    container.querySelector(`[data-open-menu="${name}"]`);

  it("closes open menus as soon as the composer is blocked by a conversation switch", () => {
    act(() => root.render(<Harness />));
    act(() => accessTrigger().click());
    act(() => modelTrigger().click());
    expect(openMenu("access")).not.toBeNull();
    expect(openMenu("model")).not.toBeNull();

    // Desktop 侧栏已切走但目标 chat 还没加载完，chatId 仍是旧值。
    act(() => root.render(<Harness disabled />));
    expect(openMenu("access")).toBeNull();
    expect(openMenu("model")).toBeNull();
  });

  it("closes open menus when the chat changes", () => {
    act(() => root.render(<Harness />));
    act(() => accessTrigger().click());
    act(() => modelTrigger().click());
    expect(openMenu("access")).not.toBeNull();
    expect(openMenu("model")).not.toBeNull();

    act(() => mockContext.dispatch({ type: "SET_CHAT_ID", chatId: "chat-b" }));
    expect(openMenu("access")).toBeNull();
    expect(openMenu("model")).toBeNull();
  });

  it("closes open menus when the agent changes", () => {
    act(() => root.render(<Harness />));
    act(() => accessTrigger().click());
    expect(openMenu("access")).not.toBeNull();

    mockWorker.sourceId = "agent-b";
    act(() => root.render(<Harness />));
    expect(openMenu("access")).toBeNull();
  });

  it("keeps a menu open while the conversation stays the same", () => {
    act(() => root.render(<Harness />));
    act(() => accessTrigger().click());
    expect(openMenu("access")).not.toBeNull();

    act(() => mockContext.dispatch({ type: "SET_COMPOSER_MODEL", target: { scope: "user", chatId: "", agentKey: "agent-a" }, value: { key: "model-b" } }));
    expect(openMenu("access")).not.toBeNull();
  });
});
