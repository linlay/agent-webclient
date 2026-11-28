/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextDecoder, TextEncoder } from "node:util";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, TextEncoder, TextDecoder });
if (typeof globalThis.Request === "undefined") {
  class TestRequest {
    readonly url: string;
    readonly method: string;
    readonly signal?: AbortSignal;
    constructor(input: string | URL | { url: string }, init?: RequestInit) {
      this.url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      this.method = init?.method || "GET";
      this.signal = init?.signal || undefined;
    }
  }
  Object.assign(globalThis, { Request: TestRequest });
}

const { createMemoryRouter, RouterProvider, useLocation } = require("react-router-dom");
const { MobileLayout } = require("./MobileLayout");
const {
  CommandOverlayProvider,
  useCommandOverlayActions,
} = require("@/features/command-center/components/CommandOverlayProvider");
const {
  MemoryOverlayProvider,
  useMemoryOverlayActions,
} = require("@/features/memory/components/MemoryOverlayProvider");

type LeftSidebarProps = {
  onSettingsPageOpen?: () => void;
  onQuickActionOpen?: () => void;
  onClose?: () => void;
  settingsMenuReopenToken?: number;
};

const leftSidebarProps: LeftSidebarProps[] = [];
const swipeDrawers: Array<{ side: string; open: boolean }> = [];

jest.mock("antd", () => {
  const ReactRuntime = require("react") as typeof React;
  return {
    Drawer: ({
      open,
      onClose,
      afterOpenChange,
      children,
    }: {
      open: boolean;
      onClose?: () => void;
      afterOpenChange?: (open: boolean) => void;
      children?: React.ReactNode;
    }) => {
      const previousOpen = ReactRuntime.useRef(open);
      ReactRuntime.useEffect(() => {
        if (previousOpen.current === open) return;
        previousOpen.current = open;
        // 真 Drawer 在退场动画结束后才回调，这里用一个宏任务近似动画时长。
        const timer = setTimeout(() => afterOpenChange?.(open), 0);
        return () => clearTimeout(timer);
      }, [afterOpenChange, open]);
      return ReactRuntime.createElement(
        "div",
        { "data-page-drawer": String(open) },
        ReactRuntime.createElement(
          "button",
          { type: "button", "data-close-page": "", onClick: onClose },
          "close page",
        ),
        open ? children : null,
      );
    },
  };
});

jest.mock("@/app/state/AppContext", () => ({
  useAppState: () => ({ rightSidebarOpen: false, chatId: "chat-a" }),
  useAppDispatch: () => jest.fn(),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock("@/shared/ui/MobileSwipeDrawer", () => {
  const ReactRuntime = require("react") as typeof React;
  return {
    MobileSwipeDrawer: ReactRuntime.forwardRef(
      (props: { side: string; open: boolean; children?: React.ReactNode }, _ref: unknown) => {
        swipeDrawers.push({ side: props.side, open: props.open });
        return ReactRuntime.createElement(
          "div",
          { "data-drawer-side": props.side, "data-drawer-open": String(props.open) },
          props.children,
        );
      },
    ),
  };
});

jest.mock("./LeftSidebar", () => {
  const ReactRuntime = require("react") as typeof React;
  const { useNavigate } = require("react-router-dom");
  return {
    LeftSidebar: (props: LeftSidebarProps) => {
      leftSidebarProps.push(props);
      const navigate = useNavigate();
      return ReactRuntime.createElement(
        "div",
        null,
        ReactRuntime.createElement(
          "button",
          {
            type: "button",
            "data-open-settings-page": "",
            onClick: () => {
              props.onSettingsPageOpen?.();
              void navigate("/mobile/agents");
            },
          },
          "open agents page",
        ),
        ReactRuntime.createElement(
          "button",
          {
            type: "button",
            "data-open-quick-action": "",
            onClick: () => {
              props.onQuickActionOpen?.();
              props.onClose?.();
            },
          },
          "open quick action",
        ),
      );
    },
  };
});

jest.mock("./TopNav", () => ({
  TopNav: (props: { onOpenNavigation?: () => void }) =>
    React.createElement(
      "header",
      null,
      React.createElement(
        "button",
        { type: "button", "data-open-nav": "", onClick: props.onOpenNavigation },
        "nav",
      ),
    ),
}));

jest.mock("./sidebar/right/RightSidebar", () => ({
  RightSidebar: () => React.createElement("aside", null, "right-sidebar"),
}));

jest.mock("./hooks/useMobileViewport", () => ({
  useMobileViewport: jest.fn(),
}));

jest.mock("@/shared/ui/hooks/useMobileSwipeGestures", () => ({
  useMobileSwipeGestures: jest.fn(),
}));

/** 面板状态的驱动器：真实 Provider 里只开/关面板，不渲染面板 UI。 */
function OverlayDriver() {
  const { openCommandOverlay, closeCommandOverlay } = useCommandOverlayActions();
  const { openMemory, closeMemory } = useMemoryOverlayActions();
  return React.createElement(
    "div",
    null,
    React.createElement(
      "button",
      { type: "button", "data-open-command": "", onClick: () => openCommandOverlay({ type: "automation" }) },
      "open automation",
    ),
    React.createElement(
      "button",
      { type: "button", "data-close-command": "", onClick: () => closeCommandOverlay(false) },
      "close automation",
    ),
    React.createElement(
      "button",
      { type: "button", "data-open-memory": "", onClick: openMemory },
      "open memory",
    ),
    React.createElement(
      "button",
      { type: "button", "data-close-memory": "", onClick: closeMemory },
      "close memory",
    ),
  );
}

/** 复刻 MobileShell 的 conversationSearch：只在 /mobile 上跟随地址栏更新。 */
function Harness() {
  const location = useLocation();
  const conversationSearch = React.useRef(
    location.pathname === "/mobile" ? location.search : "",
  );
  if (location.pathname === "/mobile") conversationSearch.current = location.search;
  return React.createElement(
    CommandOverlayProvider,
    null,
    React.createElement(
      MemoryOverlayProvider,
      null,
      React.createElement(OverlayDriver),
      React.createElement(
        MobileLayout,
        { conversationSearch: conversationSearch.current, overlays: null },
        React.createElement("div", null, "conversation"),
      ),
    ),
  );
}

let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

async function render(path = "/mobile?chatId=chat-a") {
  router = createMemoryRouter(
    [
      {
        path: "/mobile",
        element: React.createElement(Harness),
        children: [{ path: "agents", element: React.createElement("div", null, "Agent management") }],
      },
    ],
    { initialEntries: [path] },
  );
  await act(async () => root.render(React.createElement(RouterProvider, { router })));
}

function latestSidebarProps(): LeftSidebarProps {
  return leftSidebarProps[leftSidebarProps.length - 1] || {};
}

function navigationOpen(): boolean {
  const navigation = [...swipeDrawers].reverse().find((drawer) => drawer.side === "left");
  return Boolean(navigation?.open);
}

async function flushDrawerAnimation() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(selector: string): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
}

beforeEach(() => {
  leftSidebarProps.length = 0;
  swipeDrawers.length = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  router?.dispose();
  container.remove();
});

it("returns to the settings menu after closing a page opened from it", async () => {
  await render();
  expect(navigationOpen()).toBe(false);
  expect(latestSidebarProps().settingsMenuReopenToken).toBe(0);

  await act(async () => {
    button("[data-open-settings-page]").click();
  });
  expect(router.state.location.pathname).toBe("/mobile/agents");
  expect(container.textContent).toContain("Agent management");
  expect(navigationOpen()).toBe(false);

  await act(async () => {
    button("[data-close-page]").click();
  });
  await flushDrawerAnimation();
  expect(router.state.location.pathname).toBe("/mobile");
  // 导航抽屉重新打开，并把“重新打开设置菜单”的序号交给侧栏。
  expect(navigationOpen()).toBe(true);
  expect(latestSidebarProps().settingsMenuReopenToken).toBe(1);
});

it("stays quiet when the page leads to another conversation", async () => {
  await render();
  await act(async () => {
    button("[data-open-settings-page]").click();
  });

  await act(async () => {
    await router.navigate("/mobile?chatId=chat-b");
  });
  await flushDrawerAnimation();
  expect(navigationOpen()).toBe(false);
  expect(latestSidebarProps().settingsMenuReopenToken).toBe(0);
});

it("does not reopen the menu when a page is opened and closed from elsewhere", async () => {
  await render("/mobile?chatId=chat-a");
  await act(async () => {
    await router.navigate("/mobile/agents");
  });
  await act(async () => {
    button("[data-close-page]").click();
  });
  await flushDrawerAnimation();
  expect(router.state.location.pathname).toBe("/mobile");
  expect(navigationOpen()).toBe(false);
  expect(latestSidebarProps().settingsMenuReopenToken).toBe(0);
});

it("returns to the navigation drawer after closing a quick action panel", async () => {
  await render();
  await act(async () => {
    button("[data-open-nav]").click();
  });
  expect(navigationOpen()).toBe(true);

  await act(async () => {
    button("[data-open-quick-action]").click();
  });
  expect(navigationOpen()).toBe(false);

  await act(async () => {
    button("[data-open-command]").click();
  });
  expect(navigationOpen()).toBe(false);

  await act(async () => {
    button("[data-close-command]").click();
  });
  // 自动化面板收起后回到快捷入口所在的导航抽屉。
  expect(navigationOpen()).toBe(true);
});

it("returns to the navigation drawer after closing the memory panel", async () => {
  await render();
  await act(async () => {
    button("[data-open-quick-action]").click();
  });
  await act(async () => {
    button("[data-open-memory]").click();
  });
  await act(async () => {
    button("[data-close-memory]").click();
  });
  expect(navigationOpen()).toBe(true);
});

it("stays quiet when a quick action panel leads to another conversation", async () => {
  await render();
  await act(async () => {
    button("[data-open-quick-action]").click();
  });
  await act(async () => {
    button("[data-open-command]").click();
  });
  await act(async () => {
    await router.navigate("/mobile?chatId=chat-b");
  });
  await act(async () => {
    button("[data-close-command]").click();
  });
  expect(navigationOpen()).toBe(false);
});
