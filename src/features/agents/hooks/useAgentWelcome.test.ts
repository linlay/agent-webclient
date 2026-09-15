/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAgent, dataQueryCache } from "@/shared/data";
import { useAgentWelcome } from "./useAgentWelcome";

jest.mock("@/shared/data", () => ({ ...jest.requireActual("@/shared/data"), getAgent: jest.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe({ agentKey, enabled = true }: { agentKey: string; enabled?: boolean }) {
  const { greeting, introduction } = useAgentWelcome(agentKey, enabled);
  return React.createElement("div", null,
    React.createElement("h1", null, greeting || "default heading"),
    React.createElement("input", { placeholder: introduction || "default input" }));
}

describe("useAgentWelcome", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    dataQueryCache.clear();
    jest.mocked(getAgent).mockReset();
    container = document.createElement("div");
    root = createRoot(container);
    jest.spyOn(Math, "random").mockReturnValue(0.75);
  });
  afterEach(() => { act(() => root.unmount()); jest.restoreAllMocks(); dataQueryCache.clear(); });
  async function render(agentKey: string, enabled = true, twice = false) {
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(Probe, { agentKey, enabled }),
      twice ? React.createElement(Probe, { agentKey, enabled }) : null)));
  }
  it("shares the detail request and independently samples stable heading and introduction", async () => {
    jest.mocked(getAgent).mockResolvedValue({ data: {
      greetings: [" Hello ", "Welcome"], introductions: ["I write", "I explain"],
    } } as any);
    await render("one", true, true);
    expect(getAgent).toHaveBeenCalledTimes(1);
    expect(container.querySelector("h1")!.textContent).toBe("Welcome");
    expect(container.querySelector("input")!.placeholder).toBe("I explain");
    jest.mocked(Math.random).mockReturnValue(0);
    await render("one", true, true);
    expect(container.querySelector("h1")!.textContent).toBe("Welcome");
    expect(container.querySelector("input")!.placeholder).toBe("I explain");
  });
  it("uses independent defaults for absent or blank arrays", async () => {
    jest.mocked(getAgent).mockResolvedValue({ data: { greetings: [" ", null], introductions: [" I help "] } } as any);
    await render("one");
    expect(container.querySelector("h1")!.textContent).toBe("default heading");
    expect(container.querySelector("input")!.placeholder).toBe("I help");
    jest.mocked(getAgent).mockResolvedValue({ data: { greetings: ["Hello"] } } as any);
    await render("two");
    expect(container.querySelector("h1")!.textContent).toBe("Hello");
    expect(container.querySelector("input")!.placeholder).toBe("default input");
  });
  it("does not let a delayed response replace another agent and disables content outside new chat", async () => {
    let resolveOld!: (value: any) => void;
    jest.mocked(getAgent).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await render("old");
    jest.mocked(getAgent).mockResolvedValue({ data: { greetings: ["New"], introductions: ["New intro"] } } as any);
    await render("new");
    await act(async () => resolveOld({ data: { greetings: ["Old"] } }));
    expect(container.querySelector("h1")!.textContent).toBe("New");
    await render("new", false);
    expect(container.querySelector("h1")!.textContent).toBe("default heading");
    expect(container.querySelector("input")!.placeholder).toBe("default input");
    expect(getAgent).toHaveBeenCalledTimes(2);
  });
  it("falls back on request failure and never loads without an agent", async () => {
    await render("");
    expect(getAgent).not.toHaveBeenCalled();
    jest.mocked(getAgent).mockRejectedValue(new Error("offline"));
    await render("one");
    expect(container.querySelector("h1")!.textContent).toBe("default heading");
    expect(container.querySelector("input")!.placeholder).toBe("default input");
    expect(getAgent).toHaveBeenCalledTimes(1);
    jest.mocked(getAgent).mockResolvedValue({ data: { greetings: ["Recovered"] } } as any);
    await act(async () => dataQueryCache.invalidatePrefix("agent.detail:"));
    expect(container.querySelector("h1")!.textContent).toBe("Recovered");
    expect(getAgent).toHaveBeenCalledTimes(2);
  });
});
