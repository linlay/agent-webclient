/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { message } from "antd";
import { getAgents } from "@/shared/data";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { useResourceAssistant } from "./useResourceAssistant";
jest.mock("antd", () => ({ message: { error: jest.fn() } }));
jest.mock("@/shared/data", () => ({ getAgents: jest.fn() }));
jest.mock("@/shared/utils/routing", () => ({ isDesktopAppMode: jest.fn() }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
let root: Root;
let container: HTMLDivElement;
let actions: ReturnType<typeof useResourceAssistant>;
const originalLocation = window.location;
const assign = jest.fn();
function Harness() { actions = useResourceAssistant(); return null; }
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  Object.defineProperty(window, "location", { configurable: true, value: { href: "http://localhost/agents/edited?chatDefaultAgentKey=default", assign } });
  jest.mocked(isDesktopAppMode).mockReturnValue(true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(React.createElement(Harness)));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); Object.defineProperty(window, "location", { configurable: true, value: originalLocation }); });
it("uses the host default, never the edited Agent, without querying a model", async () => {
  await act(async () => { await actions.open({ kind: "agent", target: { id: "edited" } }); });
  expect(assign).toHaveBeenCalledTimes(1);
  expect(assign.mock.calls[0][0]).toMatch(/^\/agent\/default\?newChat=/);
  expect(getAgents).not.toHaveBeenCalled();
});
it("fails visibly without a Desktop default and does not silently select another Agent", async () => {
  (window.location as any).href = "http://localhost/skills";
  await act(async () => { await actions.open({ kind: "skill" }); });
  expect(assign).not.toHaveBeenCalled();
  expect(getAgents).not.toHaveBeenCalled();
  expect(message.error).toHaveBeenCalledWith("resourceAssistant.agentUnavailable");
});
it("single-flights standalone lookup and ignores completion after navigating away", async () => {
  jest.mocked(isDesktopAppMode).mockReturnValue(false);
  let resolve!: (value: any) => void;
  jest.mocked(getAgents).mockReturnValue(new Promise(done => { resolve = done; }));
  let pending!: Promise<void>;
  await act(async () => { pending = actions.open({ kind: "automation" }); void actions.open({ kind: "automation" }); });
  expect(getAgents).toHaveBeenCalledTimes(1);
  (window.location as any).href = "http://localhost/other";
  await act(async () => { resolve({ data: [{ key: "chat", mode: "REACT" }] }); await pending; });
  expect(assign).not.toHaveBeenCalled();
});
