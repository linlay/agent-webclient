/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAgents } from "@/shared/data";
import { useProjectAgents } from "@/features/project/hooks/useProjectAgents";

jest.mock("@/shared/data", () => ({ getAgents: jest.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe() {
  const { agents, error, loading } = useProjectAgents();
  return React.createElement("div", { "data-loading": loading },
    error || agents.map((agent) => agent.key).join(","),
  );
}

describe("project Agent catalog", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    jest.mocked(getAgents).mockReset();
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => act(() => root.unmount()));

  it("loads concrete project workspaces across modes without a mode filter", async () => {
    jest.mocked(getAgents).mockResolvedValue({ code: 0, msg: "success", data: [
      { key: "proxy-project", name: "B Project", mode: "PROXY", workspaceDir: "/projects/proxy" },
      { key: "general-project", name: "A Project", mode: "GENERAL", workspaceDir: "/projects/general" },
      { key: "unspecified-project", name: "C Project", workspaceDir: "/projects/unspecified" },
      { key: "coder-without-workspace", name: "Coder", mode: "CODER" },
      { key: "kbase-without-workspace", name: "Knowledge", mode: "KBASE", workspaceDir: "" },
      { key: "root-agent", name: "Root", mode: "GENERAL", workspaceDir: " @root " },
      { key: "blank-workspace", name: "Blank", workspaceDir: "  " },
        { agentKey: "team", name: "Team" },
    ] });

    await act(async () => root.render(React.createElement(Probe)));

    expect(getAgents).toHaveBeenCalledWith({ hasWorkspace: true, includeChats: 20, scope: "nav" });
    expect(container.textContent).toBe("general-project,proxy-project,unspecified-project");
    expect(container.firstElementChild?.getAttribute("data-loading")).toBe("false");
  });

  it("surfaces a failed catalog request and finishes loading", async () => {
    jest.mocked(getAgents).mockRejectedValue(new Error("catalog unavailable"));

    await act(async () => root.render(React.createElement(Probe)));

    expect(container.textContent).toBe("catalog unavailable");
    expect(container.firstElementChild?.getAttribute("data-loading")).toBe("false");
  });
});
