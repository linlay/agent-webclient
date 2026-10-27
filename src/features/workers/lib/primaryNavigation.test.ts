import { selectPrimaryNavigation } from "./primaryNavigation";
import { extractChatsFromAgents } from "./workerDataCoordinator";

it("uses the Platform primary pointer even outside the recent previews and never substitutes a pinned/latest chat", () => {
  const primaryChat = { chatId: "old-primary", lastRunContent: "primary reply", updatedAt: 100 };
  const agents = [
    { key: "a", name: "A", primaryChat, chats: [{ chatId: "latest", pinned: true }] },
    { key: "b", name: "B", chats: [{ chatId: "b-latest", primary: true }] },
  ];
  const rows = selectPrimaryNavigation(agents, [{ chatId: "latest", lastRunContent: "latest reply" }]);
  expect(rows[0].chat).toEqual(primaryChat);
  expect(rows[1].chat).toBeUndefined();
  expect(extractChatsFromAgents(agents)).toContainEqual({ ...primaryChat, agentKey: "a" });
});

it("projects live primary replies, unread state and terminal run state without using a newer secondary chat", () => {
  const agents = [{ key: "a", name: "A", primaryChat: { chatId: "main", updatedAt: 100, lastRunContent: "old", hasActiveRun: true } }];
  const rows = selectPrimaryNavigation(agents, [
    { chatId: "secondary", updatedAt: 300, lastRunContent: "irrelevant" },
    { chatId: "main", updatedAt: 200, lastRunContent: "new", hasActiveRun: false, read: { isRead: false } },
  ]);
  expect(rows[0].chat).toMatchObject({ chatId: "main", lastRunContent: "new", hasActiveRun: false, read: { isRead: false } });
});

it("does not duplicate a primary summary also present in recent previews", () => {
  const chat = { chatId: "main", primary: true };
  expect(extractChatsFromAgents([{ key: "a", name: "A", primaryChat: chat, chats: [chat] }])).toEqual([{ ...chat, agentKey: "a" }]);
});

it("leaves regular preview ordering intact when adding an older primary summary", () => {
  const chats = extractChatsFromAgents([{ key: "a", name: "A", chats: [{ chatId: "latest", updatedAt: 200 }], primaryChat: { chatId: "older-primary", updatedAt: 100 } }]);
  expect(chats.map(chat => chat.chatId)).toEqual(["latest", "older-primary"]);
});
