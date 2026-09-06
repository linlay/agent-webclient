/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextDecoder, TextEncoder } from "node:util";
Object.assign(globalThis, { TextEncoder, TextDecoder, IS_REACT_ACT_ENVIRONMENT: true });
const { MemoryRouter, Routes, Route, useNavigate } = require("react-router-dom");
const { AppProvider, useAppContext } = require("@/app/state/AppContext");
const { AgentChatShell } = require("./AgentChatShell");
const { getChat, getAgent } = require("@/shared/data");
const { I18nProvider } = require("@/shared/i18n");
let mockConversationActions: any;

// Keep the real Router, AppProvider/reducer, route coordinator, replay loader,
// Shell, ConversationStage, ArtifactPanel and PlanPanel. Isolate other runtimes.
jest.mock("@/app/layout/hooks/useAppRuntimes", () => ({
  useAppRuntimes: (options: any) => {
    const React = require("react");
    const actions = require("@/features/conversation/hooks/useConversationActions").useConversationActions();
    mockConversationActions = actions;
    require("@/features/conversation/hooks/useConversationRouteLoad").useConversationRouteLoad(actions, options.targetChatId, options.routeReady);
    React.useEffect(() => {
      const listener = (event: any) => { void actions.loadChat(event.detail.chatId); };
      window.addEventListener("agent:load-chat", listener);
      return () => window.removeEventListener("agent:load-chat", listener);
    }, [actions.loadChat]);
    return { ...actions, loadAgents: async () => undefined };
  },
}));
jest.mock("@/app/layout/ShellOverlays", () => ({ ShellOverlays: () => null }));
jest.mock("@/features/composer/components/ComposerArea", () => ({
  ComposerArea: () => React.createElement("input", { "data-testid": "composer", defaultValue: "preserved draft" }),
}));
jest.mock("@/shared/data", () => ({
  ...jest.requireActual("@/shared/data"), getChat: jest.fn(), getAgent: jest.fn(), setAccessToken: jest.fn(),
}));
jest.mock("@/shared/ui/useAuthenticatedResourceUrl", () => ({
  useAuthenticatedResourceUrl: () => ({ url: "", loading: false, error: "" }),
}));
jest.mock("@/features/surfaces/openTarget", () => ({ useOpenTarget: () => jest.fn() }));
jest.mock("@/shared/icons/agent", () => ({ AgentIcon: () => React.createElement("span") }));
jest.mock("@/features/timeline/components/TimelineRow", () => ({
  TimelineRow: ({ node }: any) => React.createElement("div", null, node?.text),
  formatTimelineTime: () => ({ short: "", full: "" }),
}));
jest.mock("react-virtuoso", () => {
  const React = require("react");
  return { Virtuoso: React.forwardRef((props: any, ref: any) => {
    const scroller = React.useRef(null);
    React.useImperativeHandle(ref, () => ({ getState: (cb: any) => cb({ ranges: [], scrollTop: 0 }), scrollToIndex: () => {}, scrollBy: () => {} }));
    React.useLayoutEffect(() => { props.scrollerRef?.(scroller.current); }, [props.scrollerRef]);
    return React.createElement("div", { ref: scroller, id: props.id },
      props.data.map((item: any, index: number) => React.createElement("div", { key: item.key }, props.itemContent(index, item))));
  }) };
});

let context: any;
let navigate: (target: string) => void;
function Probe() {
  context = useAppContext();
  navigate = useNavigate();
  return null;
}
function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(r => { resolve = r; });
  return { promise, resolve };
}
function response(chatId: string) { return { data: { chatId, agentKey: "demo", events: [], artifacts: [] } }; }

describe("whole conversation surface navigation", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) });
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    getAgent.mockResolvedValue({ data: { key: "demo", name: "Demo", mode: "CODER", modelOptions: [] } });
    getChat.mockImplementation(() => new Promise(() => {}));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(I18nProvider, null, React.createElement(AppProvider, null,
        React.createElement(MemoryRouter, { initialEntries: ["/agent/demo"] },
          React.createElement(Probe),
          React.createElement(Routes, null, React.createElement(Route, { path: "/agent/:agentKey", element: React.createElement(AgentChatShell) }))))));
    });
    await act(async () => {
      context.dispatch({ type: "BATCH_UPDATE", updates: {
        chatId: "A", agents: [{ key: "demo", name: "Demo", mode: "CODER", modelOptions: [] }], workerSelectionKey: "agent:demo",
        chatLoadSeq: 1, chatTransition: { seq: 1, sourceChatId: "", targetChatId: "A", phase: "ready", kind: "initial-load", displayMode: "blocking", focusComposerOnReady: false, error: "" },
        timelineOrder: ["old"], timelineNodes: new Map([["old", { id: "old", kind: "message", role: "user", text: "old timeline A", ts: 1 }]]),
        artifacts: [{ artifactId: "old-file", artifact: { name: "old-artifact-A.txt", sizeBytes: 100, url: "", type: "file" } }],
        plan: { planId: "old-plan", tasks: [{ taskId: "task-A", description: "old-task-A", status: "completed" }] }, planExpanded: true,
      } });
      navigate("/agent/demo?chatId=A");
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });
  async function go(chatId: string) { await act(async () => navigate(`/agent/demo?chatId=${chatId}`)); }
  async function finishTransition() {
    await act(async () => jest.advanceTimersByTime(32)); // layout restoration frames
    await act(async () => jest.advanceTimersByTime(160)); // shared minimum hold
    await act(async () => jest.advanceTimersByTime(80)); // shared fade
  }
  function expectMasked() {
    expect(container.querySelector(".conversation-transition-overlay")).not.toBeNull();
    expect(container.querySelector('[data-conversation-skeleton="artifacts"]')).not.toBeNull();
    expect(container.querySelector('[data-conversation-skeleton="plan-tasks"]')).not.toBeNull();
    expect(container.querySelector(".floating-artifact")).toBeNull();
    expect(container.querySelector(".floating-plan")).toBeNull();
    expect(container.querySelector('[data-conversation-content="timeline"]')?.getAttribute("aria-hidden")).toBe("true");
    expect((container.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(container.querySelector("#api-status")).toBeNull();
  }
  it("masks all old regions immediately, then releases them together after replay and hold/fade", async () => {
    expect(container.textContent).toContain("old-artifact-A.txt");
    expect(container.querySelector(".floating-plan")).not.toBeNull();
    const load = deferred(); getChat.mockReturnValueOnce(load.promise);
    await go("B");
    expectMasked();
    expect(context.state.chatTransition.targetChatId).toBe("B");
    await act(async () => load.resolve(response("B")));
    expect(context.state.chatId).toBe("B");
    expectMasked();
    await finishTransition();
    expect(container.querySelector(".conversation-transition-overlay")).toBeNull();
    expect(container.querySelector("[data-conversation-skeleton]")).toBeNull();
    expect(container.textContent).not.toContain("old-artifact-A.txt");
    expect(context.state.plan).toBeNull();
    expect(context.state.taskItemsById.size).toBe(0);
    expect((container.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false);
  });
  it("times out a hung request, ignores its late result, and retries the same target with a fresh seq", async () => {
    const first = deferred(); getChat.mockReturnValueOnce(first.promise);
    await go("B");
    const seq = context.state.chatTransition.seq;
    await act(async () => jest.advanceTimersByTime(15_000));
    expect(context.state.chatTransition.phase).toBe("error");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => first.resolve(response("B")));
    expect(context.state.chatId).toBe("A");
    expect(context.state.chatTransition.phase).toBe("error");
    getChat.mockResolvedValueOnce(response("B"));
    await act(async () => (container.querySelector('.conversation-transition-overlay button') as HTMLButtonElement).click());
    expect(context.state.chatTransition.seq).toBeGreaterThan(seq);
    expect(context.state.chatId).toBe("B");
    await finishTransition();
    expect(container.querySelector(".conversation-transition-overlay")).toBeNull();
  });
  it("discards B when A → B → C completes out of order", async () => {
    const b = deferred(), c = deferred();
    getChat.mockReturnValueOnce(b.promise).mockReturnValueOnce(c.promise);
    await go("B"); await go("C");
    await act(async () => c.resolve(response("C")));
    await act(async () => b.resolve(response("B")));
    expect(context.state.chatId).toBe("C");
    await finishTransition();
    expect(container.querySelector(".conversation-transition-overlay")).toBeNull();
  });
  it("starts the deadline before Agent hydration and errors even when history was never requested", async () => {
    getAgent.mockImplementation(() => new Promise(() => {}));
    await act(async () => navigate("/agent/missing?chatId=B"));
    expectMasked();
    expect(getChat).not.toHaveBeenCalled();
    const seq = context.state.chatTransition.seq;
    await act(async () => jest.advanceTimersByTime(10_000));
    await act(async () => context.dispatch({ type: "APPEND_DEBUG", line: "unrelated update" }));
    await act(async () => jest.advanceTimersByTime(5_000));
    expect(context.state.chatTransition.seq).toBe(seq);
    expect(context.state.chatTransition.phase).toBe("error");
  });
  it("does not treat a stale promotion marker as proof of a loaded conversation", async () => {
    await act(async () => navigate("/agent/demo?newChat=1788739200000"));
    getChat.mockResolvedValueOnce(response("B"));
    await act(async () => window.dispatchEvent(new CustomEvent("agent:new-chat-created", { detail: { chatId: "B", agentKey: "demo" } })));
    expect(getChat).toHaveBeenCalledTimes(1);
    expect(getChat).toHaveBeenCalledWith("B", false);
    expect(context.state.chatId).toBe("B");
  });
  it("promotes a coherent original live query without history replay", async () => {
    await act(async () => navigate("/agent/demo?newChat=1788739200001"));
    await act(async () => {
      context.querySessionsRef.current.set("live", { requestId: "live", chatId: "B", runId: "run-B", streaming: true, observationSource: "query", agentKey: "demo" });
      context.activeQuerySessionRequestIdRef.current = "live";
      context.dispatch({ type: "BATCH_UPDATE", updates: { chatId: "B", requestId: "live", streaming: true } });
      window.dispatchEvent(new CustomEvent("agent:new-chat-created", { detail: { chatId: "B", agentKey: "demo" } }));
    });
    expect(getChat).not.toHaveBeenCalled();
    expect(container.querySelector(".conversation-transition-overlay")).toBeNull();
  });
  it("coalesces repeated history requests and does not reset the deadline", async () => {
    await go("B");
    const transition = context.state.chatTransition;
    await act(async () => {
      window.dispatchEvent(new CustomEvent("agent:load-chat", { detail: { chatId: "B" } }));
      window.dispatchEvent(new CustomEvent("agent:load-chat", { detail: { chatId: "B" } }));
    });
    expect(getChat).toHaveBeenCalledTimes(1);
    expect(context.state.chatTransition.seq).toBe(transition.seq);
    expect(context.state.chatTransition.deadlineAt).toBe(transition.deadlineAt);
  });
  it("settles a hung caller at the deadline without waiting for the transport", async () => {
    await go("B");
    let settled = false;
    void mockConversationActions.loadChat("B").then(() => { settled = true; });
    await act(async () => jest.advanceTimersByTime(15_000));
    expect(settled).toBe(true);
    expect(context.state.chatTransition.phase).toBe("error");
  });
  it("ignores an old attempt arriving after the retry has committed", async () => {
    const old = deferred(); getChat.mockReturnValueOnce(old.promise);
    await go("B");
    await act(async () => jest.advanceTimersByTime(15_000));
    getChat.mockResolvedValueOnce(response("B"));
    await act(async () => (container.querySelector('.conversation-transition-overlay button') as HTMLButtonElement).click());
    await finishTransition();
    const seq = context.state.chatTransition.seq;
    await act(async () => old.resolve({ data: { ...response("B").data, artifacts: [{ artifactId: "stale", artifact: { name: "stale attempt" } }] } }));
    expect(context.state.chatTransition.seq).toBe(seq);
    expect(context.state.chatTransition.phase).toBe("ready");
    expect(context.state.artifacts).toEqual([]);
  });
  it("does not allow an attach observer to skip the target history", async () => {
    context.querySessionsRef.current.set("attached", { requestId: "attached", chatId: "B", runId: "run-B", streaming: true, observationSource: "attach", agentKey: "demo", bufferedEvents: [], bufferedDebugLines: [] });
    context.activeQuerySessionRequestIdRef.current = "attached";
    getChat.mockResolvedValueOnce(response("B"));
    await go("B");
    expect(getChat).toHaveBeenCalledWith("B", false);
    expect(context.state.chatId).toBe("B");
  });
  it("keeps all regions masked through restoration when the target has an active run", async () => {
    const load = deferred(); getChat.mockReturnValueOnce(load.promise);
    await go("B");
    await act(async () => load.resolve({ data: { ...response("B").data, activeRun: { runId: "run-B", agentKey: "demo" } } }));
    expectMasked();
    expect(context.state.chatTransition.displayMode).toBe("blocking");
    await finishTransition();
    expect(container.querySelector(".conversation-transition-overlay")).toBeNull();
  });
  it("does not mask the live surface during a valid same-chat background refresh", async () => {
    await act(async () => context.dispatch({ type: "SET_CURRENT_CHAT_ACTIVE_RUN", activeRun: { chatId: "A", runId: "run-A" } }));
    await act(async () => { void mockConversationActions.loadChat("A", { forceReload: true }); });
    expect(context.state.chatTransition.displayMode).toBe("background");
    expect(container.querySelector(".conversation-transition-overlay")).toBeNull();
    expect(container.textContent).toContain("old-artifact-A.txt");
  });
});
