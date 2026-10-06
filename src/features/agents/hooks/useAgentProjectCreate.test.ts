/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { loadAgentCreationOptions, listHostDirectories } from "@/shared/data";
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
});
