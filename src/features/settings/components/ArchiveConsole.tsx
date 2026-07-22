import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Flex, Input, InputNumber, Modal, Popover, Select, Spin } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { Chat, WorkerConversationRow } from "@/app/state/types";
import {
	archiveChats,
	deleteArchive,
	getArchive,
	getArchives,
	restoreArchives,
	searchArchives,
} from "@/shared/data";
import type {
	ArchiveDetailResponse,
	ArchiveSearchResult,
	ArchivedSummaryResponse,
	ChatSummaryResponse,
} from "@/shared/data";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { t } from "@/shared/i18n";
import { readEpochMillis } from "@/shared/utils/platformTime";

const ARCHIVE_PAGE_SIZE = 30;
const BULK_DAY_OPTIONS = [7, 30, 90, 180, 365];
const ARCHIVE_CONSOLE_CLASS_BY_SURFACE = {
	modal:
		"archive-console archive-console-modal tw:grid tw:min-h-[520px] tw:max-h-[min(72vh,720px)] tw:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] tw:gap-4",
	page:
		"archive-console archive-console-page tw:grid tw:h-full tw:min-h-0 tw:max-h-none tw:grid-cols-[280px_minmax(0,1fr)] tw:gap-4 tw:[&_.archive-detail-content]:max-h-none tw:[&_.archive-list]:max-h-none",
} as const;
const ARCHIVE_LIST_PANE_CLASS_NAME =
	"archive-modal-list-pane tw:flex tw:min-h-0 tw:flex-col tw:gap-3";
const ARCHIVE_DETAIL_PANE_CLASS_NAME =
	"archive-detail-pane tw:flex tw:min-h-0 tw:flex-col tw:gap-3 tw:border-l tw:pl-4 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)]";
const ARCHIVE_TOOLBAR_CLASS_NAME =
	"archive-toolbar tw:grid tw:grid-cols-[minmax(0,1fr)_auto_auto] tw:items-center tw:gap-2 tw:[&_.ant-input-affix-wrapper]:min-w-0 tw:[&_.ant-input-prefix]:mr-1.5 tw:[&_.ant-input-prefix]:text-ink-muted";
const ARCHIVE_AGENT_FILTER_INPUT_CLASS_NAME =
	"archive-agent-filter-input tw:w-40 tw:flex-none";
const ARCHIVE_BULK_PANEL_CLASS_NAME =
	"archive-bulk-panel tw:min-w-80 tw:py-1";
const ARCHIVE_BULK_LABEL_CLASS_NAME =
	"archive-bulk-label tw:text-xs tw:text-ink-muted";
const ARCHIVE_BULK_TRIGGER_CLASS_NAME =
	"archive-bulk-trigger tw:relative tw:flex tw:h-8 tw:flex-none tw:items-center tw:gap-1 tw:rounded-control tw:border tw:px-2 tw:py-1 tw:text-lg tw:text-text-muted tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))] tw:hover:bg-[color-mix(in_srgb,var(--bg-hover)_60%,transparent)] tw:hover:text-ink-1";
const ARCHIVE_BULK_BADGE_CLASS_NAME =
	"archive-bulk-badge tw:absolute tw:-right-1.5 tw:-top-1 tw:flex tw:h-4 tw:min-w-4 tw:items-center tw:justify-center tw:rounded-pill tw:bg-accent-electric tw:px-1 tw:text-[10px] tw:font-bold tw:leading-none tw:text-white";
const ARCHIVE_RESULT_BAR_CLASS_NAME =
	"archive-result-bar tw:flex tw:items-center tw:gap-3 tw:text-xs tw:text-ink-muted";
const ARCHIVE_LIST_CLASS_NAME =
	"archive-list tw:flex tw:min-h-0 tw:max-h-[430px] tw:flex-col tw:gap-1 tw:overflow-auto tw:pr-1";
const ARCHIVE_LIST_ITEM_CLASS_NAME =
	"archive-list-item tw:w-full tw:rounded-[10px] tw:border-0 tw:bg-transparent tw:px-3 tw:py-[11px] tw:text-left tw:text-ink-1 tw:hover:bg-bg-base tw:[&.is-active]:bg-bg-base";
const ARCHIVE_LIST_ITEM_HEAD_CLASS_NAME =
	"archive-list-item-head tw:flex tw:items-center tw:justify-between tw:gap-2.5 tw:[&>span]:flex-none tw:[&>span]:text-[11px] tw:[&>span]:text-ink-muted tw:[&>strong]:min-w-0 tw:[&>strong]:overflow-hidden tw:[&>strong]:text-ellipsis tw:[&>strong]:whitespace-nowrap tw:[&>strong]:text-[13px]";
const ARCHIVE_LIST_META_CLASS_NAME =
	"archive-list-meta tw:mt-2 tw:flex tw:flex-wrap tw:gap-x-1.5 tw:gap-y-1.5";
const ARCHIVE_LIST_META_ITEM_CLASS_NAME =
	"archive-list-meta-item tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted";
const ARCHIVE_DETAIL_HEAD_CLASS_NAME =
	"archive-detail-head tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&_h3]:m-0 tw:[&_h3]:text-base tw:[&_p]:mb-0 tw:[&_p]:mt-1 tw:[&_p]:text-xs tw:[&_p]:text-ink-muted";
const ARCHIVE_DETAIL_CONTENT_CLASS_NAME =
	"archive-detail-content tw:flex tw:min-h-0 tw:max-h-[520px] tw:flex-col tw:gap-2.5 tw:overflow-auto tw:pr-1";
const ARCHIVE_PREVIEW_LINE_CLASS_NAME =
	"archive-preview-line tw:rounded-[10px] tw:border tw:p-2.5 tw:px-3 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_62%,var(--bg-elev-2))]";
const ARCHIVE_PREVIEW_LABEL_CLASS_NAME =
	"archive-preview-label tw:mb-1.5 tw:font-code tw:text-[11px] tw:font-semibold tw:leading-[1.2] tw:text-ink-muted";
const ARCHIVE_PREVIEW_TEXT_CLASS_NAME =
	"archive-preview-text tw:whitespace-pre-wrap tw:break-words tw:text-[13px] tw:leading-[1.55] tw:text-ink-1";

function toTimestamp(value: unknown): number {
	return readEpochMillis(value) ?? 0;
}

function archiveLastRunAt(item: unknown): number {
	if (!item || typeof item !== "object") return 0;
	const record = item as Partial<ArchivedSummaryResponse>;
	const lastRunAt = toTimestamp(record.lastRunAt);
	return lastRunAt || toTimestamp(record.updatedAt);
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
	item: ArchivedSummaryResponse | ArchiveSearchResult | WorkerConversationRow | Chat,
): ArchivedSummaryResponse {
	return {
		chatId: String(item.chatId || ""),
		chatName: String(item.chatName || item.chatId || ""),
		agentKey: typeof item.agentKey === "string" ? item.agentKey : undefined,
		teamId: typeof item.teamId === "string" ? item.teamId : undefined,
		createdAt: toTimestamp((item as Partial<ArchivedSummaryResponse>).createdAt),
		updatedAt: toTimestamp((item as Partial<ArchivedSummaryResponse>).updatedAt),
		lastRunAt: archiveLastRunAt(item),
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
			const lastRunAt = toTimestamp(item.lastRunAt);
			if (!lastRunAt || lastRunAt >= cutoff) return false;
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

function normalizeRestoredChat(
	summary: ChatSummaryResponse | undefined,
	fallback: ArchivedSummaryResponse | undefined,
): Partial<Chat> & Pick<Chat, "chatId"> {
	return {
		...(fallback || {}),
		...(summary || {}),
		chatId: String(summary?.chatId || fallback?.chatId || ""),
		chatName: String(summary?.chatName || fallback?.chatName || fallback?.chatId || ""),
		agentKey: summary?.agentKey || fallback?.agentKey,
		teamId: summary?.teamId || fallback?.teamId,
		updatedAt: toTimestamp(summary?.updatedAt ?? fallback?.lastRunAt ?? fallback?.updatedAt),
		createdAt: toTimestamp(summary?.createdAt ?? fallback?.createdAt),
		lastRunId: String(summary?.lastRunId || fallback?.lastRunId || ""),
		lastRunContent: String(summary?.lastRunContent || fallback?.lastRunContent || ""),
	} as Partial<Chat> & Pick<Chat, "chatId">;
}

function formatUsageSummary(item: ArchivedSummaryResponse | undefined): string {
	const usage = item?.usage;
	if (!usage) return "";
	const totalTokens = Number(usage.totalTokens || 0);
	const calls = Number(usage.llmChatCompletionCount || 0);
	const toolCalls = Number(usage.toolCallCount || 0);
	const parts: string[] = [];
	if (totalTokens > 0) parts.push(`${totalTokens} tokens`);
	if (calls > 0) parts.push(`${calls} LLM`);
	if (toolCalls > 0) parts.push(`${toolCalls} tools`);
	const cost = usage.estimatedCost?.total;
	const currency = usage.estimatedCost?.currency;
	if (typeof cost === "number" && cost > 0) {
		parts.push(`${currency || ""}${cost.toFixed(4)}`.trim());
	}
	return parts.join(" · ");
}

export interface ArchiveConsoleProps {
	active?: boolean;
	surface?: "modal" | "page";
	selectedChatId?: string;
	onSelectedChatIdChange?: (chatId: string) => void;
	onOpenRestoredChat?: (summary: ChatSummaryResponse) => void;
	showAgentFilter?: boolean;
}

export const ArchiveConsole: React.FC<ArchiveConsoleProps> = ({
	active = true,
	surface = "modal",
	selectedChatId,
	onSelectedChatIdChange,
	onOpenRestoredChat,
	showAgentFilter = false,
}) => {
	const { state, dispatch } = useAppContext();
	const [query, setQuery] = useState("");
	const [agentFilter, setAgentFilter] = useState("");
	const [items, setItems] = useState<ArchivedSummaryResponse[]>([]);
	const [total, setTotal] = useState(0);
	const [offset, setOffset] = useState(0);
	const [loadingList, setLoadingList] = useState(false);
	const [internalSelectedChatId, setInternalSelectedChatId] = useState("");
	const [detail, setDetail] = useState<ArchiveDetailResponse | null>(null);
	const [loadingDetail, setLoadingDetail] = useState(false);
	const [bulkDays, setBulkDays] = useState(30);
	const [bulkResult, setBulkResult] = useState("");
	const [actionResult, setActionResult] = useState("");

	const selected = selectedChatId !== undefined ? selectedChatId : internalSelectedChatId;
	const currentWorker = state.workerIndexByKey.get(state.workerSelectionKey);
	const scopedAgentKey =
		currentWorker?.type === "agent" ? String(currentWorker.sourceId || "") : "";
	const archiveAgentKey = showAgentFilter ? agentFilter : scopedAgentKey;

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

	const updateSelected = useCallback(
		(chatId: string) => {
			if (onSelectedChatIdChange) {
				onSelectedChatIdChange(chatId);
				return;
			}
			setInternalSelectedChatId(chatId);
		},
		[onSelectedChatIdChange],
	);

	const loadArchives = useCallback(
		async (nextOffset = 0, append = false) => {
			if (!active) return;
			setLoadingList(true);
			try {
				const trimmedQuery = query.trim();
				if (trimmedQuery) {
					const response = await searchArchives({
						query: trimmedQuery,
						agentKey: archiveAgentKey || undefined,
						limit: ARCHIVE_PAGE_SIZE,
					});
					const results = (response.data?.results || []).map((item) =>
						asArchiveSummary({
							...item,
							updatedAt: item.updatedAt ?? item.lastRunAt,
							lastRunContent: item.lastRunContent || item.snippet,
							hasAttachments: false,
						}),
					);
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
		[active, archiveAgentKey, dispatch, query],
	);

	const loadArchiveDetail = useCallback(
		async (chatId: string, updateSelection = true) => {
			const normalizedChatId = String(chatId || "").trim();
			if (!normalizedChatId) return;
			if (updateSelection) {
				updateSelected(normalizedChatId);
			}
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
		[dispatch, updateSelected],
	);

	useEffect(() => {
		if (!active) return;
		const timer = window.setTimeout(() => {
			void loadArchives(0, false);
		}, 180);
		return () => window.clearTimeout(timer);
	}, [active, loadArchives]);

	useEffect(() => {
		if (!active) return;
		const normalizedSelected = String(selected || "").trim();
		if (!normalizedSelected) {
			setDetail(null);
			return;
		}
		void loadArchiveDetail(normalizedSelected, false);
	}, [active, loadArchiveDetail, selected]);

	const removeArchiveItem = useCallback(
		(chatId: string) => {
			setItems((current) => current.filter((item) => item.chatId !== chatId));
			setTotal((current) => Math.max(0, current - 1));
			if (selected === chatId) {
				updateSelected("");
				setDetail(null);
			}
		},
		[selected, updateSelected],
	);

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
				removeArchiveItem(normalizedChatId);
			},
		});
	};

	const handleRestoreArchive = (chatId: string, openAfterRestore = false) => {
		const normalizedChatId = String(chatId || "").trim();
		if (!normalizedChatId) return;
		const selectedItem = items.find((item) => item.chatId === normalizedChatId);
		Modal.confirm({
			title: t("archive.restoreConfirm.title"),
			content: selectedItem?.chatName || normalizedChatId,
			okText: openAfterRestore
				? t("archive.action.restoreAndOpen")
				: t("archive.action.restore"),
			cancelText: t("archive.action.cancel"),
			onOk: async () => {
				const response = await restoreArchives({ chatIds: [normalizedChatId] });
				const result = response.data?.results?.[0];
				if (!result?.success) {
					throw new Error(result?.error || t("archive.restore.failed"));
				}
				const restored = normalizeRestoredChat(result.summary, selectedItem);
				if (restored.chatId) {
					dispatch({ type: "UPSERT_CHAT", chat: restored });
				}
				window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
				removeArchiveItem(normalizedChatId);
				setActionResult(t("archive.restore.result"));
				if (openAfterRestore && result.summary) {
					onOpenRestoredChat?.(result.summary);
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
	const selectedItem = items.find((item) => item.chatId === selected);
	const canLoadMore = !query.trim() && items.length < total;
	const usageSummary = formatUsageSummary(selectedItem);

	return (
		<div className={ARCHIVE_CONSOLE_CLASS_BY_SURFACE[surface]}>
			<section className={ARCHIVE_LIST_PANE_CLASS_NAME}>
				<div className={ARCHIVE_TOOLBAR_CLASS_NAME}>
					<Input
						prefix={<MaterialIcon name="search" />}
						value={query}
						placeholder={t("archive.search.placeholder")}
						onChange={(event) => setQuery(event.target.value)}
					/>
					{showAgentFilter ? (
						<Input
							prefix={<MaterialIcon name="person_search" />}
							value={agentFilter}
							placeholder={t("archive.filter.agentPlaceholder")}
							onChange={(event) => setAgentFilter(event.target.value)}
							allowClear
							className={ARCHIVE_AGENT_FILTER_INPUT_CLASS_NAME}
						/>
					) : null}
					<Popover
						trigger="click"
						placement="bottomRight"
						content={
							<div className={ARCHIVE_BULK_PANEL_CLASS_NAME}>
								<Flex gap={8} align="center" wrap="wrap">
									<span className={ARCHIVE_BULK_LABEL_CLASS_NAME}>{t("archive.bulk.label")}</span>
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
							</div>
						}
					>
						<button type="button" className={ARCHIVE_BULK_TRIGGER_CLASS_NAME}>
							<MaterialIcon name="archive" />
							{bulkCandidates.length > 0 ? (
								<span className={ARCHIVE_BULK_BADGE_CLASS_NAME}>{bulkCandidates.length}</span>
							) : null}
						</button>
					</Popover>
				</div>
				{bulkResult || actionResult ? (
					<div className={ARCHIVE_RESULT_BAR_CLASS_NAME}>
						{bulkResult ? <span>{bulkResult}</span> : null}
						{actionResult ? <span>{actionResult}</span> : null}
					</div>
				) : null}
				<Spin spinning={loadingList}>
					<div className={ARCHIVE_LIST_CLASS_NAME} role="listbox" aria-label={t("archive.list.ariaLabel")}>
						{items.length === 0 ? (
							<div className="command-empty-state">{t("archive.empty.list")}</div>
						) : (
							items.map((item) => (
								<button
									key={item.chatId}
									type="button"
									className={`${ARCHIVE_LIST_ITEM_CLASS_NAME} ${item.chatId === selected ? "is-active" : ""}`}
									onClick={() => void loadArchiveDetail(item.chatId)}
								>
									<span className={ARCHIVE_LIST_ITEM_HEAD_CLASS_NAME}>
										<strong>{item.chatName || item.chatId}</strong>
									</span>
									<span className={ARCHIVE_LIST_META_CLASS_NAME}>
										{item.agentKey && <span className={ARCHIVE_LIST_META_ITEM_CLASS_NAME}>{item.agentKey}</span>}
										<span className={ARCHIVE_LIST_META_ITEM_CLASS_NAME}>{t("archive.item.created")}: {formatChatTimeLabel(item.createdAt)}</span>
										<span className={ARCHIVE_LIST_META_ITEM_CLASS_NAME}>{t("archive.item.lastRun")}: {formatChatTimeLabel(item.lastRunAt)}</span>
										<span className={ARCHIVE_LIST_META_ITEM_CLASS_NAME}>{t("archive.detail.archivedAt", { time: formatChatTimeLabel(item.archivedAt) })}</span>
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
			<section className={ARCHIVE_DETAIL_PANE_CLASS_NAME}>
				{!selected ? (
					<div className="command-empty-state">{t("archive.empty.select")}</div>
				) : (
					<Spin spinning={loadingDetail}>
						<div className={ARCHIVE_DETAIL_HEAD_CLASS_NAME}>
							<div>
								<h3>{detail?.chatName || selectedItem?.chatName || selected}</h3>
								<p>
									{t("archive.detail.archivedAt", {
										time: formatChatTimeLabel(selectedItem?.archivedAt),
									})}
									{selectedItem?.agentKey ? ` · ${selectedItem.agentKey}` : ""}
									{usageSummary ? ` · ${usageSummary}` : ""}
								</p>
							</div>
							<Flex gap={8} wrap="wrap" justify="flex-end">
								<UiButton
									size="sm"
									variant="ghost"
									onClick={() => handleRestoreArchive(selected, false)}
								>
									<MaterialIcon name="unarchive" />
									{t("archive.action.restore")}
								</UiButton>
								{onOpenRestoredChat ? (
									<UiButton
										size="sm"
										variant="primary"
										onClick={() => handleRestoreArchive(selected, true)}
									>
										<MaterialIcon name="open_in_new" />
										{t("archive.action.restoreAndOpen")}
									</UiButton>
								) : null}
								<UiButton
									size="sm"
									variant="ghost"
									onClick={() => handleDeleteArchive(selected)}
								>
									<MaterialIcon name="delete" />
									{t("archive.action.delete")}
								</UiButton>
							</Flex>
						</div>
						<div className={ARCHIVE_DETAIL_CONTENT_CLASS_NAME}>
							{previewLines.length === 0 ? (
								<div className="command-empty-state">{t("archive.empty.detail")}</div>
							) : (
								previewLines.map((line) => (
									<div className={ARCHIVE_PREVIEW_LINE_CLASS_NAME} key={line.key}>
										<div className={ARCHIVE_PREVIEW_LABEL_CLASS_NAME}>{line.label}</div>
										<div className={ARCHIVE_PREVIEW_TEXT_CLASS_NAME}>{line.text}</div>
									</div>
								))
							)}
						</div>
					</Spin>
				)}
			</section>
		</div>
	);
};
