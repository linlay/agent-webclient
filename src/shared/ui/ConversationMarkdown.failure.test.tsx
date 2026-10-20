/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationMarkdown } from "./ConversationMarkdown";

jest.mock("@ant-design/x-markdown/plugins/Latex", () => { throw new Error("chunk unavailable"); });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("keeps the raw formula and surrounding text readable when the lazy formula chunk fails", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ConversationMarkdown content="Before $x^2$ after" codeComponent={({ children }) => <code>{children}</code>} />));
    expect(host.textContent).toContain("Before $x^2$ after");
    expect(host.querySelector('[role="status"]')).not.toBeNull();
  } finally { act(() => root.unmount()); host.remove(); }
});
