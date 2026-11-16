import type { ArchivedSummaryResponse } from "@/shared/data";
import {
  buildArchiveBulkCandidates,
  formatArchiveTimestamp,
  groupArchivesByAgent,
} from "@/features/archive/lib/archiveViewModel";

const summary = (
	chatId: string,
	agentKey?: string,
): ArchivedSummaryResponse => ({
	chatId,
	chatName: chatId,
	agentKey,
	createdAt: 0,
	updatedAt: 0,
	lastRunAt: 0,
	archivedAt: 0,
});

describe("groupArchivesByAgent", () => {
	it("groups chats by agent and reports each group size", () => {
		const groups = groupArchivesByAgent([
			summary("a1", "agent_a"),
			summary("b1", "agent_b"),
			summary("a2", "agent_a"),
		]);

		expect(groups.map((group) => group.key)).toEqual(["agent_a", "agent_b"]);
		expect(groups.map((group) => group.count)).toEqual([2, 1]);
		expect(groups[0].items.map((item) => item.chatId)).toEqual(["a1", "a2"]);
	});

	it("normalizes missing agent keys and keeps the unassigned group last", () => {
		const groups = groupArchivesByAgent([
			summary("none_1"),
			summary("agent_1", "agent_a"),
			summary("none_2", "  "),
		]);

		expect(groups.map((group) => group.key)).toEqual(["agent_a", ""]);
		expect(groups[1].count).toBe(2);
	});

	it("returns no groups for an empty list", () => {
		expect(groupArchivesByAgent([])).toEqual([]);
	});
});

describe("formatArchiveTimestamp", () => {
	it("keeps both the date and the local clock time", () => {
		expect(formatArchiveTimestamp(new Date(2026, 8, 10, 16, 5).getTime())).toBe(
			"2026-09-10 16:05",
		);
	});

	it("falls back to a placeholder for missing timestamps", () => {
		expect(formatArchiveTimestamp(0)).toBe("--");
		expect(formatArchiveTimestamp(undefined)).toBe("--");
	});
});

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
