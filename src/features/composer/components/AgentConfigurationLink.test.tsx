/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { AgentConfigurationLink } from "./AgentConfigurationLink";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { openDesktopAgentConfiguration } from "@/shared/data/desktop/desktopAgentConfiguration";

jest.mock("@/shared/utils/routing", () => ({ isDesktopAppMode: jest.fn() }));
jest.mock("@/shared/data/desktop/desktopAgentConfiguration", () => ({ openDesktopAgentConfiguration: jest.fn() }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const desktopMode = jest.mocked(isDesktopAppMode);
const openConfiguration = jest.mocked(openDesktopAgentConfiguration);
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
function render() { act(() => root.render(<AgentConfigurationLink agentKey="worker/a" />)); }

it("standalone links to the encoded Agent configuration without host requests", () => {
  desktopMode.mockReturnValue(false);
  render();
  expect(container.querySelector("a")?.getAttribute("href")).toBe("/agents/worker%2Fa");
  expect(container.querySelector("button")).toBeNull();
  expect(openConfiguration).not.toHaveBeenCalled();
});
it("Desktop sends a semantic request without navigating the guest and disables duplicate clicks", async () => {
  desktopMode.mockReturnValue(true);
  let complete!: () => void;
  openConfiguration.mockReturnValue(new Promise(resolve => { complete = resolve; }));
  render();
  expect(container.querySelector("a")).toBeNull();
  const button = container.querySelector("button")!;
  act(() => button.click());
  expect(openConfiguration).toHaveBeenCalledWith("worker/a");
  expect(button.disabled).toBe(true);
  await act(async () => complete());
  expect(button.disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
it("Desktop reports failure and permits retry without falling back to a guest URL", async () => {
  desktopMode.mockReturnValue(true);
  openConfiguration.mockRejectedValueOnce(new Error("timeout"));
  render();
  const button = container.querySelector("button")!;
  await act(async () => button.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("composer.agent.configurationOpenFailed");
  expect(button.disabled).toBe(false);
  expect(container.querySelector("a")).toBeNull();
  openConfiguration.mockResolvedValueOnce();
  await act(async () => button.click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
