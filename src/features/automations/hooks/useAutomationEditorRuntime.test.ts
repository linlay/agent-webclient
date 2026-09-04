/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAutomationEditorRuntime } from "@/features/automations/hooks/useAutomationEditorRuntime";
import {
  createAutomation,
  getAdminSource,
  getAutomation,
  updateAdminSource,
} from "@/shared/data";

const dispatch = jest.fn();
const onDirtyChange = jest.fn();
const onSaved = jest.fn();

jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: () => dispatch,
  useAppState: () => ({ automations: [], agents: [] }),
}));

jest.mock("antd", () => ({
  message: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("@/shared/data", () => ({
  createAutomation: jest.fn(),
  deleteAutomation: jest.fn(),
  getAdminSource: jest.fn(),
  getAutomation: jest.fn(),
  toggleAutomation: jest.fn(),
  updateAdminSource: jest.fn(),
  updateAutomation: jest.fn(),
}));

const automationDetail = {
  id: "daily-report",
  name: "Daily report",
  description: "",
  cron: "0 9 * * *",
  agentKey: "agent-a",
  enabled: true,
  query: { message: "Build report" },
};

let latestRuntime: ReturnType<typeof useAutomationEditorRuntime>;

function RuntimeHarness({ automationId }: { automationId: string }) {
  latestRuntime = useAutomationEditorRuntime({
    automationId,
    currentWorker: null,
    onDirtyChange,
    onSaved,
    t: (key) => key,
  });
  return null;
}

describe("useAutomationEditorRuntime", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("loads only the target detail and saves a dirty source draft", async () => {
    (getAutomation as jest.Mock).mockResolvedValue({ data: automationDetail });
    (getAdminSource as jest.Mock).mockResolvedValue({
      data: {
        target: { type: "automation", key: "daily-report" },
        content: "name: Daily report\n",
        sha256: "before",
      },
    });
    (updateAdminSource as jest.Mock).mockResolvedValue({
      data: {
        target: { type: "automation", key: "daily-report" },
        content: "name: Updated report\n",
        sha256: "after",
      },
    });

    await act(async () => {
      root.render(
        React.createElement(RuntimeHarness, { automationId: "daily-report" }),
      );
      await Promise.resolve();
    });

    expect(getAutomation).toHaveBeenCalledWith("daily-report");
    await act(async () => {
      await latestRuntime.toggleEditorMode();
    });
    act(() => latestRuntime.updateSourceDraft("name: Updated report\n"));
    expect(latestRuntime.dirty).toBe(true);

    await act(async () => {
      await latestRuntime.saveSource();
    });

    expect(updateAdminSource).toHaveBeenCalledWith({
      target: { type: "automation", key: "daily-report" },
      content: "name: Updated report\n",
      baseSha256: "before",
    });
    expect(getAutomation).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledWith("daily-report");
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it("creates from the structured form DTO", async () => {
    (createAutomation as jest.Mock).mockResolvedValue({
      data: { ...automationDetail, id: "new-report" },
    });
    await act(async () => {
      root.render(React.createElement(RuntimeHarness, { automationId: "" }));
      await Promise.resolve();
    });
    act(() =>
      latestRuntime.updateForm({
        name: "New report",
        cron: "0 10 * * *",
        agentKey: "agent-a",
        message: "Build a new report",
      }),
    );
    await act(async () => {
      await latestRuntime.saveForm();
    });

    expect(createAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New report",
        cron: "0 10 * * *",
        agentKey: "agent-a",
        query: { message: "Build a new report" },
      }),
    );
    expect(onSaved).toHaveBeenCalledWith("new-report");
  });
});
