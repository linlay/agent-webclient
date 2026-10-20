/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useInputHistory,
  resetInputHistoryForTests,
  type InputHistoryController,
} from "./useInputHistory";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let controller: InputHistoryController | null = null;

function Harness({ fallback }: { fallback?: ReadonlyMap<string, readonly string[]> }) {
  controller = useInputHistory(fallback);
  return React.createElement("div");
}

function mount(
  fallback?: ReadonlyMap<string, readonly string[]>,
): InputHistoryController {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(React.createElement(Harness, { fallback }));
  });
  const c = controller!;
  // 将每次状态变更包裹在 act 中，避免 React 更新告警。
  return {
    record: (chatId, text) => act(() => c.record(chatId, text)),
    navigatePrevious: (chatId, draft) => {
      let result: string | null = null;
      act(() => {
        result = c.navigatePrevious(chatId, draft);
      });
      return result;
    },
    navigateNext: (chatId) => {
      let result: string | null = null;
      act(() => {
        result = c.navigateNext(chatId);
      });
      return result;
    },
    reset: (chatId) => act(() => c.reset(chatId)),
    canGoPrevious: (chatId) => c.canGoPrevious(chatId),
    canGoNext: (chatId) => c.canGoNext(chatId),
  };
}

function unmount() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  controller = null;
}

beforeEach(() => {
  resetInputHistoryForTests();
});

afterEach(() => {
  unmount();
});

describe("useInputHistory", () => {
  it("records messages and navigates from newest to oldest, restoring the draft", () => {
    const history = mount();
    history.record("chat-1", "第一条");
    history.record("chat-1", "第二条");
    history.record("chat-1", "第三条");

    expect(history.canGoPrevious("chat-1")).toBe(true);
    expect(history.canGoNext("chat-1")).toBe(false);

    // 上翻：从最新开始，首次暂存草稿。
    expect(history.navigatePrevious("chat-1", "草稿")).toBe("第三条");
    expect(history.navigatePrevious("chat-1", "草稿")).toBe("第二条");
    expect(history.navigatePrevious("chat-1", "草稿")).toBe("第一条");
    // 已到最旧，继续上翻无效。
    expect(history.navigatePrevious("chat-1", "草稿")).toBeNull();

    // 下翻：回到较新，最终还原草稿。
    expect(history.navigateNext("chat-1")).toBe("第二条");
    expect(history.navigateNext("chat-1")).toBe("第三条");
    expect(history.navigateNext("chat-1")).toBe("草稿");
    // 草稿已还原，浏览结束。
    expect(history.canGoNext("chat-1")).toBe(false);
  });

  it("isolates history between different chats", () => {
    const history = mount();
    history.record("chat-a", "A1");
    history.record("chat-b", "B1");

    expect(history.navigatePrevious("chat-a", "")).toBe("A1");
    expect(history.navigatePrevious("chat-b", "")).toBe("B1");
    expect(history.navigatePrevious("chat-a", "")).toBe("A1");
    expect(history.navigatePrevious("chat-a", "")).toBeNull();
  });

  it("deduplicates consecutive identical messages and ignores blank text", () => {
    const history = mount();
    history.record("chat-1", "重复");
    history.record("chat-1", "重复");
    history.record("chat-1", "   ");
    history.record("chat-1", "新内容");

    expect(history.navigatePrevious("chat-1", "")).toBe("新内容");
    expect(history.navigatePrevious("chat-1", "")).toBe("重复");
    expect(history.navigatePrevious("chat-1", "")).toBeNull();
  });

  it("caps the number of entries kept per chat", () => {
    const history = mount();
    for (let i = 0; i < 60; i += 1) {
      history.record("chat-1", `消息 ${i}`);
    }
    // 仅保留最近 50 条，最旧的 10 条被淘汰。
    expect(history.navigatePrevious("chat-1", "")).toBe("消息 59");
    let oldest: string | null = null;
    for (let i = 0; i < 100; i += 1) {
      const value = history.navigatePrevious("chat-1", "");
      if (value === null) break;
      oldest = value;
    }
    expect(oldest).toBe("消息 10");
  });

  it("evicts the least recently used chat beyond the global cap", () => {
    const history = mount();
    // 超过 20 个会话后，最久未使用的会话被淘汰。
    for (let i = 0; i < 25; i += 1) {
      history.record(`chat-${i}`, `内容 ${i}`);
    }
    // 最旧的 chat-0 已被淘汰。
    expect(history.canGoPrevious("chat-0")).toBe(false);
    // 最新的会话仍可访问。
    expect(history.canGoPrevious("chat-24")).toBe(true);
  });

  it("resets navigation when the user types", () => {
    const history = mount();
    history.record("chat-1", "已发送");
    expect(history.navigatePrevious("chat-1", "草稿")).toBe("已发送");
    expect(history.canGoNext("chat-1")).toBe(true);

    history.reset("chat-1");
    expect(history.canGoNext("chat-1")).toBe(false);
    // 重新上翻会以新草稿为基线。
    expect(history.navigatePrevious("chat-1", "新草稿")).toBe("已发送");
    expect(history.navigateNext("chat-1")).toBe("新草稿");
  });

  it("navigates fallback history when no local input history exists", () => {
    const fallback = new Map<string, readonly string[]>([
      ["chat-1", ["历史一", "历史二", "历史三"]],
    ]);
    const history = mount(fallback);

    expect(history.canGoPrevious("chat-1")).toBe(true);
    expect(history.navigatePrevious("chat-1", "草稿")).toBe("历史三");
    expect(history.navigatePrevious("chat-1", "草稿")).toBe("历史二");
    expect(history.navigatePrevious("chat-1", "草稿")).toBe("历史一");
    expect(history.navigatePrevious("chat-1", "草稿")).toBeNull();
    // 下翻最终还原草稿。
    expect(history.navigateNext("chat-1")).toBe("历史二");
    expect(history.navigateNext("chat-1")).toBe("历史三");
    expect(history.navigateNext("chat-1")).toBe("草稿");
  });

  it("prefers local input history before falling back to timeline messages", () => {
    const fallback = new Map<string, readonly string[]>([
      ["chat-1", ["旧消息"]],
    ]);
    const history = mount(fallback);
    history.record("chat-1", "新消息");

    // 先翻本次会话输入历史。
    expect(history.navigatePrevious("chat-1", "草稿")).toBe("新消息");
    // 翻完后再进入 timeline 后备历史。
    expect(history.navigatePrevious("chat-1", "草稿")).toBe("旧消息");
    expect(history.navigatePrevious("chat-1", "草稿")).toBeNull();
  });

  it("deduplicates local input history against the fallback", () => {
    const fallback = new Map<string, readonly string[]>([
      ["chat-1", ["已回放消息"]],
    ]);
    const history = mount(fallback);
    // 该消息已出现在 timeline 中，不应在输入历史里重复出现。
    history.record("chat-1", "已回放消息");

    expect(history.navigatePrevious("chat-1", "草稿")).toBe("已回放消息");
    expect(history.navigatePrevious("chat-1", "草稿")).toBeNull();
  });
});
