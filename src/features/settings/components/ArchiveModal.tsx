import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Flex, Input, InputNumber, Modal, Select, Spin } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { Chat, WorkerConversationRow } from "@/app/state/types";
import {
	archiveChats,
	deleteArchive,
	getArchive,
	getArchives,
	searchArchives,
} from "@/features/transport/lib/apiClientProxy";
import type {
	ArchiveDetailResponse,
	ArchivedSummaryResponse,
} from "@/shared/api/apiClient";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { t } from "@/shared/i18n";

const ARCHIVE_PAGE_SIZE = 30;
const BULK_DAY_OPTIONS = [7, 30, 90, 180, 365];

function toTimestamp(value: unknown): number {
	if (value instanceof Date) return value.getTime();
	if (typeof value === "number") {
		return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
	}
	const parsed = new Date(String(value || "")).getTime();
	return Number.isFinite(parsed) ? parsed : 0;
}

function toPreviewText(value: unknown): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		for (const key of [
			"text",
			"content",
			"message",
			"delta",
			"assistantText",
			"initialMessage",
		]) {
			const nested = toPreviewText(record[key]);
			if (nested) return nested;
		}
	}
	return "";
}

function asArchiveSummary(
	item: ArchivedSummaryResponse | WorkerConversationRow | Chat,
): ArchivedSummaryResponse {
	return {
		chatId: String(item.chatId || ""),
		chatName: String(item.chatName || item.chatId || ""),
		agentKey: typeof item.agentKey === "string" ? item.agentKey : undefined,
		teamId: typeof item.teamId === "string" ? item.teamId : undefined,
		createdAt: toTimestamp((item as Partial<ArchivedSummaryResponse>).createdAt),
		updatedAt: toTimestamp(item.updatedAt),
		archivedAt: toTimestamp((item as Partial<ArchivedSummaryResponse>).archivedAt),
		lastRunId: String(item.lastRunId || ""),
		lastRunContent: String(item.lastRunContent || ""),
		hasAttachments: Boolean(
			(item as Partial<ArchivedSummaryResponse>).hasAttachments,
		),
	};
}

export function buildArchiveBulkCandidates(input: {
	chats: Chat[];
	workerRelatedChats: WorkerConversationRow[];
	conversationMode: string;
	workerSelectionKey: string;
	chatFilter: string;
	days: number;
	nowMs?: number;
}): ArchivedSummaryResponse[] {
	const days = Math.max(1, Math.floor(Number(input.days) || 0));
	const cutoff = (input.nowMs ?? Date.now()) - days * 24 * 60 * 60 * 1000;
	const filter = String(input.chatFilter || "").trim().toLowerCase();
	const rows =
		input.conversationMode === "worker" && input.workerSelectionKey
			? input.workerRelatedChats
			: input.chats;

	return rows
		.map(asArchiveSummary)
		.filter((item) => {
			if (!item.chatId) return false;
			const updatedAt = toTimestamp(item.updatedAt);
			if (!updatedAt || updatedAt >= cutoff) return false;
			if (!filter || input.conversationMode === "worker") return true;
			const haystack = [
				item.chatId,
				item.chatName,
				item.agentKey,
				item.teamId,
				item.lastRunContent,
			]
				.join(" ")
				.toLowerCase();
			return haystack.includes(filter);
		});
}

export function extractArchivePreviewLines(
	detail: ArchiveDetailResponse | null,
): Array<{ key: string; label: string; text: string }> {
	if (!detail) return [];
	const lines: Array<{ key: string; label: string; text: string }> = [];
	const events = Array.isArray(detail.events) ? detail.events : [];
	for (const event of events) {
		if (!event || typeof event !== "object") continue;
		const record = event as Record<string, unknown>;
		const type = String(record.type || "event");
		const text = toPreviewText(record);
		lines.push({
			key: `${lines.length}-${type}`,
			label: type,
			text: text || "(no text)",
		});
		if (lines.length >= 40) break;
	}
	if (lines.length > 0) return lines;

	const runs = Array.isArray(detail.runs) ? detail.runs : [];
	for (const run of runs) {
		if (!run || typeof run !== "object") continue;
		const record = run as Record<string, unknown>;
		const initial = toPreviewText(record.initialMessage);
		const assistant = toPreviewText(record.assistantText);
		if (initial) {
			lines.push({
				key: `${lines.length}-user`,
				label: "user",
				text: initial,
			});
		}
		if (assistant) {
			lines.push({
				key: `${lines.length}-assistant`,
				label: "assistant",
				text: assistant,
			});
		}
	}
	return lines;
}

export const ArchiveModal: React.FC = () => {
	const { state, dispatch } = useAppContext();
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<ArchivedSummaryResponse[]>([]);
	const [total, setTotal] = useState(0);
	const [offset, setOffset] = useState(0);
	const [loadingList, setLoadingList] = useState(false);
	const [selectedChatId, setSelectedChatId] = useState("");
	const [detail, setDetail] = useState<ArchiveDetailResponse | null>(null);
	const [loadingDetail, setLoadingDetail] = useState(false);
	const [bulkDays, setBulkDays] = useState(30);
	const [bulkResult, setBulkResult] = useState("");

	const currentWorker = state.workerIndexByKey.get(state.workerSelectionKey);
	const archiveAgentKey =
		currentWorker?.type === "agent" ? String(currentWorker.sourceId || "") : "";

	const bulkCandidates = useMemo(
		() =>
			buildArchiveBulkCandidates({
				chats: state.chats,
				workerRelatedChats: state.workerRelatedChats,
				conversationMode: state.conversationMode,
				workerSelectionKey: state.workerSelectionKey,
				chatFilter: state.chatFilter,
				days: bulkDays,
			}),
		[
			bulkDays,
			state.chatFilter,
			state.chats,
			state.conversationMode,
			state.workerRelatedChats,
			state.workerSelectionKey,
		],
	);

	const close = () => {
		dispatch({ type: "SET_ARCHIVE_OPEN", open: false });
	};

	const loadArchives = useCallback(
		async (nextOffset = 0, append = false) => {
			if (!state.archiveOpen) return;
			setLoadingList(true);
			try {
				const trimmedQuery = query.trim();
				if (trimmedQuery) {
					const response = await searchArchives({
						query: trimmedQuery,
						agentKey: archiveAgentKey || undefined,
						limit: ARCHIVE_PAGE_SIZE,
					});
					const results = (response.data?.results || []).map((item) => ({
						...item,
						createdAt: 0,
						updatedAt: 0,
						hasAttachments: false,
					}));
					setItems(results);
					setTotal(response.data?.count || results.length);
					setOffset(results.length);
					return;
				}
				const response = await getArchives({
					agentKey: archiveAgentKey || undefined,
					limit: ARCHIVE_PAGE_SIZE,
					offset: nextOffset,
				});
				const nextItems = response.data?.items || [];
				setItems((current) => (append ? [...current, ...nextItems] : nextItems));
				setTotal(response.data?.total || nextItems.length);
				setOffset(nextOffset + nextItems.length);
			} catch (error) {
				dispatch({
					type: "APPEND_DEBUG",
					line: `[archive list error] ${(error as Error).message}`,
				});
				if (!append) setItems([]);
			} finally {
				setLoadingList(false);
			}
		},
		[archiveAgentKey, dispatch, query, state.archiveOpen],
	);

	const loadArchiveDetail = useCallback(
		async (chatId: string) => {
			const normalizedChatId = String(chatId || "").trim();
			if (!normalizedChatId) return;
			setSelectedChatId(normalizedChatId);
			setLoadingDetail(true);
			try {
				const response = await getArchive(normalizedChatId, false);
				setDetail(response.data || null);
			} catch (error) {
				dispatch({
					type: "APPEND_DEBUG",
					line: `[archive detail error] ${(error as Error).message}`,
				});
				setDetail(null);
			} finally {
				setLoadingDetail(false);
			}
		},
		[dispatch],
	);

	useEffect(() => {
		if (!state.archiveOpen) return;
		const timer = window.setTimeout(() => {
			setSelectedChatId("");
			setDetail(null);
			void loadArchives(0, false);
		}, 180);
		return () => window.clearTimeout(timer);
	}, [loadArchives, query, state.archiveOpen]);

	const handleDeleteArchive = (chatId: string) => {
		const normalizedChatId = String(chatId || "").trim();
		if (!normalizedChatId) return;
		Modal.confirm({
			title: t("archive.deleteConfirm.title"),
			content: normalizedChatId,
			okText: t("archive.action.delete"),
			okButtonProps: { danger: true },
			cancelText: t("archive.action.cancel"),
			onOk: async () => {
				await deleteArchive({ chatId: normalizedChatId });
				setItems((current) =>
					current.filter((item) => item.chatId !== normalizedChatId),
				);
				setTotal((current) => Math.max(0, current - 1));
				if (selectedChatId === normalizedChatId) {
					setSelectedChatId("");
					setDetail(null);
				}
			},
		});
	};

	const handleBulkArchive = () => {
		if (bulkCandidates.length === 0) return;
		Modal.confirm({
			title: t("archive.bulk.confirmTitle"),
			content: t("archive.bulk.confirmContent", {
				count: bulkCandidates.length,
				days: bulkDays,
			}),
			okText: t("archive.action.archive"),
			cancelText: t("archive.action.cancel"),
			onOk: async () => {
				const response = await archiveChats({
					chatIds: bulkCandidates.map((item) => item.chatId),
				});
				const results = response.data?.results || [];
				const succeeded = results
					.filter((result) => result.success)
					.map((result) => result.chatId);
				for (const chatId of succeeded) {
					dispatch({ type: "CHAT_ARCHIVED", chatId });
				}
				const failed = results.length - succeeded.length;
				setBulkResult(
					failed > 0
						? t("archive.bulk.resultWithFailures", {
								success: succeeded.length,
								failed,
							})
						: t("archive.bulk.result", { success: succeeded.length }),
				);
				void loadArchives(0, false);
			},
		});
	};

	const previewLines = extractArchivePreviewLines(detail);
	const selectedItem = items.find((item) => item.chatId === selectedChatId);
	const canLoadMore = !query.trim() && items.length < total;

	return (
		<Modal
			open={state.archiveOpen}
			onCancel={close}
			footer={null}
			destroyOnHidden
			width="min(1080px, calc(100vw - 32px))"
			className="archive-modal"
			title={t("archive.title")}
		>
			<div className="archive-modal-layout">
				<section className="archive-modal-list-pane">
					<div className="archive-toolbar">
						<Input
							prefix={<MaterialIcon name="search" />}
							value={query}
							placeholder={t("archive.search.placeholder")}
							onChange={(event) => setQuery(event.target.value)}
						/>
					</div>
					<div className="archive-bulk-panel">
						<Flex gap={8} align="center" wrap="wrap">
							<span className="archive-bulk-label">{t("archive.bulk.label")}</span>
							<Select
								value={bulkDays}
								style={{ width: 116 }}
								options={BULK_DAY_OPTIONS.map((days) => ({
									value: days,
									label: t("archive.bulk.days", { days }),
								}))}
								onChange={setBulkDays}
							/>
							<InputNumber
								min={1}
								max={3650}
								value={bulkDays}
								onChange={(value) => setBulkDays(Number(value) || 30)}
								addonAfter={t("archive.bulk.dayUnit")}
								style={{ width: 132 }}
							/>
							<UiButton
								size="sm"
								variant="primary"
								disabled={bulkCandidates.length === 0}
								onClick={handleBulkArchive}
							>
								{t("archive.bulk.button", { count: bulkCandidates.length })}
							</UiButton>
						</Flex>
						{bulkResult ? (
							<div className="archive-bulk-result">{bulkResult}</div>
						) : null}
					</div>
					<Spin spinning={loadingList}>
						<div className="archive-list" role="listbox" aria-label={t("archive.list.ariaLabel")}>
							{items.length === 0 ? (
								<div className="command-empty-state">{t("archive.empty.list")}</div>
							) : (
								items.map((item) => (
									<button
										key={item.chatId}
										type="button"
										className={`archive-list-item ${item.chatId === selectedChatId ? "is-active" : ""}`}
										onClick={() => void loadArchiveDetail(item.chatId)}
									>
										<span className="archive-list-item-head">
											<strong>{item.chatName || item.chatId}</strong>
											<span>{formatChatTimeLabel(item.archivedAt)}</span>
										</span>
										<span className="archive-list-preview">
											{item.snippet || item.lastRunContent || t("archive.empty.preview")}
										</span>
										<span className="archive-list-meta">
											{item.agentKey ? <UiTag tone="muted">{item.agentKey}</UiTag> : null}
											{item.teamId ? <UiTag tone="muted">{item.teamId}</UiTag> : null}
											{item.hasAttachments ? <UiTag tone="accent">{t("archive.tag.attachments")}</UiTag> : null}
										</span>
									</button>
								))
							)}
						</div>
					</Spin>
					{canLoadMore ? (
						<Button block onClick={() => void loadArchives(offset, true)}>
							{t("archive.action.loadMore")}
						</Button>
					) : null}
				</section>
				<section className="archive-detail-pane">
					{!selectedChatId ? (
						<div className="command-empty-state">{t("archive.empty.select")}</div>
					) : (
						<Spin spinning={loadingDetail}>
							<div className="archive-detail-head">
								<div>
									<h3>{detail?.chatName || selectedItem?.chatName || selectedChatId}</h3>
									<p>
										{t("archive.detail.archivedAt", {
											time: formatChatTimeLabel(selectedItem?.archivedAt),
										})}
										{selectedItem?.agentKey ? ` · ${selectedItem.agentKey}` : ""}
									</p>
								</div>
								<UiButton
									size="sm"
									variant="ghost"
									onClick={() => handleDeleteArchive(selectedChatId)}
								>
									<MaterialIcon name="delete" />
									{t("archive.action.delete")}
								</UiButton>
							</div>
							<div className="archive-detail-content">
								{previewLines.length === 0 ? (
									<div className="command-empty-state">{t("archive.empty.detail")}</div>
								) : (
									previewLines.map((line) => (
										<div className="archive-preview-line" key={line.key}>
											<div className="archive-preview-label">{line.label}</div>
											<div className="archive-preview-text">{line.text}</div>
										</div>
									))
								)}
							</div>
						</Spin>
					)}
				</section>
			</div>
		</Modal>
	);
};
