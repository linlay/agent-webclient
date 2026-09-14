import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomDock } from "./BottomDock";

const mockComposer = jest.fn();
jest.mock("@/app/state/AppContext", () => ({ useAppState: () => ({ plan: null, activeFrontendTool: null }) }));
jest.mock("@/features/composer/components/ComposerArea", () => ({
  ComposerArea: (props: unknown) => { mockComposer(props); return null; },
}));
jest.mock("@/features/plan/components/PlanPanel", () => ({ PlanPanel: () => null }));
jest.mock("@/features/tools/components/FrontendToolContainer", () => ({ FrontendToolContainer: () => null }));
jest.mock("@/features/artifacts/components/ArtifactPanel", () => ({ ArtifactPanel: () => null }));
jest.mock("@/features/conversation/lib/chatTransition", () => ({ areConversationInteractionsBlocked: () => false }));
jest.mock("@/shared/ui/ConversationSurfaceContext", () => ({ useConversationSurface: () => null }));
jest.mock("@/features/conversation/components/ConversationRegionSkeleton", () => ({ ConversationRegionSkeleton: () => null }));

describe("BottomDock context bar scope", () => {
  beforeEach(() => mockComposer.mockClear());
  it("enables the main composer new-chat context bar", () => {
    renderToStaticMarkup(React.createElement(BottomDock));
    expect(mockComposer).toHaveBeenCalledWith(expect.objectContaining({ enableNewChatContext: true }));
  });
  it("never enables the context bar for Copilot", () => {
    renderToStaticMarkup(React.createElement(BottomDock, { mode: "copilot" }));
    expect(mockComposer).toHaveBeenCalledWith(expect.objectContaining({
      enableNewChatContext: false, emptyInputMinRows: 3, inputMaxRows: 6,
    }));
  });
});
