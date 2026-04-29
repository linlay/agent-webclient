import {
	buildArchiveBulkCandidates,
	extractArchivePreviewLines,
} from "@/features/settings/components/ArchiveModal";

describe("buildArchiveBulkCandidates", () => {
	it("selects old chats from the current chat filter scope", () => {
		const nowMs = Date.UTC(2026, 3, 29);
		const candidates = buildArchiveBulkCandidates({
			chats: [
				{
					chatId: "chat_old",
					chatName: "Quarterly review",
					updatedAt: nowMs - 40 * 24 * 60 * 60 * 1000,
					lastRunContent: "budget",
				},
				{
					chatId: "chat_recent",
					chatName: "Quarterly current",
					updatedAt: nowMs - 2 * 24 * 60 * 60 * 1000,
				},
				{
					chatId: "chat_other",
					chatName: "Unrelated",
					updatedAt: nowMs - 50 * 24 * 60 * 60 * 1000,
				},
			],
			workerRelatedChats: [],
			conversationMode: "chat",
			workerSelectionKey: "",
			chatFilter: "quarterly",
			days: 30,
			nowMs,
		});

		expect(candidates.map((item) => item.chatId)).toEqual(["chat_old"]);
	});

	it("uses selected worker related chats in worker mode", () => {
		const nowMs = Date.UTC(2026, 3, 29);
		const candidates = buildArchiveBulkCandidates({
			chats: [
				{
					chatId: "chat_all",
					updatedAt: nowMs - 100 * 24 * 60 * 60 * 1000,
				},
			],
			workerRelatedChats: [
				{
					chatId: "chat_worker",
					chatName: "Worker chat",
					updatedAt: nowMs - 100 * 24 * 60 * 60 * 1000,
					lastRunId: "run_1",
					lastRunContent: "old",
				},
			],
			conversationMode: "worker",
			workerSelectionKey: "agent:a",
			chatFilter: "",
			days: 30,
			nowMs,
		});

		expect(candidates.map((item) => item.chatId)).toEqual(["chat_worker"]);
	});
});

describe("extractArchivePreviewLines", () => {
	it("builds readable lines from archived event payloads", () => {
		const lines = extractArchivePreviewLines({
			chatId: "chat_1",
			events: [
				{ type: "request.query", message: "hello" },
				{ type: "response.output", content: "world" },
			],
		});

		expect(lines).toEqual([
			{ key: "0-request.query", label: "request.query", text: "hello" },
			{ key: "1-response.output", label: "response.output", text: "world" },
		]);
	});
});
