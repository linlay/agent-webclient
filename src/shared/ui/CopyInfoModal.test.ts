import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CopyInfoModal } from "@/shared/ui/CopyInfoModal";

const mockCopyText = jest.fn();
const mockMessageSuccess = jest.fn();
const mockMessageError = jest.fn();
let buttonProps: Array<Record<string, any>> = [];

jest.mock("@/shared/utils/copy", () => ({
  copyText: (...args: unknown[]) => mockCopyText(...args),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params: Record<string, unknown> = {}) => {
      const labels: Record<string, string> = {
        "copyInfo.action.close": "Close",
        "copyInfo.action.copyAll": "Copy all",
        "copyInfo.action.copyJson": "Copy full JSON",
        "copyInfo.action.retry": "Retry",
        "copyInfo.feedback.copiedShort": "Copied",
        "copyInfo.feedback.failedShort": "Copy failed",
        "copyInfo.load.failed": "Load failed",
        "copyInfo.load.loading": "Loading",
      };
      if (key === "copyInfo.action.copyField") return `Copy ${params.label}`;
      if (key === "copyInfo.feedback.copied") return `Copied ${params.label}`;
      if (key === "copyInfo.feedback.failed") return `Failed ${params.label}`;
      return labels[key] || key;
    },
  }),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
  MaterialIcon: ({ name }: { name: string }) => React.createElement("i", { "data-icon": name }),
}));

jest.mock("antd", () => {
  const React = require("react");
  const Button = ({ children, danger, icon, loading, ...props }: any) => {
    buttonProps.push({ children, danger, icon, loading, ...props });
    return React.createElement("button", props, icon, children);
  };
  const Modal = ({ open, title, children, footer }: any) => open
    ? React.createElement("div", null, title, children, footer)
    : null;
  const Collapse = ({ items = [] }: any) => React.createElement(
    "div",
    null,
    items.map((item: any) => React.createElement("div", { key: item.key }, item.label, item.children)),
  );
  const Alert = ({ message, description, action }: any) =>
    React.createElement("div", null, message, description, action);
  const Tooltip = ({ children }: any) => React.createElement(React.Fragment, null, children);
  const Spin = () => React.createElement("span", null, "spin");
  return {
    Alert,
    Button,
    Collapse,
    Modal,
    Spin,
    Tooltip,
    message: {
      success: (...args: unknown[]) => mockMessageSuccess(...args),
      error: (...args: unknown[]) => mockMessageError(...args),
    },
  };
});

describe("CopyInfoModal", () => {
  beforeEach(() => {
    buttonProps = [];
    mockCopyText.mockReset();
    mockMessageSuccess.mockReset();
    mockMessageError.mockReset();
    (globalThis as any).window = {
      setTimeout: jest.fn(() => 1),
      clearTimeout: jest.fn(),
    };
  });

  it("copies a field, all readable rows, and full JSON", async () => {
    mockCopyText.mockResolvedValue(undefined);
    renderToStaticMarkup(
      React.createElement(CopyInfoModal, {
        open: true,
        title: "Agent",
        groups: [{
          key: "basic",
          label: "Basic",
          rows: [{
            key: "id",
            label: "Agent ID",
            displayValue: "agent-a",
            copyValue: "agent-a",
          }],
        }],
        rawData: { key: "agent-a" },
        rawReady: true,
        onClose: jest.fn(),
      }),
    );

    buttonProps.find((props) => props["aria-label"] === "Copy Agent ID")?.onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockCopyText).toHaveBeenNthCalledWith(1, "agent-a");

    buttonProps.find((props) => props.children === "Copy all")?.onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockCopyText).toHaveBeenNthCalledWith(2, "Agent ID: agent-a");

    buttonProps.find((props) => props.children === "Copy full JSON")?.onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockCopyText).toHaveBeenNthCalledWith(3, '{\n  "key": "agent-a"\n}');
    expect(mockMessageSuccess).toHaveBeenCalledTimes(3);
  });

  it("reports copy errors and keeps full JSON disabled after detail load failure", async () => {
    const onRetry = jest.fn();
    mockCopyText.mockRejectedValue(new Error("clipboard denied"));
    renderToStaticMarkup(
      React.createElement(CopyInfoModal, {
        open: true,
        title: "Chat",
        groups: [{
          key: "basic",
          label: "Basic",
          rows: [{
            key: "id",
            label: "Chat ID",
            displayValue: "chat-a",
            copyValue: "chat-a",
          }],
        }],
        rawData: null,
        rawReady: false,
        error: "network error",
        onRetry,
        onClose: jest.fn(),
      }),
    );

    expect(buttonProps.find((props) => props.children === "Copy full JSON")?.disabled).toBe(true);
    buttonProps.find((props) => props.children === "Retry")?.onClick();
    expect(onRetry).toHaveBeenCalledTimes(1);

    buttonProps.find((props) => props["aria-label"] === "Copy Chat ID")?.onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockMessageError).toHaveBeenCalledWith("Failed Chat ID");
  });
});
