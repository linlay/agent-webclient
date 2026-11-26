/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { message } from "antd";
import {
  deleteAdminAgentPrivateSkill,
  getAdminAgentDetail,
  getAdminAgentEditorOptions,
  getAdminAgents,
  getAdminSkills,
  getAdminTools,
  getAgents,
  createAgent,
  updateAgent,
  type AdminAgentDetailResponse,
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
  deleteAdminAgentPrivateSkill: jest.fn(),
  getAdminAgents: jest.fn(),
  getAdminAgentDetail: jest.fn(),
  getAdminAgentEditorOptions: jest.fn(),
  getAdminTools: jest.fn(),
  getAdminSkills: jest.fn(),
  getAgents: jest.fn(),
  createAgent: jest.fn(),
  updateAgent: jest.fn(),
}));
jest.mock("antd", () => ({
  Modal: ({ open, title, children, okText, cancelText, onOk, onCancel }: import("antd").ModalProps) =>
    open ? React.createElement(
      "section",
      { role: "dialog" },
      React.createElement("h2", null, title),
      children,
      React.createElement("button", { "data-modal-action": "cancel", onClick: onCancel }, cancelText),
      React.createElement("button", { "data-modal-action": "confirm", onClick: onOk }, okText),
    ) : null,
  Popconfirm: ({ children }: React.PropsWithChildren) => children,
  Spin: ({ children }: React.PropsWithChildren) => children,
  Tooltip: ({ children }: React.PropsWithChildren) => children,
  message: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
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
jest.mock("@/features/connectors/hooks/useAgentConnectorCapabilities", () => ({ useAgentConnectorCapabilities: () => ({ ready: true, items: [], catalog: [], ownedToolNames: [], loading: false, error: null, reloadPending: false, refresh: jest.fn() }) }));

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
  jest.mocked(getAdminSkills).mockResolvedValue(response({ skills: [], packages: [], pinned: [] }));
  jest.mocked(getAgents).mockResolvedValue(response([]));
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

it("keeps structured editing available beside conversation creation", async () => {
  await render();
  expect(editor()).toBeDefined();
  await act(async () => list().onCreateConversation?.());
  expect(mockOpenAssistant).toHaveBeenCalledWith({ kind: "agent" }, undefined);
});

jest.mock("@/shared/ui/EditMenuButton", () => ({ EditMenuButton: ({ label, onStructured }: any) => React.createElement("button", { onClick: onStructured }, label) }));

function connectorEditor() {
  return (editor().connectors as React.ReactElement<{ selectedIds: string[]; savedIds: string[]; onSelectionChange: (ids: string[]) => void }>).props;
}
function saveButton() {
  return Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("agentConsole.action.saveChanges"))!;
}

it("saves connector drafts with the Agent form and clears them only after successful persistence", async () => {
  const detail = { ...agent, definition: { ...agent.definition, connectorConfig: { connectors: ["docs"] } } };
  jest.mocked(getAdminAgentDetail).mockResolvedValue(response(detail));
  const dirty = jest.fn();
  await act(async () => root.render(React.createElement(AgentConsole, { selectedAgentKey: agent.key, onDirtyChange: dirty })));
  expect(connectorEditor().selectedIds).toEqual(["docs"]);
  expect(saveButton().disabled).toBe(true);
  await act(async () => connectorEditor().onSelectionChange(["builtin.httpx"]));
  expect(connectorEditor().savedIds).toEqual(["docs"]);
  expect(updateAgent).not.toHaveBeenCalled();
  expect(createAgent).not.toHaveBeenCalled();
  expect(dirty).toHaveBeenLastCalledWith(true);
  expect(saveButton().disabled).toBe(false);

  jest.mocked(updateAgent).mockRejectedValueOnce(new Error("Save failed"));
  await act(async () => saveButton().click());
  expect(connectorEditor().selectedIds).toEqual(["builtin.httpx"]);
  expect(connectorEditor().savedIds).toEqual(["docs"]);
  expect(saveButton().disabled).toBe(false);

  jest.mocked(updateAgent).mockImplementation(async params => response({ ...detail, definition: params.definition }));
  await act(async () => saveButton().click());
  expect(updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({
    definition: expect.objectContaining({ connectorConfig: { connectors: ["builtin.httpx"] } }),
  }));
  expect(connectorEditor().selectedIds).toEqual(["builtin.httpx"]);
  expect(connectorEditor().savedIds).toEqual(["builtin.httpx"]);
  expect(dirty).toHaveBeenLastCalledWith(false);
  expect(saveButton().disabled).toBe(true);
});

it("uses the existing draft-discard confirmation when switching Agents", async () => {
  await render(false, agent.key);
  await act(async () => connectorEditor().onSelectionChange(["docs"]));
  const confirm = jest.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  try {
    await act(async () => list().onSelect("other"));
    expect(confirm).toHaveBeenCalledWith("agentConsole.confirm.switch");
    expect(connectorEditor().selectedIds).toEqual(["docs"]);
    expect(getAdminAgentDetail).toHaveBeenCalledTimes(1);
    jest.mocked(getAdminAgentDetail).mockResolvedValue(response({ ...agent, key: "other", definition: { ...agent.definition, key: "other" } }));
    // An uncontrolled console lets its own selection state commit the change.
    await render(false);
    await act(async () => list().onSelect("other"));
    expect(connectorEditor().selectedIds).toEqual([]);
    expect(updateAgent).not.toHaveBeenCalled();
  } finally {
    confirm.mockRestore();
  }
});

function mockPrivateSkillDetail() {
  const detail: AdminAgentDetailResponse = {
    ...agent,
    source: { kind: "directory" },
    definition: {
      ...agent.definition,
      skillConfig: { skills: ["private-demo", "old-center"] },
    },
    privateSkills: [{
      id: "private-demo",
      displayName: "Private Demo",
      status: "ready",
      enabled: true,
      overridesCenter: true,
    }],
  };
  jest.mocked(getAdminAgentDetail).mockResolvedValue(response(detail));
  jest.mocked(getAdminSkills).mockResolvedValue(response({
    skills: [
      { id: "private-demo", displayName: "Center Demo", status: "ready" },
      { id: "old-center", displayName: "Old Center", status: "ready" },
      { id: "new-center", displayName: "New Center", status: "ready" },
    ],
    packages: [],
    pinned: [],
  }));
  return detail;
}

function modal() {
  return container.querySelector<HTMLElement>('[role="dialog"]');
}

function modalAction(action: "cancel" | "confirm") {
  return modal()!.querySelector<HTMLButtonElement>(`[data-modal-action="${action}"]`)!;
}

it("confirms and deletes a mounted private skill while keeping unrelated Agent edits", async () => {
  const detail = mockPrivateSkillDetail();
  await render(false, agent.key);
  await act(async () => {
    editor().updateForm({ name: "Draft name" });
    editor().onSkillToggle("old-center", false);
  });
  expect(modal()).toBeNull();
  expect(editor().form.skills).toEqual(["private-demo"]);
  await act(async () => editor().onSkillToggle("new-center", true));

  await act(async () => editor().onSkillToggle("private-demo", false));
  expect(modal()?.textContent).toContain("agentConsole.privateSkill.delete.title");
  expect(modalAction("confirm").textContent).toBe("agentConsole.privateSkill.delete.confirm");
  expect(editor().form.skills).toEqual(["private-demo", "new-center"]);
  await act(async () => modalAction("cancel").click());
  expect(modal()).toBeNull();
  expect(deleteAdminAgentPrivateSkill).not.toHaveBeenCalled();
  expect(editor().form.skills).toEqual(["private-demo", "new-center"]);

  const saved = {
    ...detail,
    definition: { ...detail.definition, skillConfig: { skills: ["old-center"] } },
    privateSkills: [],
  };
  jest.mocked(getAdminAgentDetail).mockResolvedValue(response(saved));
  jest.mocked(deleteAdminAgentPrivateSkill).mockResolvedValue(response(saved));
  await act(async () => editor().onSkillToggle("private-demo", false));
  await act(async () => modalAction("confirm").click());

  expect(deleteAdminAgentPrivateSkill).toHaveBeenCalledTimes(1);
  expect(deleteAdminAgentPrivateSkill).toHaveBeenCalledWith({ agentKey: agent.key, id: "private-demo" });
  expect(updateAgent).not.toHaveBeenCalled();
  expect(modal()).toBeNull();
  expect(editor().form.name).toBe("Draft name");
  expect(editor().form.skills).toEqual(["new-center"]);
  expect(editor().filteredSkillOptions).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "private-demo", source: "center" }),
  ]));
  expect(saveButton().disabled).toBe(false);
});

it("keeps a private skill mounted when deletion fails", async () => {
  mockPrivateSkillDetail();
  jest.mocked(deleteAdminAgentPrivateSkill).mockRejectedValue(new Error("Deletion failed"));
  await render(false, agent.key);

  await act(async () => editor().onSkillToggle("private-demo", false));
  await act(async () => modalAction("confirm").click());

  expect(message.error).toHaveBeenCalled();
  expect(editor().form.skills).toEqual(["private-demo", "old-center"]);
  expect(editor().selectedSkills).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "private-demo", source: "private" }),
  ]));
});

it("keeps the private skill import destination visible after choosing a ZIP", async () => {
  mockPrivateSkillDetail();
  await render(false, agent.key);

  await act(async () => editor().openPrivateSkillImport());
  const destination = "agentConsole.privateSkill.import.destination";
  expect(modal()?.textContent).toContain(destination);
  const input = modal()!.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(["skill"], "private-skill.zip", { type: "application/zip" });
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(modal()?.textContent).toContain(file.name);
  expect(modal()?.textContent).toContain(destination);
});

it("prompts to delete a private skill only after its mounting is saved", async () => {
  const detail = mockPrivateSkillDetail();
  const unmounted = {
    ...detail,
    definition: { ...detail.definition, skillConfig: { skills: ["old-center"] } },
    privateSkills: detail.privateSkills!.map(skill => ({ ...skill, enabled: false })),
  };
  jest.mocked(getAdminAgentDetail).mockResolvedValue(response(unmounted));
  await render(false, agent.key);

  await act(async () => editor().onSkillToggle("private-demo", true));
  expect(editor().form.skills).toEqual(["old-center", "private-demo"]);
  await act(async () => editor().onSkillToggle("private-demo", false));
  expect(editor().form.skills).toEqual(["old-center"]);
  expect(modal()).toBeNull();
  expect(deleteAdminAgentPrivateSkill).not.toHaveBeenCalled();

  jest.mocked(updateAgent).mockImplementation(async params => {
    jest.mocked(getAdminAgentDetail).mockResolvedValue(response({ ...detail, definition: params.definition }));
    return response({ ...agent, definition: params.definition });
  });
  await act(async () => editor().onSkillToggle("private-demo", true));
  await act(async () => saveButton().click());
  expect(updateAgent).toHaveBeenCalledTimes(1);
  expect(editor().selectedSkills).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "private-demo", source: "private" }),
  ]));

  await act(async () => editor().onSkillToggle("private-demo", false));
  expect(modal()?.textContent).toContain("agentConsole.privateSkill.delete.title");
  expect(deleteAdminAgentPrivateSkill).not.toHaveBeenCalled();
});
