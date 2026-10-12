/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { loadAgentCreationOptions, listHostDirectories } from "@/shared/data";
import { listKBases } from "@/shared/data/api/requests/kbases";
import { canUseDesktopFileSystemBridge, selectWorkspaceDirectory } from "@/shared/data/desktop/desktopFileSystem";
import {
  useAgentProjectCreate,
  type AgentProjectCreateRuntime,
} from "./useAgentProjectCreate";

jest.mock("@/shared/data", () => ({
  ...jest.requireActual("@/shared/data"),
  createAgent: jest.fn(),
  loadAgentCreationOptions: jest.fn(),
  listHostDirectories: jest.fn(),
}));
jest.mock("@/shared/data/api/requests/kbases", () => ({ listKBases: jest.fn() }));
jest.mock("@/shared/data/desktop/desktopFileSystem", () => ({
  canUseDesktopFileSystemBridge: jest.fn(),
  selectWorkspaceDirectory: jest.fn(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Deferred = { resolve: (path: string) => void; reject: (error: Error) => void };

describe("useAgentProjectCreate host directory browser", () => {
  let root: Root;
  let runtime: AgentProjectCreateRuntime;
  let requests: Array<Deferred & { path: string }>;

  function Probe() {
    runtime = useAgentProjectCreate();
    return null;
  }

  beforeEach(async () => {
    requests = [];
    jest.mocked(canUseDesktopFileSystemBridge).mockReturnValue(false);
    jest.mocked(listKBases).mockResolvedValue({ data: [] } as any);
    jest.mocked(loadAgentCreationOptions).mockResolvedValue({
      types: [], groups: [], models: [],
    } as any);
    jest.mocked(listHostDirectories).mockImplementation((path = "") =>
      new Promise((resolve, reject) => {
        requests.push({
          path,
          resolve: (listed) => resolve({
            data: { path: listed, parent: "/", separator: "/", entries: [], truncated: false },
          } as any),
          reject,
        });
      }));
    root = createRoot(document.createElement("div"));
    await act(async () => root.render(React.createElement(Probe)));
    await act(async () => runtime.begin());
  });
  afterEach(() => {
    act(() => root.unmount());
    jest.resetAllMocks();
  });

  async function settle(index: number, outcome: "ok" | "fail", path = requests[index].path) {
    await act(async () => {
      if (outcome === "ok") requests[index].resolve(path);
      else requests[index].reject(new Error("permission denied"));
    });
  }

  it("cannot confirm the previous directory while another one is loading", async () => {
    await act(async () => runtime.openBrowser());
    expect(runtime.browserCanChoose).toBe(false);
    await settle(0, "ok", "/home/a");
    expect(runtime.browserCanChoose).toBe(true);

    // Navigating to B keeps A on screen until B answers; A must not be choosable.
    await act(async () => runtime.browseTo("/home/a/b"));
    expect(runtime.browserListing?.path).toBe("/home/a");
    expect(runtime.browserCanChoose).toBe(false);
    await act(async () => runtime.chooseBrowsedDirectory());
    expect(runtime.workspaceDir).toBe("");
    expect(runtime.browserOpen).toBe(true);

    await settle(1, "ok");
    expect(runtime.browserCanChoose).toBe(true);
    await act(async () => runtime.chooseBrowsedDirectory());
    expect(runtime.workspaceDir).toBe("/home/a/b");
    expect(runtime.projectName).toBe("b");
    expect(runtime.browserOpen).toBe(false);
  });

  it("cannot confirm the previous directory after a failed request", async () => {
    await act(async () => runtime.openBrowser());
    await settle(0, "ok", "/home/a");
    await act(async () => runtime.browseTo("/home/a/locked"));
    await settle(1, "fail");

    expect(runtime.browserError).toBe("permission denied");
    expect(runtime.browserListing?.path).toBe("/home/a");
    expect(runtime.browserCanChoose).toBe(false);
    await act(async () => runtime.chooseBrowsedDirectory());
    expect(runtime.workspaceDir).toBe("");

    // A later successful navigation clears the error and can be confirmed.
    await act(async () => runtime.browseTo("/home/a/open"));
    await settle(2, "ok");
    expect(runtime.browserError).toBe("");
    expect(runtime.browserCanChoose).toBe(true);
  });

  it("keeps only the latest request when responses arrive out of order", async () => {
    await act(async () => runtime.openBrowser());
    await act(async () => runtime.browseTo("/second"));

    await settle(1, "ok");
    expect(runtime.browserListing?.path).toBe("/second");
    expect(runtime.browserLoading).toBe(false);

    // The first, slower response must not replace the newer listing.
    await settle(0, "ok", "/first");
    expect(runtime.browserListing?.path).toBe("/second");
    expect(runtime.browserCanChoose).toBe(true);

    // The same holds for a late failure.
    await act(async () => runtime.browseTo("/third"));
    await act(async () => runtime.browseTo("/fourth"));
    await settle(3, "ok");
    await settle(2, "fail");
    expect(runtime.browserError).toBe("");
    expect(runtime.browserListing?.path).toBe("/fourth");
  });

  it("drops a response that arrives after the browser was closed", async () => {
    await act(async () => runtime.openBrowser());
    await act(async () => runtime.closeBrowser());
    expect(runtime.browserLoading).toBe(false);
    await settle(0, "ok", "/late");
    expect(runtime.browserListing).toBeNull();
    expect(runtime.browserCanChoose).toBe(false);
  });

  async function enableNativePicker() {
    jest.mocked(canUseDesktopFileSystemBridge).mockReturnValue(true);
    await act(async () => root.render(React.createElement(Probe)));
  }

  it("uses the Desktop picker and fills the project directory and name without listing host directories", async () => {
    await enableNativePicker();
    let resolveSelection!: (path: string) => void;
    jest.mocked(selectWorkspaceDirectory).mockImplementation(() => new Promise(resolve => { resolveSelection = resolve; }));
    await act(async () => runtime.openBrowser());
    expect(selectWorkspaceDirectory).toHaveBeenCalledTimes(1);
    expect(listHostDirectories).not.toHaveBeenCalled();
    expect(runtime.browserOpen).toBe(false);
    expect(runtime.browserLoading).toBe(true);

    // Repeated clicks cannot start overlapping native dialogs.
    await act(async () => runtime.openBrowser());
    expect(selectWorkspaceDirectory).toHaveBeenCalledTimes(1);
    await act(async () => resolveSelection("/Users/demo/Project/research"));
    expect(runtime.workspaceDir).toBe("/Users/demo/Project/research");
    expect(runtime.projectName).toBe("research");
    expect(runtime.browserLoading).toBe(false);
  });

  it("preserves a manually edited name when the native picker changes the directory", async () => {
    await enableNativePicker();
    await act(async () => {
      runtime.setProjectName("My project");
      runtime.setProjectNameTouched(true);
    });
    jest.mocked(selectWorkspaceDirectory).mockResolvedValue("/Users/demo/Project/research");
    await act(async () => runtime.openBrowser());
    expect(runtime.projectName).toBe("My project");
    expect(runtime.workspaceDir).toBe("/Users/demo/Project/research");
  });

  it("keeps the current directory on cancellation and reports a native bridge failure without opening the host browser", async () => {
    await enableNativePicker();
    await act(async () => runtime.setWorkspaceDir("/existing"));
    jest.mocked(selectWorkspaceDirectory).mockResolvedValue(null);
    await act(async () => runtime.openBrowser());
    expect(runtime.workspaceDir).toBe("/existing");
    expect(runtime.error).toBe("");

    jest.mocked(selectWorkspaceDirectory).mockRejectedValue(new Error("native dialog failed"));
    await act(async () => runtime.openBrowser());
    expect(runtime.error).toBe("native dialog failed");
    expect(runtime.workspaceDir).toBe("/existing");
    expect(runtime.browserOpen).toBe(false);
    expect(runtime.browserLoading).toBe(false);
    expect(listHostDirectories).not.toHaveBeenCalled();
  });

  it("ignores a native selection returned after the project dialog was closed and reopened", async () => {
    await enableNativePicker();
    let resolveSelection!: (path: string) => void;
    jest.mocked(selectWorkspaceDirectory).mockImplementation(() => new Promise(resolve => { resolveSelection = resolve; }));
    await act(async () => runtime.openBrowser());
    await act(async () => runtime.close());
    await act(async () => runtime.begin());
    await act(async () => resolveSelection("/late"));
    expect(runtime.workspaceDir).toBe("");
    expect(runtime.projectName).toBe("");
    expect(runtime.browserLoading).toBe(false);
  });
});
