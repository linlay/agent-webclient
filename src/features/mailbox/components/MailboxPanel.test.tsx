/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAgents } from "@/shared/data";
import type { MailRecord } from "@/shared/data/api/dto/mailbox";
import { getMailDetail, getMails } from "@/shared/data/api/requests/mailbox";
import { I18nProvider } from "@/shared/i18n";
import { zhCNMessages } from "@/shared/i18n/locales/zh-CN";
import { MailboxPanel } from "./MailboxPanel";

jest.mock("@/shared/data", () => ({ getAgents: jest.fn() }));
jest.mock("@/shared/data/api/requests/mailbox", () => ({ getMailDetail: jest.fn(), getMails: jest.fn() }));
jest.mock("../hooks/useMailChatLabels", () => ({ useMailChatLabels: () => ({ "work-2": "Work #2", "work-15": "Work #15" }) }));
jest.mock("../hooks/useMailTargetChats", () => ({ useMailTargetChats: () => ({}) }));
jest.mock("./MailboxPanel.module.css", () => ({ agentName: "agent-name" }));

const mail: MailRecord = {
  mailId: "mail-1",
  kind: "letter",
  status: "done",
  createdAt: 1,
  fromAgentKey: "cutej",
  toAgentKey: "cutej",
  fromChatId: "work-2",
  toChatId: "work-15",
  fromRunId: "run-1",
  message: "测试消息",
};
const response = <T,>(data: T) => ({ code: 0, msg: "", data });
const addressNames = (container: ParentNode) =>
  Array.from(container.querySelectorAll(".agent-name"), node => node.textContent);
let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches: false, addListener: jest.fn(), removeListener: jest.fn() }),
  });
});

beforeEach(() => {
  jest.mocked(getAgents).mockResolvedValue(response([
    { key: "cutej", name: "小君" },
    { key: "writer", name: "小文" },
    { key: "unnamed", name: " " },
  ]));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it.each<{ scenario: string; fields: Partial<MailRecord>; names: string[]; detailName?: string }>([
  { scenario: "one Agent across two chats", fields: {}, names: ["小君", "小君"], detailName: "旧名称" },
  { scenario: "two Agents", fields: { toAgentKey: "writer" }, names: ["小君", "小文"] },
  { scenario: "a user sender", fields: { originType: "user", fromAgentName: "旧名称" }, names: ["用户", "小君"] },
  { scenario: "an Agent named only in the mail", fields: { fromAgentKey: "retired", toAgentKey: "retired", fromAgentName: "旧智能体" }, names: ["旧智能体", "旧智能体"] },
  { scenario: "a recorded sender name and an unknown recipient", fields: { fromAgentKey: "retired", toAgentKey: "missing", fromAgentName: "旧智能体" }, names: ["旧智能体", "missing"] },
  { scenario: "no usable names", fields: { fromAgentKey: "missing", toAgentKey: "unnamed", fromAgentName: " " }, names: ["missing", "unnamed"] },
])("shows the address names for $scenario in both the list and the detail", async ({ fields, names, detailName }) => {
  const row = { ...mail, ...fields };
  jest.mocked(getMails).mockImplementation(async ({ box }) => response(
    box === "received" ? { mails: [row], total: 1 } : { mails: [], total: 0 },
  ));
  jest.mocked(getMailDetail).mockResolvedValue(response({ ...row, fromAgentName: detailName ?? row.fromAgentName, message: "详情正文" }));

  await act(async () => root.render(<I18nProvider locale="zh-CN" persistLocale={false}><MailboxPanel /></I18nProvider>));
  expect(addressNames(host)).toEqual(names);

  const details = host.querySelector<HTMLButtonElement>(`button[aria-label="${zhCNMessages["mailbox.details"]}"]`)!;
  await act(async () => details.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("详情正文");
  expect(addressNames(dialog)).toEqual(names);
});
