import { buildMailChatLabels } from "./useMailChatLabels";
it("numbers work chats by creation order, excluding primary and unknown chats", () => {
  expect(buildMailChatLabels([
    { chatId: "later", primary: false, createdAt: 20 },
    { chatId: "main", primary: true, createdAt: 1 },
    { chatId: "unknown", createdAt: 2 },
    { chatId: "first", primary: false, createdAt: 10 },
  ])).toEqual({ main: "Primary", first: "Work #1", later: "Work #2" });
});
