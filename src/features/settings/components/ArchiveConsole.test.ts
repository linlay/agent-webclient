import {
	buildArchiveBulkCandidates,
	extractArchivePreviewLines,
} from "@/features/settings/components/ArchiveConsole";

describe("buildArchiveBulkCandidates", () => {
	it("selects chats older than the cutoff", () => {
		const nowMs = Date.UTC(2026, 3, 29);
		const candidates = buildArchiveBulkCandidates({
			chats: [
				{
					chatId: "chat_old",
					chatName: "Quarterly review",
					updatedAt: nowMs - 2 * 24 * 60 * 60 * 1000,
					lastRunAt: nowMs - 40 * 24 * 60 * 60 * 1000,
					lastRunContent: "budget",
				},
				{
					chatId: "chat_recent",
					chatName: "Quarterly current",
					updatedAt: nowMs - 100 * 24 * 60 * 60 * 1000,
					lastRunAt: nowMs - 2 * 24 * 60 * 60 * 1000,
				},
				{
					chatId: "chat_other",
					chatName: "Unrelated",
					updatedAt: nowMs - 50 * 24 * 60 * 60 * 1000,
				},
			],
			workerRelatedChats: [],
			workerSelectionKey: "",
			days: 30,
			nowMs,
		});

		expect(candidates.map((item) => item.chatId)).toEqual([
			"chat_old",
			"chat_other",
		]);
	});

	it("uses selected worker related chats when a worker is selected", () => {
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
					lastRunAt: nowMs - 100 * 24 * 60 * 60 * 1000,
					lastRunId: "run_1",
					lastRunContent: "old",
				},
			],
			workerSelectionKey: "agent:a",
			days: 30,
			nowMs,
		});

		expect(candidates.map((item) => item.chatId)).toEqual(["chat_worker"]);
	});

	it("keeps epoch milliseconds unchanged instead of converting small numbers as seconds", () => {
		const candidates = buildArchiveBulkCandidates({
			chats: [
				{
					chatId: "chat_epoch_ms",
					chatName: "Epoch ms",
					updatedAt: 100,
					lastRunContent: "tiny timestamp",
				},
			],
			workerRelatedChats: [],
			workerSelectionKey: "",
			days: 30,
			nowMs: Date.UTC(2026, 3, 29),
		});

		expect(candidates).toHaveLength(1);
		expect(candidates[0].lastRunAt).toBe(100);
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
