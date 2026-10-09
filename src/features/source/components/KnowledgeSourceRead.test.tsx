/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { KnowledgeSourceRead } from "./KnowledgeSourceRead";
import { readPublishedKnowledge } from "@/shared/data/api/requests/kbases";

jest.mock("antd", () => ({
 Button: ({ children, size, ...props }: any) => <button {...props}>{children}</button>,
 Flex: ({ children }: any) => <div>{children}</div>,
 Alert: ({ message }: any) => <div role="alert">{message}</div>,
}));
jest.mock("@/shared/i18n", () => ({ t: (key: string) => key }));
jest.mock("@/shared/data/api/requests/kbases", () => ({ readPublishedKnowledge: jest.fn(), downloadPublishedKnowledge: jest.fn() }));
const read = readPublishedKnowledge as jest.Mock;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
 read.mockReset();
 container = document.createElement("div"); document.body.appendChild(container);
 root = createRoot(container);
 act(() => root.render(<KnowledgeSourceRead chatId="chat" sourceId="kbase:lib/research/same.md" name="same.md" />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function click(label: string) {
 const button = Array.from(container.querySelectorAll("button")).find(b => b.textContent === label);
 if (!button) throw new Error("missing button " + label);
 await act(async () => { button.click(); });
}
it("pages a published library source without a Workspace URL", async () => {
 read.mockResolvedValueOnce({data: {content: "first", endLine: 200, hasMore: true}}).mockResolvedValueOnce({data: {content: "last", endLine: 201, hasMore: false}});
 await click("knowledge.source.read");
 expect(read).toHaveBeenNthCalledWith(1, "chat", "kbase:lib/research/same.md", 0, expect.any(AbortSignal));
 await click("knowledge.source.more");
 expect(read).toHaveBeenNthCalledWith(2, "chat", "kbase:lib/research/same.md", 201, expect.any(AbortSignal));
 expect(container.querySelector("pre")?.textContent).toBe("first\nlast");
 await click("knowledge.source.close");
 expect(container.querySelector("pre")).toBeNull();
});
it("shows a rejected library read without inventing content", async () => {
 read.mockRejectedValue(new Error("library binding changed"));
 await click("knowledge.source.read");
 expect(container.querySelector('[role="alert"]')?.textContent).toBe("library binding changed");
 expect(container.querySelector("pre")).toBeNull();
});
