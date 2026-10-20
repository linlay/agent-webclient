/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MarkdownCode } from "./MarkdownCode";
import { ConversationMarkdownCode } from "@/shared/ui/markdown-code/ConversationMarkdownCode";
import { copyText } from "@/shared/utils/copy";
import { copyWebText } from "@/shared/utils/webClipboard";

const mockSuccess = jest.fn();
const mockError = jest.fn();
jest.mock("@/shared/utils/copy", () => ({ copyText: jest.fn() }));
jest.mock("@/shared/utils/webClipboard", () => ({ copyWebText: jest.fn() }));
jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: () => jest.fn(),
  useAppState: () => ({ rightSidebarOpen: false, viewerTabs: [] }),
}));
jest.mock("@/shared/data/desktop/desktopContextMenu", () => ({
  useDesktopContextMenuTarget: () => null,
}));
jest.mock("antd", () => ({
  ...jest.requireActual("antd"),
  App: { useApp: () => ({ message: { success: mockSuccess, error: mockError } }) },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each([false, true])("keeps code-copy feedback in its owner (application=%s)", async (application) => {
  jest.clearAllMocks();
  const copy = jest.mocked(application ? copyText : copyWebText);
  copy.mockResolvedValue(undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    const Component = application ? MarkdownCode : ConversationMarkdownCode;
    await act(async () => root.render(<Component block lang="text" streamStatus="done">code</Component>));
    const button = host.querySelector('[data-material-icon="content_copy"]')!.closest("button")!;
    await act(async () => button.click());
    expect(copy).toHaveBeenCalledWith("code");
    if (application) {
      expect(mockSuccess).toHaveBeenCalledTimes(1);
      expect(host.querySelector('[role="status"]')).toBeNull();
    } else {
      expect(mockSuccess).not.toHaveBeenCalled();
      expect(host.querySelector('[role="status"]')).not.toBeNull();
    }
    copy.mockRejectedValueOnce(new Error("clipboard denied"));
    await act(async () => button.click());
    if (application) {
      expect(mockError).toHaveBeenCalledTimes(1);
      expect(host.querySelector('[role="status"]')).toBeNull();
    } else {
      expect(mockError).not.toHaveBeenCalled();
      expect(host.querySelector('[role="status"]')).not.toBeNull();
    }
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
