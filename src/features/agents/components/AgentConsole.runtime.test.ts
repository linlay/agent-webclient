/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  getAdminAgentDetail,
  getAdminAgentEditorOptions,
  getAdminAgents,
  getAdminSkills,
  getAdminTools,
  type AgentEditorOptionsResponse,
  type ApiResponse,
} from "@/shared/data";
import { AgentConsole } from "./AgentConsole";
import { AgentListPane, type AgentListPaneProps } from "./AgentListPane";
import { AgentEditor, type AgentEditorProps } from "./AgentEditor";

const mockDispatch = jest.fn();
const mockTranslate = (key: string) => key;

jest.mock("@/app/state/AppContext", () => ({
  useAppContext: () => ({ state: { agents: [] }, dispatch: mockDispatch }),
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: mockTranslate }) }));
jest.mock("@/shared/data", () => ({
  getAdminAgents: jest.fn(),
  getAdminAgentDetail: jest.fn(),
  getAdminAgentEditorOptions: jest.fn(),
  getAdminTools: jest.fn(),
  getAdminSkills: jest.fn(),
}));
jest.mock("antd", () => ({
  Modal: () => null,
  Popconfirm: ({ children }: React.PropsWithChildren) => children,
  Spin: ({ children }: React.PropsWithChildren) => children,
  Tooltip: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: () => null }));
jest.mock("@/shared/icons/agent", () => ({ AGENT_ICON_NAMES: [], AgentIcon: () => null }));
jest.mock("@/shared/ui/UiButton", () => ({
  UiButton: ({ children, onClick, disabled }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { onClick, disabled }, children),
}));
jest.mock("./AgentListPane", () => ({ AgentListPane: jest.fn(() => null) }));
jest.mock("./AgentEditor", () => ({
  ...jest.requireActual("./AgentEditor"),
  AgentEditor: jest.fn(() => null),
}));
jest.mock("./AgentCreateModal", () => ({ AgentCreateModal: () => null }));
jest.mock("./AgentSourceEditor", () => ({ AgentSourceEditor: () => null }));

const agent = {
  key: "agent-a",
  name: "Agent A",
  status: "ready",
  definition: { key: "agent-a", name: "Agent A", modelConfig: { modelKey: "model-a" } },
};
const options: AgentEditorOptionsResponse = {
  models: [{ key: "model-a", name: "Model A", isVision: false }],
  contextTags: [],
  modes: [],
  proxyConfigSchema: { fields: [], defaultTimeoutMs: 0 },
};

function response<T>(data: T): ApiResponse<T> {
  return { status: 200, code: 0, msg: "ok", data };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let container: HTMLDivElement;
let root: Root;

function list(): AgentListPaneProps {
  return jest.mocked(AgentListPane).mock.calls.at(-1)![0];
}

function editor(): AgentEditorProps {
  return jest.mocked(AgentEditor).mock.calls.at(-1)![0];
}

async function render(strict = true, selectedAgentKey?: string) {
  await act(async () => {
    const element = React.createElement(AgentConsole, { selectedAgentKey });
    root.render(strict ? React.createElement(React.StrictMode, null, element) : element);
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  jest.mocked(getAdminAgents).mockResolvedValue(response([agent]));
  jest.mocked(getAdminAgentDetail).mockResolvedValue(response(agent));
  jest.mocked(getAdminAgentEditorOptions).mockResolvedValue(response(options));
  jest.mocked(getAdminTools).mockResolvedValue(response([]));
  jest.mocked(getAdminSkills).mockResolvedValue(response([]));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it.each([false, true])("loads agents and editor options with StrictMode=%s", async (strict) => {
  await render(strict);

  expect(list().agents).toEqual([agent]);
  expect(list().loading).toBe(false);
  expect(list().selectedAgentKey).toBe(agent.key);
  expect(editor().loadingOptions).toBe(false);
  expect(editor().selectedModelLabel).toBe("Model A");

  // A selection update must not repeat an already completed bootstrap.
  await render(strict, agent.key);
  const requests = strict ? 2 : 1;
  expect(getAdminAgents).toHaveBeenCalledTimes(requests);
  expect(getAdminAgentEditorOptions).toHaveBeenCalledTimes(requests);
  expect(getAdminTools).toHaveBeenCalledTimes(requests);
  expect(getAdminSkills).toHaveBeenCalledTimes(requests);
});

it.each(["before", "after"])("ignores cancelled bootstrap responses arriving %s current responses", async (order) => {
  const oldList = deferred<Awaited<ReturnType<typeof getAdminAgents>>>();
  const currentList = deferred<Awaited<ReturnType<typeof getAdminAgents>>>();
  const oldOptions = deferred<Awaited<ReturnType<typeof getAdminAgentEditorOptions>>>();
  const currentOptions = deferred<Awaited<ReturnType<typeof getAdminAgentEditorOptions>>>();
  jest.mocked(getAdminAgents).mockReturnValueOnce(oldList.promise).mockReturnValueOnce(currentList.promise);
  jest.mocked(getAdminAgentEditorOptions).mockReturnValueOnce(oldOptions.promise).mockReturnValueOnce(currentOptions.promise);
  await render();

  const settleOld = async () => {
    await act(async () => {
      oldList.resolve(response([{ key: "old", name: "Old Agent", status: "ready" }]));
      oldOptions.resolve(response({ ...options, models: [{ key: "model-a", name: "Old Model", isVision: false }] }));
    });
  };

  if (order === "before") await settleOld();
  expect(list().agents).toEqual([]);
  expect(list().loading).toBe(true);
  expect(editor().loadingOptions).toBe(true);

  await act(async () => {
    currentList.resolve(response([agent]));
    currentOptions.resolve(response(options));
  });
  if (order === "after") await settleOld();

  expect(list().agents).toEqual([agent]);
  expect(list().loading).toBe(false);
  expect(editor().loadingOptions).toBe(false);
  expect(editor().selectedModelLabel).toBe("Model A");
});

it("ends loading and displays initialization failures under StrictMode", async () => {
  jest.mocked(getAdminAgents).mockRejectedValue(new Error("Initialization failed"));
  jest.mocked(getAdminAgentEditorOptions).mockRejectedValue(new Error("Initialization failed"));
  await render();

  expect(list().loading).toBe(false);
  expect(editor().loadingOptions).toBe(false);
  expect(container.textContent).toContain("Initialization failed");
  expect(container.textContent).toContain("agentConsole.action.retry");
});

const mockOpenAssistant = jest.fn();
jest.mock("@/features/resource-assistant/hooks/useResourceAssistant", () => ({ useResourceAssistant: () => ({ open: mockOpenAssistant, opening: false }) }));

it("keeps manual editing available beside conversation creation", async () => {
  await render();
  const edit = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("resourceAssistant.editAgent"))!;
  await act(async () => edit.click());
  expect(editor().isReadOnly).toBe(false);
  await act(async () => list().onCreateConversation?.());
  expect(mockOpenAssistant).toHaveBeenCalledWith({ kind: "agent" }, undefined);
});

jest.mock("@/shared/ui/EditMenuButton", () => ({ EditMenuButton: ({ label, onManual }: any) => React.createElement("button", { onClick: onManual }, label) }));
