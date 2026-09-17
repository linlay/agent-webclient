import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectionExplainSurface } from "./SelectionExplainSurface";

let mockDesktopMode = false;
const mockReplay = jest.fn();
const mockRuntime = jest.fn();

jest.mock("@/shared/utils/routing", () => ({ isDesktopAppMode: () => mockDesktopMode }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/features/conversation/hooks/useChatSurfaceReplay", () => ({ useChatSurfaceReplay: (...args: unknown[]) => mockReplay(...args) }));
jest.mock("@/features/btw/hooks/useStandaloneBtwRuntime", () => ({ useStandaloneBtwRuntime: (...args: unknown[]) => mockRuntime(...args) }));
jest.mock("@/features/btw/components/BtwTab", () => ({ BtwTabView: () => null }));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockDesktopMode = false;
  mockReplay.mockReturnValue({ status: "ready", snapshot: { owner: { kind: "agent", agentKey: "agent-a" } } });
  mockRuntime.mockReturnValue({
    session: { projection: { timelineOrder: [], timelineNodes: new Map() } },
    send: jest.fn(), setDraft: jest.fn(), interrupt: jest.fn(), newBranch: jest.fn(), patchTimelineNode: jest.fn(),
  });
});

it("refuses a direct browser Surface mount before reading Chat or starting any subscription", () => {
  const html = renderToStaticMarkup(React.createElement(SelectionExplainSurface, { chatId: "chat-a", runId: "run-a" }));
  expect(html).toContain("selection.explain.desktopOnly");
  expect(mockReplay).not.toHaveBeenCalled();
  expect(mockRuntime).not.toHaveBeenCalled();
});

it("uses the explanation purpose for the Desktop Surface runtime", () => {
  mockDesktopMode = true;
  renderToStaticMarkup(React.createElement(SelectionExplainSurface, { chatId: "chat-a", runId: "run-a" }));
  expect(mockRuntime).toHaveBeenCalledWith({
    chatId: "chat-a", initialRunId: "run-a", transportPurpose: "selection-explain",
    owner: { kind: "agent", agentKey: "agent-a" },
  });
});
