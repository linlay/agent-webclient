/** @jest-environment jsdom */
import type React from "react";

const render = jest.fn();
jest.mock("react-dom/client", () => ({ createRoot: () => ({ render }) }));
jest.mock("./ConversationExportDocument", () => ({ ConversationExportDocument: function ConversationExportDocument() { return null; } }));
jest.mock("./ShareAttachmentPage", () => ({ ShareAttachmentPage: function ShareAttachmentPage() { return null; } }));
jest.mock("./publicShareBrand", () => ({
  readPublicShareBrand: () => null,
  readLocalExportBrandId: () => null,
  applyConversationExportFavicon: jest.fn(),
}));
Object.assign(globalThis, { TextEncoder: require("util").TextEncoder });

beforeEach(() => {
  render.mockClear();
  document.head.innerHTML = '<meta name="conversation-export-style-nonce" content="' + "a".repeat(43) + '" />';
  document.body.innerHTML = '<div id="root"></div><script id="conversation-snapshot" type="application/json"></script>';
  document.getElementById("conversation-snapshot")!.textContent = JSON.stringify({
    version: 1, title: "Shared conversation", locale: "zh-CN", createdAt: 1786928523000, capturedAt: 1786928523000,
    turns: [{ runId: "run-1", queryAt: 1786928523000, startedAt: 1786928523000, outcome: "completed",
      nodes: [{ id: "node-1", kind: "message", role: "assistant", runId: "run-1", at: 1786928523000, text: "Report" }] }], attachments: [],
  });
});

function boot(path: string, capability?: string) {
  window.history.replaceState({}, "", path);
  if (capability !== undefined) {
    const meta = document.createElement("meta");
    meta.name = "conversation-export-can-reshare";
    meta.content = capability;
    document.head.append(meta);
  }
  jest.isolateModules(() => require("./index"));
  const tree = render.mock.calls[0][0] as React.ReactElement<{ children: React.ReactElement<{ children: React.ReactElement }> }>;
  return tree.props.children.props.children;
}

it("selects the independent attachment page only for an online deep link", () => {
  const element = boot("/share/share-1?attachment=missing", "true");
  expect((element.type as React.FC).name).toBe("ShareAttachmentPage");
  expect(element.props).toMatchObject({ initialAttachmentId: "missing", sharePath: "/share/share-1", canReshare: true });
});

it.each([undefined, "", "false", "TRUE"])("does not enable resharing for capability %s", (capability) => {
  const element = boot("/share/share-1", capability);
  expect((element.type as React.FC).name).toBe("ConversationExportDocument");
  expect(element.props.canReshare).toBe(false);
});

it("keeps local export routing and disables online resharing even with an attachment parameter", () => {
  const element = boot("/local-export.html?attachment=missing", "true");
  expect((element.type as React.FC).name).toBe("ConversationExportDocument");
  expect(element.props.canReshare).toBe(false);
});

it("routes an empty attachment parameter to the error-capable attachment page", () => {
  expect(boot("/share/share-1?attachment=").props.initialAttachmentId).toBe("");
});
