import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/state";
import type { AppAction } from "@/app/state/actions";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import { TimelineRow } from "@/features/timeline/components/TimelineRow";
import { processStreamEvent } from "@/features/events/lib/eventProcessor";
import { createLiveProcessorState, createLocalCache } from "@/features/conversation/lib/liveEventCache";
import { applyLiveEventCommand } from "@/features/conversation/lib/liveEventDispatch";
import { createReplayState, replayEvent } from "@/features/conversation/lib/conversationReplay";

jest.mock("@/features/surfaces/openTarget", () => ({ useOpenTarget: () => jest.fn() }));
jest.mock("@/features/timeline/components/planning", () => ({ PlanningTimeline: () => null }));
jest.mock("@/features/terminal/lib/terminalDockPersistence", () => ({ restoreTerminalDockOpen: () => false }));

function projectSystemMessage(event: AgentEvent, mode: "live" | "replay"): TimelineNode {
  if (mode === "replay") {
    const replay = createReplayState();
    replayEvent(replay, event);
    return replay.timelineNodes.get(replay.timelineOrder[0])!;
  }
  const cache = createLocalCache();
  const state = createInitialState();
  const actions: AppAction[] = [];
  const commands = processStreamEvent(event, createLiveProcessorState(cache, state), {
    mode: "live", reasoningExpandedDefault: false,
  });
  for (const command of commands) {
    applyLiveEventCommand({ command, cache, state, dispatch: action => actions.push(action) });
  }
  const action = actions.find(action => action.type === "SET_TIMELINE_NODE");
  if (action?.type !== "SET_TIMELINE_NODE") throw new Error("Expected a system message");
  expect(cache.nodeById.get(action.id)).toEqual(action.node);
  return action.node;
}

describe.each(["live", "replay"] as const)("%s system message presentation", mode => {
  it.each(["l1_tools", "summary"] as const)("shows %s compaction completion as information", level => {
    const node = projectSystemMessage({
      type: "context.compact.complete", compactId: "completed", level,
      preCompactEstimatedTokens: 7853, postCompactEstimatedTokens: 6358, scope: "history", timestamp: 123,
    }, mode);
    expect(node.systemMessageLevel).toBe("info");
    expect(node.tooltip).toBeTruthy();
    const html = renderToStaticMarkup(React.createElement(TimelineRow, { node }));
    expect(html).toContain('data-level="info"');
    expect(html).toContain('data-material-icon="info"');
    expect(html).not.toContain('data-material-icon="warning"');
    expect(html).toContain("6,358");
  });

  it("keeps compaction failures red even without structured error details", () => {
    const node = projectSystemMessage({
      type: "context.compact.failed", compactId: "failed", detail: "summary_input_too_large", timestamp: 124,
    }, mode);
    expect(node.systemMessageLevel).toBe("error");
    expect(node.errorDetail).toBeUndefined();
    const html = renderToStaticMarkup(React.createElement(TimelineRow, { node }));
    expect(html).toContain('data-level="error"');
    expect(html).toContain('data-material-icon="warning"');
    expect(html).not.toContain('data-material-icon="info"');
  });

  it("preserves the warning presentation and technical details for run errors", () => {
    const node = projectSystemMessage({
      type: "run.error", error: { code: "service_unavailable", message: "Unavailable" }, timestamp: 125,
    }, mode);
    expect(node.systemMessageLevel).toBe("error");
    const html = renderToStaticMarkup(React.createElement(TimelineRow, { node }));
    expect(html).toContain('data-level="error"');
    expect(html).toContain('data-material-icon="warning"');
    expect(html).toContain('class="system-alert-details"');
  });
});

it("keeps existing system error nodes without a level visible as warnings", () => {
  const node: TimelineNode = { id: "old-error", kind: "message", role: "system", text: "Failed", ts: 1 };
  const html = renderToStaticMarkup(React.createElement(TimelineRow, { node }));
  expect(html).toContain('data-level="error"');
  expect(html).toContain('data-material-icon="warning"');
});
