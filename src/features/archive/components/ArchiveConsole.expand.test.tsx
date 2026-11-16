/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ArchiveConsole } from "@/features/archive/components/ArchiveConsole";
import { t } from "@/shared/i18n";

const mockResizeOptions: {
  onResizeStart?: () => void;
  onResize?: (delta: number) => void;
} = {};

const mockLoadArchiveDetail = jest.fn(async () => undefined);

const mockRuntime = {
  query: "",
  setQuery: jest.fn(),
  agents: [],
  showAgentFilter: true,
  agentFilter: "",
  setAgentFilter: jest.fn(),
  archivedRange: null,
  setArchivedRange: jest.fn(),
  createdRange: null,
  setCreatedRange: jest.fn(),
  lastRunRange: null,
  setLastRunRange: jest.fn(),
  resetFilters: jest.fn(),
  items: [],
  totalCount: 0,
  loadingList: false,
  resultText: "",
  selected: "chat_1",
  detail: null,
  loadingDetail: false,
  selectedItem: undefined,
  conversation: null,
  usageSummary: "",
  loadArchiveDetail: mockLoadArchiveDetail,
  restoreSelected: jest.fn(),
  deleteSelected: jest.fn(),
  restoreGroup: jest.fn(),
  deleteGroup: jest.fn(),
};

jest.mock("@/features/archive/hooks/useArchiveRuntime", () => ({
  useArchiveRuntime: () => mockRuntime,
}));

jest.mock("@/features/archive/components/ArchiveListPane", () => ({
  ArchiveListPane: (props: {
    selectedChatId?: string;
    onSelect?: (chatId: string) => void;
  }) =>
    require("react").createElement(
      "div",
      {
        "data-testid": "list-pane",
        "data-selected": props.selectedChatId,
      },
      require("react").createElement(
        "button",
        {
          type: "button",
          "data-testid": "select-chat",
          onClick: () => props.onSelect?.("chat_1"),
        },
        "select",
      ),
    ),
}));

jest.mock("@/features/archive/components/ArchiveDetailPane", () => ({
  ArchiveDetailPane: () =>
    require("react").createElement("div", { "data-testid": "detail-pane" }),
}));

jest.mock("@/shared/ui/usePanelResize", () => ({
  usePanelResize: (options: typeof mockResizeOptions) => {
    Object.assign(mockResizeOptions, options);
    return { handlePointerDown: jest.fn() };
  },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1000,
  });
  mockLoadArchiveDetail.mockClear();
});

async function renderConsole() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ArchiveConsole />);
  });
  return { container, root };
}

async function drag(delta: number) {
  await act(async () => {
    mockResizeOptions.onResizeStart?.();
    mockResizeOptions.onResize?.(delta);
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

test("keeps the split below half the viewport", async () => {
  const { container, root } = await renderConsole();
  expect(container.querySelector('[data-testid="detail-pane"]')).not.toBeNull();

  await drag(100);
  const consoleElement = container.querySelector(
    ".archive-console",
  ) as HTMLElement;
  expect(consoleElement.style.getPropertyValue("--archive-list-col")).toBe(
    "380px",
  );
  expect(container.querySelector('[data-testid="detail-pane"]')).not.toBeNull();

  await act(async () => root.unmount());
});

test("expands the list once the splitter crosses half the viewport", async () => {
  const { container, root } = await renderConsole();

  await drag(250);
  expect(container.querySelector('[data-testid="detail-pane"]')).toBeNull();
  expect(container.textContent).toContain(t("archive.page.title"));
  expect(
    container.querySelector('[data-testid="list-pane"]')?.getAttribute(
      "data-selected",
    ),
  ).toBe("chat_1");

  // Selecting a chat from the expanded list returns to the split layout.
  const select = container.querySelector('[data-testid="select-chat"]');
  await act(async () => {
    (select as HTMLButtonElement).click();
  });
  expect(mockLoadArchiveDetail).toHaveBeenCalledWith("chat_1");
  expect(container.querySelector('[data-testid="detail-pane"]')).not.toBeNull();
  expect(container.textContent).not.toContain(t("archive.page.title"));

  await act(async () => root.unmount());
});
