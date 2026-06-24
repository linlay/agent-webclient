import React, {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Popover } from "antd";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import type { AgentEvent } from "@/app/state/types";
import {
	getChatLLMTraceRaw,
	getChatRawJsonl,
} from "@/features/transport/lib/apiClientProxy";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import {
	buildCopyMenuTitle,
	buildDefaultCopyMenuItem,
	buildEventCopyMenuItems,
	copyText,
	getPrimaryCopyMenuItem,
	stripCopyPrefix,
	type CopyFeedbackState,
	type CopyMenuItemState,
	type EventCopyMenuItem,
} from "@/app/modals/lib/eventPopoverCopyMenu";
import {
	buildCollectedSnapshot,
	canCollectEvent,
	getCollectibleRelatedEvents,
	mapCollectedSnapshotType,
	readEventIdValue,
	resolveEventGroupMeta,
	type RelatedEventEntry,
} from "@/app/modals/lib/eventPopoverGrouping";
import {
	formatReadableTimestamp,
	resolveDisplayPayloadTimestamp,
	resolveInitialPopoverState,
	stringifyPopoverPayload,
} from "@/app/modals/lib/eventPopoverFormatters";
import { SystemPromptModal } from "@/app/modals/SystemPromptModal";
import {
	buildSystemPromptTimeoutLoadState,
	isValidRawLLMTraceFile,
	SYSTEM_PROMPT_LOAD_TIMEOUT_MS,
	resolveRawLLMTraceFile,
	resolveSystemPromptCalls,
	resolveSystemPromptTextFromRequestBody,
	resolveSystemPromptTextFromTraceText,
	type SystemPromptLoadState,
} from "@/app/modals/lib/systemPromptTrace";

type RawJsonlLoader = (chatId: string) => Promise<string>;
type RawLLMTraceLoader = (file: string) => Promise<string>;

function resolveRawJsonlChatId(
	event: AgentEvent | null,
	relatedEvents: RelatedEventEntry[],
): string {
	const eventChatId = readEventIdValue(event || {}, "chatId");
	if (eventChatId) {
		return eventChatId;
	}

	for (const entry of relatedEvents) {
		const relatedChatId = readEventIdValue(entry.event || {}, "chatId");
		if (relatedChatId) {
			return relatedChatId;
		}
	}

	return "";
}

function buildRawJsonlCopyMenuItem(
	chatId: string,
	t: (key: string, params?: Record<string, unknown>) => string,
	loadRawJsonl: RawJsonlLoader = getChatRawJsonl,
): EventCopyMenuItem | null {
	const normalizedChatId = String(chatId || "").trim();
	if (!normalizedChatId) {
		return null;
	}

	return {
		key: "rawJsonl",
		label: t("eventPopover.copy.rawJsonl"),
		text: "",
		loadText: () => loadRawJsonl(normalizedChatId),
	};
}

const RAW_JSONL_COPY_EXCLUDED_EVENT_TYPES = new Set([
	"request.query",
	"usage.snapshot",
	"debug.llmchat",
]);

function shouldIncludeRawJsonlCopyItem(event: AgentEvent | null): boolean {
	const type = String(event?.type || "").toLowerCase();
	if (!type) {
		return false;
	}
	return !RAW_JSONL_COPY_EXCLUDED_EVENT_TYPES.has(type);
}

function buildRawLLMTraceCopyMenuItem(
	file: string,
	t: (key: string, params?: Record<string, unknown>) => string,
	loadRawLLMTrace: RawLLMTraceLoader = getChatLLMTraceRaw,
): EventCopyMenuItem | null {
	const normalizedFile = String(file || "").trim();
	if (!isValidRawLLMTraceFile(normalizedFile)) {
		return null;
	}

	return {
		key: "rawLlmJson",
		label: t("eventPopover.copy.rawLlmJson"),
		text: "",
		loadText: () => loadRawLLMTrace(normalizedFile),
	};
}

const useIsomorphicLayoutEffect =
	typeof window === "undefined" ? useEffect : useLayoutEffect;

export const EventPopover: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const { t } = useI18n();
	const popoverRef = useRef<HTMLDivElement | null>(null);
	const copyTimerRef = useRef<Map<string, number>>(new Map());
	const [popoverState, setPopoverState] = useState(() =>
		resolveInitialPopoverState(state.eventPopoverEventRef),
	);
	const [copyStatus, setCopyStatus] = useState<Record<string, CopyFeedbackState>>({});
	const [lastCopyItem, setLastCopyItem] = useState<CopyMenuItemState>(
		() => buildDefaultCopyMenuItem(t),
	);
	const [copyMenuOpen, setCopyMenuOpen] = useState(false);
	const [systemPromptOpen, setSystemPromptOpen] = useState(false);
	const [selectedSystemPromptCallId, setSelectedSystemPromptCallId] =
		useState("");
	const [systemPromptLoadStates, setSystemPromptLoadStates] = useState<
		Record<string, SystemPromptLoadState>
	>({});
	const [position, setPosition] = useState({ top: 80, right: 320 });
	const isOpen = state.eventPopoverIndex >= 0 && !!state.eventPopoverEventRef;
	const event = state.eventPopoverEventRef;
	const groupMeta = useMemo(() => resolveEventGroupMeta(event), [event]);
	const relatedEvents = useMemo<RelatedEventEntry[]>(() => {
		if (!event) return [];
		if (!groupMeta) {
			return [{ event, index: state.eventPopoverIndex }];
		}

		const matches = state.debugEvents.flatMap((candidate, index) => {
			const candidateGroupMeta = resolveEventGroupMeta(candidate);
			if (
				!candidateGroupMeta ||
				candidateGroupMeta.family !== groupMeta.family ||
				candidateGroupMeta.idKey !== groupMeta.idKey ||
				candidateGroupMeta.idValue !== groupMeta.idValue
			) {
				return [];
			}

			return [{ event: candidate, index }];
		});

		return matches.length > 0
			? matches
			: [{ event, index: state.eventPopoverIndex }];
	}, [event, groupMeta, state.eventPopoverIndex, state.debugEvents]);
	const activeRelatedIndex = useMemo(() => {
		if (!event) return -1;

		const indexMatch = relatedEvents.findIndex(
			(entry) => entry.index === state.eventPopoverIndex,
		);
		if (indexMatch >= 0) return indexMatch;

		return relatedEvents.findIndex((entry) => entry.event === event);
	}, [event, relatedEvents, state.eventPopoverIndex]);
	const switcherSignature = useMemo(
		() => relatedEvents.map((entry) => entry.index).join(","),
		[relatedEvents],
	);
	const collectibleRelatedEvents = useMemo(
		() => getCollectibleRelatedEvents(event, groupMeta, relatedEvents),
		[event, groupMeta, relatedEvents],
	);
	const rawJsonlChatId = useMemo(
		() => resolveRawJsonlChatId(event, relatedEvents),
		[event, relatedEvents],
	);
	const rawLLMTraceFile = useMemo(
		() => resolveRawLLMTraceFile(event),
		[event],
	);
	const copyMenuItems = useMemo(() => {
		const items = buildEventCopyMenuItems(
			event,
			relatedEvents,
			popoverState.rawJsonStr,
			t,
		);
		const rawLLMTraceItem = buildRawLLMTraceCopyMenuItem(rawLLMTraceFile, t);
		const rawJsonlItem = buildRawJsonlCopyMenuItem(rawJsonlChatId, t);
		const includeRawJsonl = shouldIncludeRawJsonlCopyItem(event);
		return [
			...items,
			...(rawLLMTraceItem ? [rawLLMTraceItem] : []),
			...(rawJsonlItem && includeRawJsonl ? [rawJsonlItem] : []),
		];
	}, [event, relatedEvents, rawJsonlChatId, rawLLMTraceFile, popoverState.rawJsonStr, t]);
	const primaryCopyMenuItem = useMemo(
		() => getPrimaryCopyMenuItem(copyMenuItems),
		[copyMenuItems],
	);
	const systemPromptCalls = useMemo(
		() => resolveSystemPromptCalls(event, state.debugEvents),
		[event, state.debugEvents],
	);
	const selectedSystemPromptCall = useMemo(
		() =>
			systemPromptCalls.find(
				(call) => call.id === selectedSystemPromptCallId,
			) || systemPromptCalls[0],
		[systemPromptCalls, selectedSystemPromptCallId],
	);
	const selectedSystemPromptLoadStatus = selectedSystemPromptCall
		? systemPromptLoadStates[selectedSystemPromptCall.id]?.status
		: undefined;

	useEffect(() => {
		setPopoverState(resolveInitialPopoverState(event));
		copyTimerRef.current.forEach((timer) => window.clearTimeout(timer));
		copyTimerRef.current.clear();
		setCopyStatus({});
		setLastCopyItem(buildDefaultCopyMenuItem(t));
		setCopyMenuOpen(false);
		setSystemPromptOpen(false);
		setSelectedSystemPromptCallId("");
		setSystemPromptLoadStates({});
	}, [event, t]);

	useEffect(() => {
		if (!systemPromptOpen) {
			return;
		}
		if (systemPromptCalls.length === 0) {
			setSelectedSystemPromptCallId("");
			return;
		}
		if (
			!selectedSystemPromptCallId ||
			!systemPromptCalls.some((call) => call.id === selectedSystemPromptCallId)
		) {
			setSelectedSystemPromptCallId(systemPromptCalls[0].id);
		}
	}, [systemPromptOpen, systemPromptCalls, selectedSystemPromptCallId]);

	useEffect(() => {
		if (
			!systemPromptOpen ||
			!selectedSystemPromptCall ||
			!selectedSystemPromptCall.traceFile ||
			selectedSystemPromptLoadStatus === "loading" ||
			selectedSystemPromptLoadStatus === "ready" ||
			selectedSystemPromptLoadStatus === "empty"
		) {
			return;
		}

		let cancelled = false;
		const callId = selectedSystemPromptCall.id;
		const traceFile = selectedSystemPromptCall.traceFile;
		const timeout = window.setTimeout(() => {
			if (cancelled) return;
			cancelled = true;
			setSystemPromptLoadStates((current) => ({
				...current,
				[callId]: buildSystemPromptTimeoutLoadState(
					t("eventPopover.systemPromptModal.timeout"),
				),
			}));
		}, SYSTEM_PROMPT_LOAD_TIMEOUT_MS);
		setSystemPromptLoadStates((current) => ({
			...current,
			[callId]: { status: "loading" },
		}));
		void getChatLLMTraceRaw(traceFile)
			.then((rawText) => resolveSystemPromptTextFromTraceText(rawText))
			.then((text) => {
				if (cancelled) return;
				window.clearTimeout(timeout);
				setSystemPromptLoadStates((current) => ({
					...current,
					[callId]: text
						? { status: "ready", text }
						: { status: "empty" },
				}));
			})
			.catch((error) => {
				if (cancelled) return;
				window.clearTimeout(timeout);
				setSystemPromptLoadStates((current) => ({
					...current,
					[callId]: {
						status: "error",
						message: error instanceof Error ? error.message : String(error || ""),
					},
				}));
			});

		return () => {
			cancelled = true;
			window.clearTimeout(timeout);
		};
	}, [
		systemPromptOpen,
		selectedSystemPromptCall,
		t,
	]);

	useEffect(() => {
		return () => {
			copyTimerRef.current.forEach((timer) => window.clearTimeout(timer));
			copyTimerRef.current.clear();
		};
	}, []);

	useIsomorphicLayoutEffect(() => {
		if (!isOpen) return;
		const el = popoverRef.current;
		if (!el) return;

		const updatePosition = () => {
			const margin = 8;
			const viewW = window.innerWidth;
			const viewH = window.innerHeight;
			const width = Math.min(420, Math.max(260, viewW - margin * 2));
			el.style.width = `${width}px`;

			const anchor = state.eventPopoverAnchor ?? {
				x: Math.max(margin, viewW - width - margin),
				y: 80,
			};

			const height = el.offsetHeight || 320;
			const maxTop = Math.max(margin, viewH - height - margin);
			const top = Math.max(margin, Math.min(anchor.y + 8, maxTop));
			const maxLeft = Math.max(margin, viewW - width - margin);
			const left = Math.max(margin, Math.min(anchor.x, maxLeft));
			const right = Math.max(margin, viewW - left - width);
			setPosition({ top, right });
		};

		updatePosition();
		window.addEventListener("resize", updatePosition);
		return () => window.removeEventListener("resize", updatePosition);
	}, [isOpen, popoverState.displayJsonStr, state.eventPopoverAnchor, switcherSignature]);

	if (!isOpen || !event) {
		return null;
	}

	const seq = event.seq ?? "-";
	const groupSummary = groupMeta
		? `${groupMeta.idKey}: ${groupMeta.idValue}`
		: t("eventPopover.group.unknown");
	const showSwitcher = relatedEvents.length > 1;
	const showCollect = collectibleRelatedEvents.length > 1;
	const copyIcon =
		copyStatus[lastCopyItem.key] === "copied" ? "check" : "content_copy";
	const readableTimestamp = formatReadableTimestamp(
		resolveDisplayPayloadTimestamp(popoverState.payload),
	);

	const handleCopy = (item: EventCopyMenuItem) => {
		const { key, label } = item;
		if (!item.text && !item.loadText) {
			return;
		}
		setLastCopyItem({ key, label: stripCopyPrefix(label) });
		const textPromise = item.loadText
			? item.loadText()
			: Promise.resolve(item.text);
		void textPromise
			.then((text) => copyText(text))
			.then(() => {
				const existing = copyTimerRef.current.get(key);
				if (existing) {
					window.clearTimeout(existing);
				}
				setCopyStatus((current) => ({ ...current, [key]: "copied" }));
				const timer = window.setTimeout(() => {
					setCopyStatus((current) => ({ ...current, [key]: "idle" }));
					copyTimerRef.current.delete(key);
				}, 1600);
				copyTimerRef.current.set(key, timer);
			})
			.catch(() => {
				const existing = copyTimerRef.current.get(key);
				if (existing) {
					window.clearTimeout(existing);
				}
				setCopyStatus((current) => ({ ...current, [key]: "error" }));
				const timer = window.setTimeout(() => {
					setCopyStatus((current) => ({ ...current, [key]: "idle" }));
					copyTimerRef.current.delete(key);
				}, 1600);
				copyTimerRef.current.set(key, timer);
			});
	};

	const copyMenuTitle = buildCopyMenuTitle(lastCopyItem, copyStatus, t);
	const openSystemPrompt = () => {
		if (systemPromptCalls[0]) {
			setSelectedSystemPromptCallId(systemPromptCalls[0].id);
		}
		setSystemPromptOpen(true);
	};

	return (
		<div
			ref={popoverRef}
			className="event-popover"
			id="event-popover"
			onDoubleClick={() => {
				if (primaryCopyMenuItem) {
					handleCopy(primaryCopyMenuItem);
				}
			}}
			title={t("eventPopover.title.doubleClickCopy")}
			style={{
				top: `${position.top}px`,
				right: `${position.right}px`,
				width: `min(420px, calc(100vw - 16px))`,
			}}
		>
			<div className="event-popover-head">
				<div className="event-popover-head-main">
					<strong>{`#${seq} ${event.type}`}</strong>
					<span className="event-popover-meta">
						{showSwitcher && activeRelatedIndex >= 0
							? `${groupSummary} · ${activeRelatedIndex + 1}/${relatedEvents.length}`
							: groupSummary}
					</span>
					<span className="event-popover-meta">
						{t("eventPopover.meta.time", { time: readableTimestamp })}
					</span>
				</div>
				<div className="event-popover-actions">
					{showCollect && (
						<UiButton
							className="event-popover-action-btn"
							variant="ghost"
							size="sm"
							iconOnly
							aria-label={t("eventPopover.action.collectSnapshot")}
							title={t("eventPopover.action.collectSnapshot")}
							onClick={() => {
								const payload = buildCollectedSnapshot(event, collectibleRelatedEvents);
								const rawJsonStr = stringifyPopoverPayload(payload);
								setPopoverState({
									payload,
									rawJsonStr,
									displayJsonStr: rawJsonStr,
								});
							}}
						>
							<MaterialIcon name="inventory_2" />
						</UiButton>
					)}
					<Popover
						open={copyMenuOpen}
						trigger="click"
						placement="bottomRight"
						arrow={false}
						classNames={{
							root: "event-popover-copy-menu-overlay",
						}}
						onOpenChange={setCopyMenuOpen}
						content={
							<div className="event-popover-copy-menu" role="menu" aria-label={t("eventPopover.copy.menuAria")}>
								{copyMenuItems.map((item) => (
									<UiButton
										key={item.key}
										variant="ghost"
										size="sm"
										className="event-popover-copy-menu-item"
										aria-label={item.label}
										title={item.label}
										onClick={() => {
											setCopyMenuOpen(false);
											handleCopy(item);
										}}
									>
										{item.label}
									</UiButton>
								))}
							</div>
						}
					>
						<UiButton
							className="event-popover-action-btn"
							variant="ghost"
							size="sm"
							iconOnly
							aria-label={t("eventPopover.copy.openMenu")}
							aria-haspopup="menu"
							aria-expanded={copyMenuOpen}
							title={copyMenuTitle}
						>
							<MaterialIcon name={copyIcon} />
						</UiButton>
					</Popover>
					{systemPromptCalls.length > 0 && (
						<UiButton
							className="event-popover-action-btn event-popover-system-action"
							variant="ghost"
							size="sm"
							iconOnly
							aria-label={t("eventPopover.action.systemPrompt")}
							title={t("eventPopover.action.systemPrompt")}
							onClick={openSystemPrompt}
						>
							<MaterialIcon name="subject" />
						</UiButton>
					)}
					<UiButton
						className="event-popover-action-btn event-popover-close"
						variant="ghost"
						size="sm"
						iconOnly
						aria-label={t("eventPopover.close")}
						title={t("eventPopover.close")}
						onClick={() =>
							dispatch({
								type: "SET_EVENT_POPOVER",
								index: -1,
								event: null,
								anchor: null,
							})
						}
					>
						<MaterialIcon name="close" />
					</UiButton>
				</div>
			</div>
			<pre className="event-popover-body">{popoverState.displayJsonStr}</pre>
			<SystemPromptModal
				calls={systemPromptCalls}
				loadStates={systemPromptLoadStates}
				open={systemPromptOpen}
				selectedCallId={selectedSystemPromptCallId}
				onClose={() => setSystemPromptOpen(false)}
				onSelectCall={setSelectedSystemPromptCallId}
			/>
		</div>
	);
};

export const __TEST_ONLY__ = {
	canCollectEvent,
	copyText,
	formatReadableTimestamp,
	getCollectibleRelatedEvents,
	buildCollectedSnapshot,
	mapCollectedSnapshotType,
	resolveEventGroupMeta,
	resolveSystemPromptCalls,
	resolveSystemPromptTextFromTraceText,
	resolveSystemPromptTextFromRequestBody,
	buildSystemPromptTimeoutLoadState,
	SYSTEM_PROMPT_LOAD_TIMEOUT_MS,
	resolveRawJsonlChatId,
	buildRawJsonlCopyMenuItem,
	resolveRawLLMTraceFile,
	buildRawLLMTraceCopyMenuItem,
	isValidRawLLMTraceFile,
	buildEventCopyMenuItems,
	buildCopyMenuTitle,
	getPrimaryCopyMenuItem,
	resolveInitialPopoverState,
	stringifyPopoverPayload,
	shouldIncludeRawJsonlCopyItem,
};
