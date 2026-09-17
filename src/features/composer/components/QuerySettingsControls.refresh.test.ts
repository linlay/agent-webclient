/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { QuerySettingsControls, clearCoderModelOptionsCacheForTest } from "./QuerySettingsControls";
import { dataQueryCache } from "@/shared/data/query/serverState";
import { getModelOptions } from "@/shared/data/api/routedClient";

const mockRequest = jest.fn();
jest.mock("@/shared/data/api/dataRequestExecutor", () => ({
  requestDataThroughExecutor: (...args: unknown[]) => mockRequest(...args),
}));
jest.mock("@/shared/config/backendMode", () => ({ getBackendMode: () => "platform" }));
jest.mock("@/shared/data", () => ({
  getModelOptions: (...args: unknown[]) => jest.requireActual("@/shared/data/api/routedClient").getModelOptions(...args),
  updateAgentModelConfig: jest.fn(),
}));
jest.mock("@/app/state/AppContext", () => ({
  useAppContext: () => ({ state: { agents: [] }, dispatch: jest.fn() }),
}));
const worker = {
  type: "agent", sourceId: "coder",
  raw: { mode: "CODER", modelOptions: { models: [{ key: "embedded", name: "Embedded" }] } },
};
jest.mock("@/features/workers/lib/currentWorker", () => ({ resolveCurrentWorkerSummary: () => worker }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const response = (key: string) => ({ data: { models: [{ key, name: key }] } });

describe("Composer model refresh click", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = jest.fn().mockImplementation(() => ({ matches: false, addListener: jest.fn(), removeListener: jest.fn() }));
  });
  beforeEach(() => {
    clearCoderModelOptionsCacheForTest();
    dataQueryCache.clear();
    mockRequest.mockReset().mockResolvedValue(response("cached"));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const button = () => document.querySelector<HTMLButtonElement>('[aria-label="composer.query.model.refresh"]')!;
  async function openMenu() {
    await act(async () => root.render(React.createElement(QuerySettingsControls, {
      accessLevel: "default", modelOverride: { key: "embedded" },
      onAccessLevelChange: jest.fn(), onModelOverrideChange: jest.fn(),
    })));
    await act(async () => container.querySelector<HTMLButtonElement>('[title="composer.query.model.title"]')!.click());
    await act(async () => {
      Simulate.mouseEnter(document.querySelector('.ant-dropdown-menu-submenu-title')!);
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    expect(button()).not.toBeNull();
  }

  it("sends a new request for each click despite embedded options and a warm route cache", async () => {
    await getModelOptions("coder");
    await openMenu();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    for (const [index, key] of ["fresh-1", "fresh-2"].entries()) {
      mockRequest.mockResolvedValue(response(key));
      await act(async () => button().click());
      expect(mockRequest).toHaveBeenCalledTimes(index + 2);
      expect(mockRequest).toHaveBeenLastCalledWith("/api/model-options", { agentKey: "coder" });
      expect(document.body.textContent).toContain(key);
      expect(button().disabled).toBe(false);
    }
  });

  it("keeps the list on failure, shows loading, and permits retry", async () => {
    await openMenu();
    let reject!: (error: Error) => void;
    mockRequest.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    await act(async () => button().click());
    expect(button().disabled).toBe(true);
    expect(button().getAttribute("aria-busy")).toBe("true");
    await act(async () => reject(new Error("unavailable")));
    expect(document.body.textContent).toContain("Embedded");
    expect(document.body.textContent).toContain("composer.query.model.refreshFailed");
    expect(button().disabled).toBe(false);
    mockRequest.mockResolvedValue(response("recovered"));
    await act(async () => button().click());
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("recovered");
    expect(document.body.textContent).not.toContain("composer.query.model.refreshFailed");
  });
});
