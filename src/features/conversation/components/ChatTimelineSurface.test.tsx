/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider, useAppContext } from "@/app/state/AppContext";
import { buildChatReplayProjection } from "../lib/chatReplayProjection";
import type { ChatPreviewState } from "../lib/chatPreviewRuntime";
import { ChatTimelineSurface } from "./ChatTimelineSurface";

let mockPreview: ChatPreviewState;
const mockReload = jest.fn();
jest.mock("../hooks/useChatPreview", () => ({ useChatPreview: () => ({ state: mockPreview, reload: mockReload }) }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("./ConversationSurfaceProvider", () => ({ ConversationSurfaceProvider: ({ children }: React.PropsWithChildren) => children }));
jest.mock("@/features/timeline/components/TimelineTextSearchProvider", () => ({ TimelineTextSearchProvider: ({ children }: React.PropsWithChildren) => children }));
jest.mock("@/features/timeline/components/ConnectedConversationStage", () => ({
  ConnectedConversationStage: (props: { readOnly: boolean; surfaceMode: string }) => {
    const { state, dispatch } = useAppContext();
    return <div data-read-only={props.readOnly} data-mode={props.surfaceMode}
      data-detail={state.chats[0]?.display?.effectiveDetail} data-running={Boolean(state.currentChatActiveRun)}>
      {state.timelineNodes.get("answer")?.text}
      <button onClick={() => dispatch({ type: "SET_TIMELINE_NODE", id: "thought",
        node: { ...state.timelineNodes.get("thought")!, expanded: false } })}>collapse</button>
      <output>{String(state.timelineNodes.get("thought")?.expanded)}</output>
    </div>;
  },
}));

function preview(active: boolean, text: string): ChatPreviewState {
  const chat = { chatId: "chat-1", agentKey: "owner", firstAgentName: "Test Agent",
    display: { effectiveDetail: "simple" as const }, activeRun: active ? { runId: "run-1", agentKey: "owner" } : null,
    events: [] };
  const projection = buildChatReplayProjection("chat-1", chat);
  projection.state.timelineNodes = new Map([
    ["answer", { id: "answer", kind: "content", text, runId: "run-1" }],
    ["thought", { id: "thought", kind: "thinking", text: "Thought", expanded: true, runId: "run-1" }],
  ]);
  projection.state.timelineOrder = ["thought", "answer"];
  return { snapshot: { chat, projection, owner: { kind: "agent", agentKey: "owner" } },
    active: true, connection: "connected", loading: false, error: "" } as ChatPreviewState;
}

test("keeps server detail and live state in the official timeline, preserving user expansion", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = () => root.render(<AppProvider><ChatTimelineSurface chatId="chat-1" live /></AppProvider>);
  mockPreview = preview(true, "Live text");
  act(render);
  const stage = container.querySelector("[data-mode]")!;
  expect(stage.getAttribute("data-mode")).toBe("agent");
  expect(stage.getAttribute("data-read-only")).toBe("true");
  expect(stage.getAttribute("data-detail")).toBe("simple");
  expect(stage.getAttribute("data-running")).toBe("true");
  expect(container.textContent).toContain("Live text");
  act(() => container.querySelector("button")!.click());
  expect(container.querySelector("output")!.textContent).toBe("false");
  mockPreview = preview(false, "Completed text");
  act(render);
  expect(stage.getAttribute("data-running")).toBe("false");
  expect(container.textContent).toContain("Completed text");
  expect(container.querySelector("output")!.textContent).toBe("false");
  act(() => root.unmount());
  container.remove();
});
