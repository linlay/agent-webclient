import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BtwTab } from "@/features/btw/components/BtwTab";

jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: jest.fn(() => jest.fn()),
  useAppState: jest.fn(),
}));

jest.mock("@/features/btw/components/BtwProvider", () => ({
  useBTW: jest.fn(),
}));

jest.mock("@/features/timeline/components/TimelineInteractionContext", () => {
  const React = require("react");
  return {
    TimelineInteractionProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/features/timeline/components/TimelineRow", () => {
  const React = require("react");
  return {
    TimelineRow: () => React.createElement("div", { className: "timeline-row" }),
  };
});

jest.mock("@/features/timeline/lib/timelineDisplay", () => ({
  buildTimelineDisplayItems: jest.fn(() => []),
}));

jest.mock("@/shared/ui/MaterialIcon", () => {
  const React = require("react");
  return {
    MaterialIcon: ({ name, className }: { name: string; className?: string }) =>
      React.createElement("span", { "data-icon": name, className }),
  };
});

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock("antd", () => {
  const React = require("react");
  const Passthrough = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  return {
    App: {
      useApp: () => ({ message: { success: jest.fn() } }),
    },
    Flex: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    Input: {
      TextArea: ({ value, disabled, placeholder }: any) =>
        React.createElement("textarea", {
          defaultValue: value,
          disabled,
          placeholder,
        }),
    },
    Popconfirm: Passthrough,
    Tooltip: Passthrough,
  };
});

const { useAppState } = jest.requireMock("@/app/state/AppContext") as {
  useAppState: jest.Mock;
};
const { useBTW } = jest.requireMock(
  "@/features/btw/components/BtwProvider",
) as {
  useBTW: jest.Mock;
};

const sharedActions = {
  sendBTW: jest.fn(),
  setDraft: jest.fn(),
  patchTimelineNode: jest.fn(),
  newBranch: jest.fn(),
  interruptBTW: jest.fn(),
};

function renderSession(
  overrides: Record<string, unknown> = {},
): string {
  const session = {
    parentChatId: "chat_1",
    btwId: "btw_1",
    runId: "",
    requestId: "",
    agentKey: "agent_1",
    status: "idle",
    interruptReady: false,
    interruptPending: false,
    draft: "another question",
    error: "",
    focusToken: 0,
    lastSeq: 0,
    updatedAt: 1,
    usage: null,
    config: {},
    projection: {
      timelineOrder: [],
      timelineNodes: new Map(),
      events: [],
      taskItemsById: {},
    },
    ...overrides,
  };

  useBTW.mockReturnValue({
    ...sharedActions,
    getSession: () => session,
  });

  return renderToStaticMarkup(React.createElement(BtwTab));
}

function findButton(html: string, label: string): string {
  const button = html.match(
    new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`),
  )?.[0];
  expect(button).toBeDefined();
  return button || "";
}

describe("BtwTab composer controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppState.mockReturnValue({ chatId: "chat_1" });
  });

  it("renders the primary Send action while idle", () => {
    const html = renderSession();
    const button = findButton(html, "btw.send");

    expect(button).toContain("ui-btn-primary");
    expect(button).not.toContain("disabled");
    expect(html).not.toContain('aria-label="btw.stop"');
  });

  it("renders Stop in the send position but disables it before run registration", () => {
    const html = renderSession({
      status: "running",
      interruptReady: false,
    });
    const button = findButton(html, "btw.stop");

    expect(html.indexOf("<textarea")).toBeLessThan(
      html.indexOf('aria-label="btw.stop"'),
    );
    expect(button).toContain("ui-btn-danger");
    expect(button).toContain("disabled");
    expect(button).not.toContain("is-loading");
    expect(html).not.toContain('aria-label="btw.send"');
  });

  it("enables the danger Stop action after run registration", () => {
    const html = renderSession({
      status: "running",
      interruptReady: true,
    });
    const button = findButton(html, "btw.stop");

    expect(button).toContain("ui-btn-danger");
    expect(button).not.toContain("disabled");
    expect(button).not.toContain("is-loading");
  });

  it("shows a disabled loading Stop action while interrupt is pending", () => {
    const html = renderSession({
      status: "running",
      interruptReady: true,
      interruptPending: true,
    });
    const button = findButton(html, "btw.stop");

    expect(button).toContain("ui-btn-danger");
    expect(button).toContain("is-loading");
    expect(button).toContain("disabled");
    expect(html).toContain("tw:animate-ui-spin");
  });

  it("keeps Stop retryable after a rejected interrupt", () => {
    const html = renderSession({
      status: "running",
      interruptReady: true,
      interruptPending: false,
      error: "btw.interrupt.rejected",
    });
    const button = findButton(html, "btw.stop");

    expect(button).not.toContain("disabled");
    expect(button).not.toContain("is-loading");
  });
});
