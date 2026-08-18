import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GlobalRow } from "@/features/search/lib/globalSearchRows";
import { GlobalSearchOverlay } from "@/features/search/components/GlobalSearchOverlay";

const mockCloseGlobalSearch = jest.fn();
const mockOpenCommandOverlay = jest.fn();
const mockOpenTarget = jest.fn();
let capturedSelectRow: ((row: GlobalRow) => void) | undefined;

jest.mock("antd", () => ({
  Modal: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: () => jest.fn(),
  useAppState: () => ({
    agents: [],
    chats: [],
    teams: [],
    workerRows: [],
    chatId: "chat-1",
  }),
}));

jest.mock("@/features/workers/lib/currentWorker", () => ({
  resolveCurrentWorkerSummary: () => ({
    type: "agent",
    sourceId: "agent-1",
    displayName: "Agent One",
  }),
}));

jest.mock("@/features/search/lib/globalSearchRows", () => ({
  buildGlobalRows: () => [
    {
      kind: "action",
      section: "actions",
      key: "history",
      label: "History",
      icon: "history",
      action: "history",
    },
  ],
}));

jest.mock("@/features/search/components/GlobalSearchPanel", () => ({
  GlobalSearchPanel: (props: { onSelectRow: (row: GlobalRow) => void }) => {
    capturedSelectRow = props.onSelectRow;
    return React.createElement("div", null, "search");
  },
}));

jest.mock("@/features/search/components/GlobalSearchOverlayProvider", () => ({
  useGlobalSearchActions: () => ({ closeGlobalSearch: mockCloseGlobalSearch }),
  useGlobalSearchOpen: () => true,
}));

jest.mock("@/features/workers/components/CommandOverlayProvider", () => ({
  useCommandOverlayActions: () => ({
    openCommandOverlay: mockOpenCommandOverlay,
  }),
}));

jest.mock("@/features/settings/components/SettingsOverlayProvider", () => ({
  useSettingsOverlayActions: () => ({ openOverlay: jest.fn() }),
}));

jest.mock("@/features/surfaces/openTarget", () => ({
  useOpenTarget: () => mockOpenTarget,
}));

jest.mock("@/shared/data", () => ({
  searchGlobal: jest.fn(),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("GlobalSearchOverlay", () => {
  beforeEach(() => {
    capturedSelectRow = undefined;
    mockCloseGlobalSearch.mockReset();
    mockOpenCommandOverlay.mockReset();
    mockOpenTarget.mockReset();
  });

  it("opens current worker history without opening the global history page", () => {
    renderToStaticMarkup(React.createElement(GlobalSearchOverlay));

    capturedSelectRow?.({
      kind: "action",
      section: "actions",
      key: "history",
      label: "History",
      icon: "history",
      action: "history",
    });

    expect(mockCloseGlobalSearch).toHaveBeenCalled();
    expect(mockOpenCommandOverlay).toHaveBeenCalledWith({ type: "history" });
    expect(mockOpenTarget).not.toHaveBeenCalled();
  });
});
